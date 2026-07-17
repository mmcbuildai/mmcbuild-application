import { describe, it, expect } from "vitest";
import {
  computeVariantDeltas,
  capSupplierSelection,
  MAX_SUPPLIERS_PER_COMPONENT,
} from "@/lib/quote/supplier-comparison";

// SCRUM-172 — TC-QUOTE-001..006: the pure delta-vs-lowest math + the ≤3 cap
// that back the multi-supplier comparison quote.
describe("supplier comparison — computeVariantDeltas", () => {
  it("TC-QUOTE-001: flags the cheapest supplier and computes percentage deltas", () => {
    const out = computeVariantDeltas([
      { estimated_total: 12000 },
      { estimated_total: 10000 },
      { estimated_total: 15000 },
    ]);
    expect(out.map((v) => v.is_lowest)).toEqual([false, true, false]);
    expect(out[0].delta_vs_lowest_pct).toBe(20); // 12000 vs 10000
    expect(out[1].delta_vs_lowest_pct).toBe(0);
    expect(out[2].delta_vs_lowest_pct).toBe(50); // 15000 vs 10000
  });

  it("TC-QUOTE-002: rounds deltas to one decimal place", () => {
    const out = computeVariantDeltas([
      { estimated_total: 10000 },
      { estimated_total: 10333 },
    ]);
    expect(out[1].delta_vs_lowest_pct).toBe(3.3); // 3.33% → 3.3
  });

  it("TC-QUOTE-003: leaves unpriced rows out of the baseline and gives them null delta", () => {
    const out = computeVariantDeltas([
      { estimated_total: null },
      { estimated_total: 8000 },
      { estimated_total: 9000 },
    ]);
    // The null row never becomes lowest and carries no delta.
    expect(out[0].is_lowest).toBe(false);
    expect(out[0].delta_vs_lowest_pct).toBeNull();
    // The baseline is the cheapest PRICED row (8000), not the null.
    expect(out[1].is_lowest).toBe(true);
    expect(out[2].delta_vs_lowest_pct).toBe(12.5);
  });

  it("TC-QUOTE-004: all-null input yields no lowest and no deltas", () => {
    const out = computeVariantDeltas([
      { estimated_total: null },
      { estimated_total: 0 },
    ]);
    expect(out.every((v) => !v.is_lowest)).toBe(true);
    expect(out.every((v) => v.delta_vs_lowest_pct === null)).toBe(true);
  });

  it("TC-QUOTE-005: ties on the lowest total are both flagged lowest with delta 0", () => {
    const out = computeVariantDeltas([
      { estimated_total: 5000 },
      { estimated_total: 5000 },
      { estimated_total: 6000 },
    ]);
    expect(out[0].is_lowest).toBe(true);
    expect(out[1].is_lowest).toBe(true);
    expect(out[2].is_lowest).toBe(false);
    expect(out[2].delta_vs_lowest_pct).toBe(20);
  });

  it("does not mutate the input array", () => {
    const input = [{ estimated_total: 100 }];
    const snapshot = JSON.stringify(input);
    computeVariantDeltas(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("supplier comparison — capSupplierSelection", () => {
  it(`TC-QUOTE-006: caps the selection at ${MAX_SUPPLIERS_PER_COMPONENT} and de-duplicates`, () => {
    expect(capSupplierSelection(["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
    expect(capSupplierSelection(["a", "a", "b"])).toEqual(["a", "b"]);
    expect(capSupplierSelection([])).toEqual([]);
  });
});
