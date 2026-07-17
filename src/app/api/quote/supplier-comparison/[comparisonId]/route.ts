import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { getTechnologyLabel } from "@/lib/ai/types";
import {
  generateSupplierComparisonPdf,
  type ComparisonPdfVariant,
} from "@/lib/quote/supplier-comparison-pdf";
import { NextResponse } from "next/server";

// SCRUM-172 — download the multi-supplier comparison as a parallel-column PDF.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ comparisonId: string }> },
) {
  const { comparisonId } = await params;

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
  const orgId = (profile as { org_id: string }).org_id;

  const { data: cmp, error: cmpError } = await db()
    .from("supplier_quote_comparisons")
    .select(
      "id, org_id, project_id, technology_category, region, status, summary, completed_at",
    )
    .eq("id", comparisonId)
    .single();

  if (cmpError || !cmp) {
    return NextResponse.json({ error: "Comparison not found" }, { status: 404 });
  }
  const rec = cmp as {
    id: string;
    org_id: string;
    project_id: string;
    technology_category: string;
    region: string | null;
    status: string;
    summary: string | null;
    completed_at: string | null;
  };

  // Cross-tenant isolation: db() bypasses RLS — the comparison must belong to the
  // caller's org, else this exports another org's supplier pricing.
  if (rec.org_id !== orgId) {
    return NextResponse.json({ error: "Comparison not found" }, { status: 404 });
  }
  if (rec.status !== "completed") {
    return NextResponse.json(
      { error: "Comparison not yet completed" },
      { status: 400 },
    );
  }

  const { data: project } = await db()
    .from("projects")
    .select("name, address")
    .eq("id", rec.project_id)
    .single();

  const { data: variants } = await db()
    .from("supplier_quote_variants")
    .select(
      "supplier_name, product_name, sku, estimated_total, unit_rate, quantity, unit, lead_time_days, confidence, notes, delta_vs_lowest_pct, is_lowest",
    )
    .eq("comparison_id", comparisonId)
    .order("sort_order", { ascending: true });

  const pdfBytes = generateSupplierComparisonPdf({
    projectName: (project as { name?: string } | null)?.name ?? "Untitled Project",
    projectAddress: (project as { address?: string | null } | null)?.address ?? null,
    categoryLabel: getTechnologyLabel(rec.technology_category),
    region: rec.region,
    summary: rec.summary ?? "",
    completedAt: rec.completed_at ?? new Date().toISOString(),
    variants: (variants ?? []) as ComparisonPdfVariant[],
  });

  const projectSlug = ((project as { name?: string } | null)?.name ?? "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");
  const catSlug = rec.technology_category.replace(/_/g, "-");

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mmc-supplier-comparison-${projectSlug}-${catSlug}.pdf"`,
    },
  });
}
