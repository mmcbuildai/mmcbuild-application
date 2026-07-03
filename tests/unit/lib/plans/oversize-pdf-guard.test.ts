import { describe, it, expect } from "vitest";
import {
  isUnsplittableOversizePdf,
  ANTHROPIC_PDF_MAX_BYTES,
} from "@/lib/plans/file-kind";

/**
 * Size-guard regression cover (SCRUM-312 follow-up, 2026-07-02).
 *
 * The old whole-document guard rejected ANY PDF over the 32MB ceiling, which
 * killed big-but-splittable multi-page sets (the 33MB / 70-page NSW pattern
 * book) even though the extractor only ever sends one single-page slice to the
 * model. Only a SINGLE oversized page is genuinely unprocessable.
 */

const OVER = ANTHROPIC_PDF_MAX_BYTES + 1;
const UNDER = ANTHROPIC_PDF_MAX_BYTES - 1;

describe("isUnsplittableOversizePdf", () => {
  it("rejects a single-page PDF over the ceiling (can't be split)", () => {
    expect(isUnsplittableOversizePdf(OVER, 1)).toBe(true);
  });

  it("ALLOWS a large multi-page set over the ceiling (splits per page)", () => {
    // The pattern-book case: 33MB across 70 pages → each slice is tiny.
    expect(isUnsplittableOversizePdf(OVER, 70)).toBe(false);
    expect(isUnsplittableOversizePdf(OVER, 2)).toBe(false);
  });

  it("allows anything under the ceiling regardless of page count", () => {
    expect(isUnsplittableOversizePdf(UNDER, 1)).toBe(false);
    expect(isUnsplittableOversizePdf(UNDER, 50)).toBe(false);
  });

  it("treats a zero/unknown page count as unsplittable when oversized", () => {
    expect(isUnsplittableOversizePdf(OVER, 0)).toBe(true);
  });
});
