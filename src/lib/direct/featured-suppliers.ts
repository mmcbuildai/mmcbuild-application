// SCRUM-171: which supplier tier gets its products surfaced inside Build
// suggestions, and how the matched products are grouped per MMC category. Pure
// so the tier gate + the "up to 3 per category" cap are unit-testable.

import type { MmcTechnologyCategory } from "@/lib/ai/types";

export type SupplierTier = "free" | "verified" | "growth_partner";

export const SUPPLIER_TIERS: { key: SupplierTier; label: string; description: string }[] = [
  { key: "free", label: "Free", description: "Self-signup listing, directory only." },
  {
    key: "verified",
    label: "Verified Supplier",
    description: "Paid directory listing — no Build lead referrals.",
  },
  {
    key: "growth_partner",
    label: "Growth Partner",
    description: "Products surface inside Build suggestions (lead referrals).",
  },
];

/** Only this tier has its products surfaced inline on Build suggestions. */
export const FEATURED_TIER: SupplierTier = "growth_partner";

export function isFeaturedTier(tier: string | null | undefined): boolean {
  return tier === FEATURED_TIER;
}

export function supplierTierLabel(tier: string | null | undefined): string {
  return SUPPLIER_TIERS.find((t) => t.key === tier)?.label ?? "Free";
}

/** A featured product ready to render under a suggestion. */
export interface FeaturedProduct {
  product_id: string;
  professional_id: string;
  company_name: string;
  technology_category: string;
  name: string;
  summary: string | null;
  sku: string | null;
  price_estimate: number | null;
  lead_time_days: number | null;
}

/**
 * Group already-filtered featured products by MMC category, capping each
 * category at `maxPerCategory` (default 3, per the ticket). Input is assumed to
 * already be restricted to the featured tier + active + approved (done in SQL);
 * this only shapes + caps. Pure.
 */
export function groupFeaturedByCategory(
  products: FeaturedProduct[],
  maxPerCategory = 3,
): Record<string, FeaturedProduct[]> {
  const out: Record<string, FeaturedProduct[]> = {};
  for (const p of products) {
    const list = out[p.technology_category] ?? (out[p.technology_category] = []);
    if (list.length < maxPerCategory) list.push(p);
  }
  return out;
}

/** The categories present in a suggestion set — the join keys to query. */
export function distinctCategories(
  suggestions: { technology_category?: string | null }[],
): MmcTechnologyCategory[] {
  return [
    ...new Set(
      suggestions.map((s) => s.technology_category).filter(Boolean) as string[],
    ),
  ] as MmcTechnologyCategory[];
}
