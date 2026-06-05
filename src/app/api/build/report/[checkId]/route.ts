import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { generateBuildPdf } from "@/lib/build/report-pdf";
import { generateBuildDocx } from "@/lib/build/report-docx";
import { NextResponse } from "next/server";

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

  const admin = db();

  const { data: check, error: checkError } = await admin
    .from("design_checks")
    .select("id, status, summary, completed_at, project_id")
    .eq("id", checkId)
    .single();

  if (checkError || !check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  const rec = check as { id: string; status: string; summary: string | null; completed_at: string | null; project_id: string };

  if (rec.status !== "completed") {
    return NextResponse.json({ error: "Report not yet completed" }, { status: 400 });
  }

  const { data: project } = await admin
    .from("projects")
    .select("name, address")
    .eq("id", rec.project_id)
    .single();

  const { data: suggestions } = await admin
    .from("design_suggestions")
    .select("*")
    .eq("check_id", checkId)
    .order("sort_order", { ascending: true });

  const reportInput = {
    projectName: project?.name ?? "Untitled Project",
    projectAddress: project?.address ?? null,
    summary: rec.summary ?? "",
    completedAt: rec.completed_at ?? new Date().toISOString(),
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
  };

  const projectSlug = (project?.name ?? "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");

  // Look up version number for this check
  const { data: version } = await admin
    .from("report_versions")
    .select("version_number")
    .eq("source_id", checkId)
    .eq("module", "build")
    .single();
  const vNum = (version as { version_number: number } | null)?.version_number;
  const vSuffix = vNum ? `-v${vNum}` : `-${checkId.slice(0, 8)}`;

  if (format === "docx") {
    const docxBytes = await generateBuildDocx(reportInput);
    return new NextResponse(new Uint8Array(docxBytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="mmc-build-${projectSlug}${vSuffix}.docx"`,
      },
    });
  }

  const pdfBytes = generateBuildPdf(reportInput);
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mmc-build-${projectSlug}${vSuffix}.pdf"`,
    },
  });
}
