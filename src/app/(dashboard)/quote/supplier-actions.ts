"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { inngest } from "@/lib/inngest/client";
import { getTechnologyLabel } from "@/lib/ai/types";
import {
  capSupplierSelection,
  type SupplierComparisonStatus,
  type SupplierQuoteVariant,
} from "@/lib/quote/supplier-comparison";
import { requestSupplierComparisonSchema } from "@/lib/validators/supplier-comparison";

// SCRUM-172 — server actions for the multi-supplier comparison quote. All reads
// go through db() (RLS-bypass, tables not in generated types) and are org-scoped
// explicitly: every caller-supplied projectId / comparisonId is checked against
// the caller's profile.org_id before any project-scoped data is returned.

export interface SupplierProductOption {
  product_id: string;
  professional_id: string;
  company_name: string;
  name: string;
  summary: string | null;
  sku: string | null;
  price_estimate: number | null;
  lead_time_days: number | null;
}

export interface SupplierCategoryOption {
  category: string;
  label: string;
  products: SupplierProductOption[];
}

export interface SupplierComparisonRecord {
  id: string;
  project_id: string;
  technology_category: string;
  region: string | null;
  status: SupplierComparisonStatus;
  summary: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Resolve the caller's org, returning null when unauthenticated / no profile. */
async function callerOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  return (profile as { org_id: string } | null)?.org_id ?? null;
}

/**
 * The supplier products available to compare, grouped by MMC technology
 * category. Sourced from the approved+active supplier_products marketplace (a
 * global directory read — any approved supplier can be compared, not just the
 * Growth-Partner featured tier). Only categories with ≥1 product are returned.
 */
export async function getSupplierComparisonOptions(
  projectId: string,
): Promise<SupplierCategoryOption[]> {
  const orgId = await callerOrgId();
  if (!orgId) return [];

  // Ownership: the project must belong to the caller's org.
  const { data: project } = await db()
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || (project as { org_id: string }).org_id !== orgId) return [];

  const { data: products } = await db()
    .from("supplier_products")
    .select(
      "id, professional_id, technology_category, name, summary, sku, price_estimate, lead_time_days, professionals!inner(company_name, status)",
    )
    .eq("is_active", true)
    .eq("professionals.status", "approved")
    .order("technology_category", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (products ?? []) as unknown as {
    id: string;
    professional_id: string;
    technology_category: string;
    name: string;
    summary: string | null;
    sku: string | null;
    price_estimate: number | null;
    lead_time_days: number | null;
    professionals: { company_name: string } | null;
  }[];

  const byCategory = new Map<string, SupplierProductOption[]>();
  for (const p of rows) {
    const list = byCategory.get(p.technology_category) ?? [];
    list.push({
      product_id: p.id,
      professional_id: p.professional_id,
      company_name: p.professionals?.company_name ?? "Supplier",
      name: p.name,
      summary: p.summary,
      sku: p.sku,
      price_estimate: p.price_estimate,
      lead_time_days: p.lead_time_days,
    });
    byCategory.set(p.technology_category, list);
  }

  return [...byCategory.entries()].map(([category, products]) => ({
    category,
    label: getTechnologyLabel(category),
    products,
  }));
}

/**
 * Kick off a comparison: seed one variant per selected supplier product and
 * fire the Inngest fan-out. Enforces the ≤3 cap, ownership, and a
 * per-(project, category) duplicate-run guard.
 */
