import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the CloudConvert optimiser so the helper can be unit-tested without a
// real conversion. ANTHROPIC_PDF_MAX_BYTES (file-kind) stays real (pure const).
const optimizeMock = vi.fn();
vi.mock("@/lib/plans/dwg-converter", () => ({
  optimizePdfViaCloudConvert: (...args: unknown[]) => optimizeMock(...args),
}));

import {
  preparePdfBufferForVision,
  OPTIMISE_PDF_THRESHOLD_BYTES,
} from "@/lib/plans/pdf-vision-prep";
import { ANTHROPIC_PDF_MAX_BYTES } from "@/lib/plans/file-kind";

/**
 * Cover for the single PDF→vision prep helper (2026-06-26). It is the one home
 * for the optimise-then-ceiling-guard logic both ingestion entry points share,
 * so a regression here would silently degrade large-plan extraction on every
 * path. The 33MB-over-the-32MB-ceiling case is the exact TH01 failure that
 * motivated it.
 */
describe("preparePdfBufferForVision", () => {
  beforeEach(() => optimizeMock.mockReset());

  it("leaves a sub-threshold PDF untouched and never calls the optimiser", async () => {
    const small = Buffer.alloc(1 * 1024 * 1024, 1); // 1MB
    const result = await preparePdfBufferForVision(small);
    expect(optimizeMock).not.toHaveBeenCalled();
    expect(result.optimised).toBe(false);
    expect(result.withinCeiling).toBe(true);
    expect(result.buffer.byteLength).toBe(small.byteLength);
  });

  it("optimises an over-threshold PDF and reports within-ceiling when it shrinks", async () => {
    const big = Buffer.alloc(OPTIMISE_PDF_THRESHOLD_BYTES + 1024, 1); // ~20MB+
    const shrunk = Buffer.alloc(8 * 1024 * 1024, 2); // 8MB
    optimizeMock.mockResolvedValue({ buffer: shrunk });

    const result = await preparePdfBufferForVision(big);
    expect(optimizeMock).toHaveBeenCalledOnce();
    expect(result.optimised).toBe(true);
    expect(result.withinCeiling).toBe(true);
    expect(result.buffer.byteLength).toBe(shrunk.byteLength);
  });

  it("reports NOT-within-ceiling when a >32MB PDF can't be shrunk under the limit", async () => {
    const huge = Buffer.alloc(ANTHROPIC_PDF_MAX_BYTES + 2 * 1024 * 1024, 1); // 34MB — the TH01 case
    optimizeMock.mockResolvedValue({ error: "convert failed" });

    const result = await preparePdfBufferForVision(huge);
    expect(result.optimised).toBe(false);
    expect(result.withinCeiling).toBe(false); // caller must SKIP the vision call
  });

  it("treats a no-size-win optimise as not optimised", async () => {
    const big = Buffer.alloc(OPTIMISE_PDF_THRESHOLD_BYTES + 1024, 1);
    optimizeMock.mockResolvedValue({ buffer: Buffer.alloc(big.byteLength + 10, 1) }); // bigger, no win

    const result = await preparePdfBufferForVision(big);
    expect(result.optimised).toBe(false);
    // Original is under the 32MB ceiling, so still safe to send.
    expect(result.withinCeiling).toBe(true);
  });
});
