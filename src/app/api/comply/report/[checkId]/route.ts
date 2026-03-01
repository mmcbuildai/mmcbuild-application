import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCompliancePdf } from "@/lib/comply/report-pdf";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ checkId: string }> }
) {
  const { checkId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Load check with project info
  const { data: check, error: checkError } = await admin
    .from("compliance_checks")
    .select("id, status, summary, overall_risk, completed_at, project_id")
    .eq("id", checkId)
    .single();

  if (checkError || !check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  if (check.status !== "completed") {
    return NextResponse.json(
      { error: "Report not yet completed" },
      { status: 400 }
    );
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

  const pdfBytes = generateCompliancePdf({
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
  });

  const projectSlug = (project?.name ?? "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mmc-comply-${projectSlug}-${checkId.slice(0, 8)}.pdf"`,
    },
  });
}
