// SCRUM-172 — multi-supplier comparison quote. Pure helpers so the "≤3 per
// component" cap and the delta-vs-lowest arithmetic are unit-testable without a
// DB or the model. The Inngest fan-out (run-supplier-comparison) and the PDF
// both consume computeVariantDeltas, so the "lowest" flag and the percentage
// deltas are computed in exactly one place.

/** The per-component supplier cap (Karen: "three different people"). */
export const MAX_SUPPLIERS_PER_COMPONENT = 3;

export type SupplierComparisonStatus =
  | "queued"
  | "processing"
  | "completed"
  | "error";

/** A supplier line as stored/priced in a comparison. */
export interface SupplierQuoteVariant {
  id: string;
  professional_id: string | null;
  product_id: string | null;
  supplier_name: string;
  product_name: string;
  sku: string | null;
  summary: string | null;
  base_price_estimate: number | null;
  lead_time_days: number | null;
  quantity: number | null;
  unit: string | null;
  unit_rate: number | null;
  estimated_total: number | null;
  confidence: number | null;
  notes: string | null;
  delta_vs_lowest_pct: number | null;
  is_lowest: boolean;
  sort_order: number;
}

/**
 * Given priced variants, mark the lowest estimated_total and compute each
 * other's percentage delta above it. Rows without a positive estimated_total (a
 * failed price-call) are left with a null delta and is_lowest=false and never
 * become the baseline. Pure + total: returns a new array; the input is
 * untouched. Ties on the lowest total are all flagged is_lowest with delta 0.
 */
export function computeVariantDeltas<
  T extends { estimated_total: number | null },
>(
  variants: T[],
): (T & { delta_vs_lowest_pct: number | null; is_lowest: boolean })[] {
  const pricedTotals = variants
    .map((v) => v.estimated_total)
    .filter((t): t is number => typeof t === "number" && t > 0);

  const lowest =
    pricedTotals.length > 0 ? Math.min(...pricedTotals) : null;

  return variants.map((v) => {
    if (lowest == null || v.estimated_total == null || v.estimated_total <= 0) {
      return { ...v, delta_vs_lowest_pct: null, is_lowest: false };
    }
    const delta = ((v.estimated_total - lowest) / lowest) * 100;
    return {
      ...v,
      delta_vs_lowest_pct: Math.round(delta * 10) / 10,
      is_lowest: v.estimated_total === lowest,
    };
  });
}

/**
 * Enforce the ≤3 cap and drop duplicates, preserving order. Used both in the
 * server action (defence in depth alongside the Zod max) and testable in
 * isolation.
 */
export function capSupplierSelection(productIds: string[]): string[] {
  return [...new Set(productIds)].slice(0, MAX_SUPPLIERS_PER_COMPONENT);
}
