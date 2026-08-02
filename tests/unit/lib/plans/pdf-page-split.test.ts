/**
 * SCRUM-316 — page splitting before the size guard.
 *
 * The bug these cover: a plan set still over Anthropic's 32MB ceiling after the
 * optimise pass was rejected outright, so NO attributes were extracted from a
 * large architect set (the ~37MB Gladesville case). Since the model is only
 * ever sent what we choose to send, total document size must not be the
 * decider — the page selection is. `selectPagesWithinBudget` is that decision,
 * so it is tested directly rather than through a model call.
 */

import { describe, it, expect } from "vitest";
import {
  selectPagesWithinBudget,
  VISION_SUBSET_BYTE_BUDGET,
  VISION_SUBSET_MAX_PAGES,
} from "@/lib/plans/pdf-page-split";

const MB = 1024 * 1024;

describe("selectPagesWithinBudget", () => {
  it("takes every page when the whole set fits", () => {
    const pages = [1 * MB, 2 * MB, 1 * MB];
    expect(selectPagesWithinBudget(pages, 10 * MB, 12)).toEqual([1, 2, 3]);
  });

  it("returns 1-indexed page numbers, not array indices", () => {
    expect(selectPagesWithinBudget([1 * MB], 10 * MB, 12)).toEqual([1]);
  });

  it("stops adding pages once the byte budget is reached", () => {
    // 4 pages of 3MB against a 10MB budget → only 3 fit.
    const pages = [3 * MB, 3 * MB, 3 * MB, 3 * MB];
    expect(selectPagesWithinBudget(pages, 10 * MB, 12)).toEqual([1, 2, 3]);
  });

  it("honours the page cap even when the budget still has room", () => {
    const pages = Array.from({ length: 30 }, () => 0.1 * MB);
    const chosen = selectPagesWithinBudget(pages, 100 * MB, 5);
    expect(chosen).toEqual([1, 2, 3, 4, 5]);
  });

  it("skips one oversized page but keeps the readable pages around it", () => {
    // The failure this prevents: a single enormous rendered elevation in the
    // middle of a set costing us every page after it.
    const pages = [1 * MB, 40 * MB, 1 * MB, 1 * MB];
    expect(selectPagesWithinBudget(pages, 10 * MB, 12)).toEqual([1, 3, 4]);
  });

  it("returns empty when no single page fits — the genuinely unprocessable case", () => {
    expect(selectPagesWithinBudget([40 * MB], 32 * MB, 12)).toEqual([]);
  });

  it("returns empty for a document with no pages", () => {
    expect(selectPagesWithinBudget([], 32 * MB, 12)).toEqual([]);
  });

  it("skips pages that failed to slice (recorded as size 0)", () => {
    // buildVisionSubsetPdf records an unsliceable page as 0 bytes; a zero-byte
    // page must never be selected, or we would send the model nothing.
    const pages = [0, 1 * MB, 0, 2 * MB];
    expect(selectPagesWithinBudget(pages, 10 * MB, 12)).toEqual([2, 4]);
  });

  it("splits a Gladesville-shaped set (37MB across 40 pages) instead of rejecting it", () => {
    // The regression case from the ticket: the whole set is over the ceiling,
    // but every page is small, so a usable subset must come back non-empty.
    const pages = Array.from({ length: 40 }, () => 0.925 * MB);
    const chosen = selectPagesWithinBudget(pages);
    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen.length).toBeLessThanOrEqual(VISION_SUBSET_MAX_PAGES);
    const total = chosen.reduce((sum, n) => sum + pages[n - 1], 0);
    expect(total).toBeLessThanOrEqual(VISION_SUBSET_BYTE_BUDGET);
  });

  it("keeps the default budget under the model's document ceiling", () => {
    // Headroom is deliberate: the ceiling applies to the encoded request and
    // PDF assembly can grow slightly on save.
    expect(VISION_SUBSET_BYTE_BUDGET).toBeLessThan(32 * MB);
  });
});
