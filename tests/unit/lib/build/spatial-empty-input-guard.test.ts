import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cover for the empty/unreadable-input guard (2026-06-11). When no usable plan
 * reaches the spatial extractor, it must fail fast with a structured reason and
 * NOT call the model — sending Claude a blank document is what produced the
 * misleading "Failed to extract JSON" in production.
 *
 * The Anthropic SDK is mocked so the test can assert `messages.create` is never
 * invoked on the empty-input path.
 */
const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

import {
  extractFloorPlanFromPdf,
  extractSpatialLayout,
} from "@/lib/build/spatial/extractor";
import {
  MIN_READABLE_PLAN_BYTES,
  decodedBase64Bytes,
} from "@/lib/plans/file-kind";

describe("spatial extractor — empty-input guard", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("empty base64 → structured failure, model NOT called (PDF path)", async () => {
    const res = await extractFloorPlanFromPdf("");
    expect(res.layout).toBeNull();
    expect(res.detectedPage).toBeNull();
    expect(res.totalPages).toBeNull();
    expect(res.error).toMatch(/no readable plan/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("near-empty base64 (<1KB) → model NOT called (image path)", async () => {
    // 10 bytes of content — well under the 1 KB readable minimum.
    const tiny = Buffer.from("x".repeat(10)).toString("base64");
    expect(decodedBase64Bytes(tiny)).toBeLessThan(MIN_READABLE_PLAN_BYTES);

    const res = await extractSpatialLayout(tiny);
    expect(res).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("decodedBase64Bytes recovers the true byte length", () => {
    const raw = "x".repeat(3000);
    const b64 = Buffer.from(raw).toString("base64");
    // Allow ±2 bytes for padding rounding.
    expect(Math.abs(decodedBase64Bytes(b64) - 3000)).toBeLessThanOrEqual(2);
    expect(decodedBase64Bytes(b64)).toBeGreaterThanOrEqual(
      MIN_READABLE_PLAN_BYTES,
    );
  });
});
