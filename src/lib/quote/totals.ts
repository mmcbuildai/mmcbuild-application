export interface CostTotalsLineItem {
  traditional_total: number | null;
  mmc_total: number | null;
  /** Present on the whole-module model; "mmc_*" marks a deterministic build-up line. */
  cost_category?: string | null;
}

export interface CostTotals {
  traditional: number;
  mmc: number;
  savings: number;
  savingsPct: number;
  /** Line items the engine couldn't price (traditional_total is null). */
  tbcCount: number;
}

/**
 * Compute the headline cost totals from the line items themselves, so the figure
 * at the top of the report always equals the sum of the line items shown below
 * — and matches the exported PDF.
 *
 * The stored rollup on `cost_estimates` (total_traditional/total_mmc) was
 * sometimes null/0 — older estimates, re-runs that didn't write it back — which
 * rendered "$0" at the top of the screen while the category subtotals + the
 * exported PDF showed the real numbers (Karen, 2026-06-27). The line items are
 * the source of truth; the stored rollup is only a fallback when nothing is
 * priced yet.
 */
export function computeCostTotals(
  lineItems: CostTotalsLineItem[],
  stored?: {
    total_traditional: number | null;
    total_mmc: number | null;
  } | null,
): CostTotals {
  const isMmcBuildup = (li: CostTotalsLineItem) =>
    (li.cost_category ?? "").startsWith("mmc_");

  // Whole-module model: the traditional trades and the MMC build-up are two
  // DISJOINT sets of line items (a traditional line has no mmc_total; an MMC
  // build-up line has no traditional_total). Sum each side independently — never
  // fall back mmc→traditional, which would double-count against the module rate.
  const hasBuildup = lineItems.some(isMmcBuildup);

  if (hasBuildup) {
    const traditional = lineItems.reduce(
      (s, li) => s + (isMmcBuildup(li) ? 0 : li.traditional_total ?? 0),
      0,
    );
    const mmc = lineItems.reduce(
      (s, li) => s + (isMmcBuildup(li) ? li.mmc_total ?? 0 : 0),
      0,
    );
    const savings = traditional - mmc;
    const savingsPct =
      traditional > 0 ? Math.round((savings / traditional) * 100) : 0;
    // A TBC is a TRADITIONAL trade line we couldn't price — not an MMC line.
    const tbcCount = lineItems.filter(
      (li) => !isMmcBuildup(li) && li.traditional_total == null,
    ).length;
    return { traditional, mmc, savings, savingsPct, tbcCount };
  }

  // Legacy per-trade model (estimates created before the whole-module re-model).
  const fromItemsTraditional = lineItems.reduce(
    (s, li) => s + (li.traditional_total ?? 0),
    0,
  );
  const fromItemsMmc = lineItems.reduce(
    (s, li) => s + (li.mmc_total ?? li.traditional_total ?? 0),
    0,
  );

  const hasPriced = fromItemsTraditional > 0;
  const traditional = hasPriced
    ? fromItemsTraditional
    : (stored?.total_traditional ?? 0);
  const mmc = hasPriced ? fromItemsMmc : (stored?.total_mmc ?? 0);
  const savings = traditional - mmc;
  const savingsPct = traditional > 0 ? Math.round((savings / traditional) * 100) : 0;
  const tbcCount = lineItems.filter((li) => li.traditional_total == null).length;

  return { traditional, mmc, savings, savingsPct, tbcCount };
}
