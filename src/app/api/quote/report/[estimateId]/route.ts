import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCostPdf } from "@/lib/quote/report-pdf";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  const { estimateId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: estimate, error: estError } = await admin
    .from("cost_estimates")
    .select("id, status, summary, total_traditional, total_mmc, total_savings_pct, region, traditional_duration_weeks, mmc_duration_weeks, completed_at, project_id")
    .eq("id", estimateId)
    .single();

  if (estError || !estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  if (estimate.status !== "completed") {
    return NextResponse.json({ error: "Report not yet completed" }, { status: 400 });
  }

  const { data: project } = await admin
    .from("projects")
    .select("name, address")
    .eq("id", estimate.project_id)
    .single();

  const { data: lineItems } = await admin
    .from("cost_line_items")
    .select("*")
    .eq("estimate_id", estimateId)
    .order("sort_order", { ascending: true });

  const pdfBytes = generateCostPdf({
    projectName: project?.name ?? "Untitled Project",
    projectAddress: project?.address ?? null,
    summary: estimate.summary ?? "",
    totalTraditional: estimate.total_traditional ?? 0,
    totalMmc: estimate.total_mmc ?? 0,
    totalSavingsPct: estimate.total_savings_pct,
    region: estimate.region,
    completedAt: estimate.completed_at ?? new Date().toISOString(),
    traditionalDurationWeeks: estimate.traditional_duration_weeks ?? null,
    mmcDurationWeeks: estimate.mmc_duration_weeks ?? null,
    lineItems: (lineItems ?? []) as {
      cost_category: string;
      element_description: string;
      quantity: number | null;
      unit: string | null;
      traditional_rate: number | null;
      traditional_total: number | null;
      mmc_rate: number | null;
      mmc_total: number | null;
      mmc_alternative: string | null;
      savings_pct: number | null;
      source: string;
      confidence: number;
      rate_source_name: string | null;
    }[],
  });

  const projectSlug = (project?.name ?? "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mmc-quote-${projectSlug}-${estimateId.slice(0, 8)}.pdf"`,
    },
  });
}
