import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBuildPdf } from "@/lib/build/report-pdf";
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

  const { data: check, error: checkError } = await admin
    .from("design_checks")
    .select("id, status, summary, completed_at, project_id")
    .eq("id", checkId)
    .single();

  if (checkError || !check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  if (check.status !== "completed") {
    return NextResponse.json({ error: "Report not yet completed" }, { status: 400 });
  }

  const { data: project } = await admin
    .from("projects")
    .select("name, address")
    .eq("id", check.project_id)
    .single();

  const { data: suggestions } = await admin
    .from("design_suggestions")
    .select("*")
    .eq("check_id", checkId)
    .order("sort_order", { ascending: true });

  const pdfBytes = generateBuildPdf({
    projectName: project?.name ?? "Untitled Project",
    projectAddress: project?.address ?? null,
    summary: check.summary ?? "",
    completedAt: check.completed_at ?? new Date().toISOString(),
    suggestions: (suggestions ?? []) as {
      technology_category: string;
      current_approach: string;
      suggested_alternative: string;
      benefits: string;
      estimated_time_savings: number | null;
      estimated_cost_savings: number | null;
      estimated_waste_reduction: number | null;
      implementation_complexity: string;
      confidence: number;
    }[],
  });

  const projectSlug = (project?.name ?? "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mmc-build-${projectSlug}-${checkId.slice(0, 8)}.pdf"`,
    },
  });
}