export async function requestSupplierComparison(rawInput: {
  projectId: string;
  technologyCategory: string;
  productIds: string[];
  region?: string;
}): Promise<{ comparisonId: string } | { error: string; comparisonId?: string }> {
  const parsed = requestSupplierComparisonSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const { projectId, technologyCategory, region } = parsed.data;
  const productIds = capSupplierSelection(parsed.data.productIds);

  const orgId = await callerOrgId();
  if (!orgId) return { error: "Not authenticated" };

  // Resolve the caller's profile id for created_by (org already proven above).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user!.id)
    .single();
  const profile = profileRow as { id: string; org_id: string } | null;
  if (!profile || profile.org_id !== orgId) return { error: "Not authenticated" };

  // Ownership: the project must belong to the caller's org.
  const { data: project } = await db()
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || (project as { org_id: string }).org_id !== orgId) {
    return { error: "Project not found" };
  }

  // Duplicate-run guard: don't spawn a second comparison for the same component
  // while one is already running (mirrors the cost-estimate guard).
  const { data: inFlight } = await db()
    .from("supplier_quote_comparisons")
    .select("id")
    .eq("project_id", projectId)
    .eq("technology_category", technologyCategory)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inFlight) {
    return {
      error: "already_running",
      comparisonId: (inFlight as { id: string }).id,
    };
  }

  // Validate the selected products: they must be active, from approved
  // suppliers, and in the requested category. Reject if any is missing.
  const { data: products } = await db()
    .from("supplier_products")
    .select(
      "id, professional_id, technology_category, name, summary, sku, price_estimate, lead_time_days, is_active, professionals!inner(company_name, status)",
    )
    .in("id", productIds)
    .eq("is_active", true)
    .eq("technology_category", technologyCategory)
    .eq("professionals.status", "approved");

  const validProducts = (products ?? []) as unknown as {
    id: string;
    professional_id: string;
    name: string;
    summary: string | null;
    sku: string | null;
    price_estimate: number | null;
    lead_time_days: number | null;
    professionals: { company_name: string } | null;
  }[];

  if (validProducts.length === 0) {
    return { error: "None of the selected suppliers are available." };
  }

  // Create the comparison run (org-stamped).
  const { data: comparison, error: cmpError } = await db()
    .from("supplier_quote_comparisons")
    .insert({
      project_id: projectId,
      org_id: orgId,
      technology_category: technologyCategory,
      region: region ?? "NSW",
      status: "queued",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (cmpError || !comparison) {
    return {
      error: `Failed to create comparison: ${(cmpError as { message?: string })?.message ?? "unknown"}`,
    };
  }
  const comparisonId = (comparison as { id: string }).id;

  // Seed the variants (denormalised supplier/product identity).
  const variantRows = validProducts.map((p, i) => ({
    comparison_id: comparisonId,
    org_id: orgId,
    professional_id: p.professional_id,
    product_id: p.id,
    supplier_name: p.professionals?.company_name ?? "Supplier",
    product_name: p.name,
    sku: p.sku,
    summary: p.summary,
    base_price_estimate: p.price_estimate,
    lead_time_days: p.lead_time_days,
    sort_order: i,
  }));
  const { error: varError } = await db()
    .from("supplier_quote_variants")
    .insert(variantRows);
  if (varError) {
    // Roll the comparison back to error so it doesn't hang as queued.
    await db()
      .from("supplier_quote_comparisons")
      .update({ status: "error", summary: "Failed to record selected suppliers." })
      .eq("id", comparisonId);
    return { error: (varError as { message: string }).message };
  }

  await inngest.send({
    name: "quote/supplier-comparison.requested",
    data: { comparisonId },
  });

  return { comparisonId };
}

/** Org-scoped read of a comparison + its variants (for the result view/poll). */
export async function getSupplierComparison(comparisonId: string): Promise<{
  comparison: SupplierComparisonRecord | null;
  variants: SupplierQuoteVariant[];
}> {
  const orgId = await callerOrgId();
  if (!orgId) return { comparison: null, variants: [] };

  const { data: cmp } = await db()
    .from("supplier_quote_comparisons")
    .select(
      "id, org_id, project_id, technology_category, region, status, summary, created_at, completed_at",
    )
    .eq("id", comparisonId)
    .single();

  const record = cmp as (SupplierComparisonRecord & { org_id: string }) | null;
  if (!record || record.org_id !== orgId) {
    return { comparison: null, variants: [] };
  }

  const { data: variants } = await db()
    .from("supplier_quote_variants")
    .select(
      "id, professional_id, product_id, supplier_name, product_name, sku, summary, base_price_estimate, lead_time_days, quantity, unit, unit_rate, estimated_total, confidence, notes, delta_vs_lowest_pct, is_lowest, sort_order",
    )
    .eq("comparison_id", comparisonId)
    .order("sort_order", { ascending: true });

  return {
    comparison: {
      id: record.id,
      project_id: record.project_id,
      technology_category: record.technology_category,
      region: record.region,
      status: record.status,
      summary: record.summary,
      created_at: record.created_at,
      completed_at: record.completed_at,
    },
    variants: (variants ?? []) as SupplierQuoteVariant[],
  };
}

/** Org-scoped list of a project's past comparisons (for the Quote page). */
export async function getProjectSupplierComparisons(
  projectId: string,
): Promise<SupplierComparisonRecord[]> {
  const orgId = await callerOrgId();
  if (!orgId) return [];

  const { data } = await db()
    .from("supplier_quote_comparisons")
    .select(
      "id, project_id, technology_category, region, status, summary, created_at, completed_at",
    )
    .eq("project_id", projectId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return (data ?? []) as SupplierComparisonRecord[];
}
