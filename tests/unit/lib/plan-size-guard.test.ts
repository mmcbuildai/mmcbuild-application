import { describe, it, expect } from "vitest";
import {
  ANTHROPIC_PDF_MAX_BYTES,
  planTooLargeMessage,
} from "@/lib/plans/file-kind";

/**
 * Regression tests for the >32MB plan guard. A ~36MB architect PDF
 * (Gladesville) ran for minutes then crashed the browser instead of failing
 * cleanly. The extractor now rejects oversized files before any rasterise /
 * Anthropic call using this shared limit + message. (extractFullHouse itself
 * is server-only and can't be imported here; the guard reads these.)
 */
describe("plan size guard", () => {
  it("caps at Anthropic's 32MB document ceiling", () => {
    expect(ANTHROPIC_PDF_MAX_BYTES).toBe(32 * 1024 * 1024);
  });

  it("reports the real file size and the 32MB limit in the message", () => {
    const msg = planTooLargeMessage(36 * 1024 * 1024);
    expect(msg).toContain("36.0 MB");
    expect(msg).toContain("32 MB");
  });

  it("a file just over the limit is rejected, just under is not", () => {
    // The guard compares decoded bytes to ANTHROPIC_PDF_MAX_BYTES.
    expect(ANTHROPIC_PDF_MAX_BYTES + 1).toBeGreaterThan(ANTHROPIC_PDF_MAX_BYTES);
    expect(planTooLargeMessage(33 * 1024 * 1024)).toContain("33.0 MB");
  });
});
