import { describe, it, expect } from "vitest";
import {
  MAX_DXF_PARSE_BYTES,
  dxfTooLargeToParse,
  DXF_TOO_LARGE_MESSAGE,
  extractLayersFromDxf,
  extractSpatialLayoutFromDxf,
} from "@/lib/plans/dxf-extractor";

/**
 * Regression tests for the DXF parse OOM guard.
 *
 * Karen's "TH01 Terraces 01 … technical-01.dwg" (36.9 MB DWG) converted to a
 * DXF large enough that dxf-parser's synchronous parseSync OOM-killed the whole
 * Vercel invocation (~252 s, under the 300 s maxDuration → memory, not time).
 * The kill surfaced as a Next.js 500 HTML page — NOT a catchable throw — so the
 * process-plan try/catch → manual_review fallback never ran and the plan was
 * stranded in "error". The guard skips parseSync above MAX_DXF_PARSE_BYTES and
 * returns null so callers degrade gracefully. (2026-06-11)
 */
describe("DXF parse OOM guard", () => {
  it("caps the parse input at 60MB", () => {
    expect(MAX_DXF_PARSE_BYTES).toBe(60 * 1024 * 1024);
  });

  it("flags a buffer over the cap and clears one at/under it", () => {
    expect(dxfTooLargeToParse(MAX_DXF_PARSE_BYTES + 1)).toBe(true);
    expect(dxfTooLargeToParse(MAX_DXF_PARSE_BYTES)).toBe(false);
    expect(dxfTooLargeToParse(1024)).toBe(false);
  });

  it("the too-large message is actionable (manual review + single-sheet path)", () => {
    expect(DXF_TOO_LARGE_MESSAGE).toMatch(/manual review/i);
    expect(DXF_TOO_LARGE_MESSAGE).toMatch(/floor-plan sheet|PDF/i);
  });

  it("extractLayersFromDxf returns null on an oversized buffer without parsing", () => {
    // A buffer one byte over the cap. The guard must short-circuit BEFORE
    // toString/parseSync — so this never allocates a parsed object graph.
    const oversized = Buffer.alloc(MAX_DXF_PARSE_BYTES + 1);
    expect(extractLayersFromDxf(oversized)).toBeNull();
  });

  it("extractSpatialLayoutFromDxf returns null on an oversized buffer without parsing", () => {
    const oversized = Buffer.alloc(MAX_DXF_PARSE_BYTES + 1);
    expect(extractSpatialLayoutFromDxf(oversized)).toBeNull();
  });
});
