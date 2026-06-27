import { describe, it, expect } from "vitest";
import { computeCostTotals } from "@/lib/quote/totals";

describe("computeCostTotals", () => {
  it("sums the headline from line items (the Karen $0 bug: stored rollup was null)", () => {
    const lineItems = [
      { traditional_total: 100_000, mmc_total: 80_000 },
      { traditional_total: 50_000, mmc_total: 45_000 },
    ];
    // Stored rollup is null — the exact case that showed "$0 at the top".
    const t = computeCostTotals(lineItems, {
      total_traditional: null,
      total_mmc: null,
    });
    expect(t.traditional).toBe(150_000);
    expect(t.mmc).toBe(125_000);
    expect(t.savings).toBe(25_000);
    expect(t.savingsPct).toBe(17); // round(25000/150000*100)
  });

  it("counts TBC (unpriced) items and excludes them from the total", () => {
    const lineItems = [
      { traditional_total: 100_000, mmc_total: 90_000 },
      { traditional_total: null, mmc_total: null }, // TBC
    ];
    const t = computeCostTotals(lineItems, null);
    expect(t.tbcCount).toBe(1);
    expect(t.traditional).toBe(100_000); // TBC item not added
  });

  it("falls back to mmc = traditional when an item has no mmc figure", () => {
    const t = computeCostTotals([{ traditional_total: 200, mmc_total: null }], null);
    expect(t.mmc).toBe(200);
  });

  it("falls back to the stored rollup only when nothing is priced", () => {
    const t = computeCostTotals([{ traditional_total: null, mmc_total: null }], {
      total_traditional: 5_000,
      total_mmc: 4_000,
    });
    expect(t.traditional).toBe(5_000);
    expect(t.mmc).toBe(4_000);
  });

  it("is safe with no line items", () => {
    const t = computeCostTotals([], null);
    expect(t.traditional).toBe(0);
    expect(t.savingsPct).toBe(0);
    expect(t.tbcCount).toBe(0);
  });
});
