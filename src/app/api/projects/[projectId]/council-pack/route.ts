import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCompliancePdf } from "@/lib/comply/report-pdf";
import {
  assembleCouncilPackZip,
  slugify,
  type PackPart,
} from "@/lib/projects/council-pack";
import { NextResponse } from "next/server";

// SCRUM-333 (Phase 1): download a "council-ready pack" — one zip of the
// project's CURRENT drawings + certifications + latest compliance report.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Cross-tenant isolation (SCRUM-342): the project must belong to the caller's org.
  const { data: project } = await admin
    .from("projects")
    .select("name, address, org_id")
    .eq("id", projectId)
    .single();
  if (!project || (project as { org_id: string }).org_id !== profile.org_id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const projectName = (project as { name: string }).name ?? "Project";

  const parts: PackPart[] = [];

  // 1. Current drawings (the latest version of each slot that finished processing).
  const { data: plans } = await admin
    .from("plans")
    .select("*")
    .eq("project_id", projectId)
    .eq("org_id", profile.org_id)
    .eq("is_current", true)
    .in("status", ["ready", "manual_review"]);
  for (const p of (plans ?? []) as unknown as {
    file_name: string;
    file_path: string;
  }[]) {
    const { data: blob } = await admin.storage
      .from("plan-uploads")
      .download(p.file_path);
    if (blob) {
      parts.push({
        path: `drawings/${p.file_name}`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    }
  }

  // 2. Engineering certifications.
  const { data: certs } = await admin
    .from("project_certifications")
    .select("file_name, file_path")
    .eq("project_id", projectId)
    .eq("org_id", profile.org_id);
  for (const c of (certs ?? []) as {
    file_name: string;
    file_path: string;
  }[]) {
    const { data: blob } = await admin.storage
      .from("engineering-certs")
      .download(c.file_path);
    if (blob) {
      parts.push({
        path: `certifications/${c.file_name}`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    }
  }

  // 3. Latest completed compliance report (the headline council document).
  const { data: check } = await admin
    .from("compliance_checks")
    .select("id, summary, overall_risk, completed_at")
    .eq("project_id", projectId)
    .eq("org_id", profile.org_id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (check) {
    const chk = check as {
      id: string;
      summary: string | null;
      overall_risk: string | null;
      completed_at: string | null;
    };
    const { data: findings } = await admin
      .from("compliance_findings")
      .select("*")
      .eq("check_id", chk.id)
      .order("sort_order", { ascending: true });
    const pdf = generateCompliancePdf({
      projectName,
      projectAddress: (project as { address: string | null }).address ?? null,
      summary: chk.summary ?? "",
      overallRisk: (chk.overall_risk ?? "medium") as
        | "low"
        | "medium"
        | "high"
        | "critical",
      completedAt: chk.completed_at ?? new Date().toISOString(),
      findings: (findings ?? []) as {
        ncc_section: string;
        category: string;
        title: string;
        description: string;
        recommendation: string | null;
        severity: "compliant" | "advisory" | "non_compliant" | "critical";
        confidence: number;
        ncc_citation: string | null;
        page_references: number[] | null;
      }[],
    });
    parts.push({
      path: "compliance-report.pdf",
      bytes: new Uint8Array(pdf),
    });
  }

  if (parts.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nothing to compile yet — upload a drawing (and run a compliance check) before downloading the council pack.",
      },
      { status: 400 },
    );
  }

  const zip = await assembleCouncilPackZip(
    projectName,
    parts,
    new Date().toISOString(),
  );

  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slugify(projectName)}-council-pack.zip"`,
    },
  });
}
