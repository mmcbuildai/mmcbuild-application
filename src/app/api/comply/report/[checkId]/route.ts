import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCompliancePdf } from "@/lib/comply/report-pdf";
import { generateComplianceDocx } from "@/lib/comply/report-docx";
import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ checkId: string }> }
) {
  const { checkId } = await params;
  const format = new URL(request.url).searchParams.get("format") === "docx" ? "docx" : "pdf";

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

  // Load check with project info
  const { data: check, error: checkError } = await admin
    .from("compliance_checks")
    .select("id, status, summary, overall_risk, completed_at, project_id, org_id")
    .eq("id", checkId)
    .single();

  if (checkError || !check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  // Cross-tenant isolation (SCRUM-342): admin bypasses RLS — the check must
  // belong to the caller's org, else this exports another org's compliance
  // report. Same 404 as not-found (no existence leak).
  if ((check as { org_id: string }).org_id !== profile.org_id) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  // Load project
  const { data: project } = await admin
    .from("projects")
    .select("name, address")
    .eq("id", check.project_id)
    .single();

  // Load findings
  const { data: findings } = await admin
    .from("compliance_findings")
    .select("*")
    .eq("check_id", checkId)
    .order("sort_order", { ascending: true });

  // Export is allowed as long as the run produced findings — a user can export a
  // report WITH unresolved/non-compliant items (e.g. to take to a meeting), and
  // even an errored run with partial findings is exportable. Block only when the
  // check is genuinely not ready (still running / nothing produced yet), with an
  // honest reason rather than a generic "failed".
  const hasFindings = (findings?.length ?? 0) > 0;
  if (check.status !== "completed" && !hasFindings) {
    const reason =
      check.status === "queued" || check.status === "processing"
        ? "The compliance check is still running — wait for it to finish before exporting."
        : "This compliance check didn't produce a report (the run failed before any findings were generated). Re-run the check, then export.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const reportInput = {
    projectName: project?.name ?? "Untitled Project",
    projectAddress: project?.address ?? null,
    summary: check.summary ?? "",
    overallRisk: check.overall_risk ?? "medium",
    completedAt: check.completed_at ?? new Date().toISOString(),
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
  };

  const projectSlug = (project?.name ?? "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");

  // Look up version number for this check
  const { data: version } = await db()
    .from("report_versions")
    .select("version_number")
    .eq("source_id", checkId)
    .eq("module", "comply")
    .single();
  const vNum = (version as { version_number: number } | null)?.version_number;
  const vSuffix = vNum ? `-v${vNum}` : `-${checkId.slice(0, 8)}`;

  if (format === "docx") {
    const docxBytes = await generateComplianceDocx(reportInput);
    return new NextResponse(new Uint8Array(docxBytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="mmc-comply-${projectSlug}${vSuffix}.docx"`,
      },
    });
  }

  const pdfBytes = generateCompliancePdf(reportInput);
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mmc-comply-${projectSlug}${vSuffix}.pdf"`,
    },
  });
}
