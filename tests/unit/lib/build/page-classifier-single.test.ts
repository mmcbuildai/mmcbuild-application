import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only throws outside RSC; stub it for the node test env.
vi.mock("server-only", () => ({}));
// pdf-to-image pulls native deps the classifier module imports at top level.
vi.mock("@/lib/build/spatial/pdf-to-image", () => ({ renderAllPdfPages: vi.fn() }));

const callVisionModel = vi.fn();
vi.mock("@/lib/build/spatial/vision-call", () => ({
  callVisionModel: (...a: unknown[]) => callVisionModel(...a),
}));

import { classifySinglePageNative } from "@/lib/build/spatial/page-classifier";

/**
 * Per-page classifier cover (2026-06-26). The whole-set classifier mislabelled a
 * 2-storey set's UPPER floor plan as "other", so only the ground floor extracted
 * and the GFA halved. The per-page call (title-block first) is what reliably tags
 * ground vs upper. These lock its parse + degrade behaviour.
 */
describe("classifySinglePageNative", () => {
  beforeEach(() => callVisionModel.mockReset());

  it("reads the title block to tag an upper floor plan", async () => {
    callVisionModel.mockResolvedValue({
      text: '{"type":"floor_plan_upper","confidence":0.92,"notes":"Title: PROPOSED FIRST FLOOR PLAN"}',
    });
    const c = await classifySinglePageNative("base64", 7);
    expect(c).toMatchObject({ pageNumber: 7, type: "floor_plan_upper", confidence: 0.92 });
    expect(c.notes).toContain("FIRST FLOOR");
  });

  it("tags a ground floor plan", async () => {
    callVisionModel.mockResolvedValue({ text: '{"type":"floor_plan_ground","confidence":0.9}' });
    expect((await classifySinglePageNative("b", 3)).type).toBe("floor_plan_ground");
  });

  it("degrades to 'other' on an empty response", async () => {
    callVisionModel.mockResolvedValue({ text: "" });
    expect(await classifySinglePageNative("b", 1)).toEqual({
      pageNumber: 1,
      type: "other",
      confidence: 0,
    });
  });

  it("degrades to 'other' on unparseable output", async () => {
    callVisionModel.mockResolvedValue({ text: "I think this is a floor plan, maybe?" });
    const c = await classifySinglePageNative("b", 2);
    expect(c).toEqual({ pageNumber: 2, type: "other", confidence: 0 });
  });

  it("defaults confidence when the model omits it", async () => {
    callVisionModel.mockResolvedValue({ text: '{"type":"schedule"}' });
    const c = await classifySinglePageNative("b", 8);
    expect(c.type).toBe("schedule");
    expect(c.confidence).toBe(0.5);
  });
});
