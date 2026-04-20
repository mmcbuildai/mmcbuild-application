import { describe, expect, it } from "vitest";
import { MODEL_REGISTRY } from "@/lib/ai/models/registry";

// Guards against SCRUM-121 regression: ensures the registry values remain
// per-1M pricing (e.g. $3/M for Sonnet 4), not per-1k ($0.003 would be a
// sign of wrong units; $3000 would mean per-1M inflated to per-1k).
describe("model registry pricing units (SCRUM-121)", () => {
  it("Claude Sonnet 4 input is ~$3 per 1M tokens", () => {
    const v = MODEL_REGISTRY["claude-sonnet-4"].costPer1MInput;
    expect(v).toBeGreaterThan(0.5);
    expect(v).toBeLessThan(50);
  });

  it("GPT-4o-mini input is sub-$1 per 1M (cheap-tier model)", () => {
    const v = MODEL_REGISTRY["gpt-4o-mini"].costPer1MInput;
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it("Every model with nonzero pricing is in per-1M range (< $100)", () => {
    for (const [id, m] of Object.entries(MODEL_REGISTRY)) {
      if (m.costPer1MInput > 0) {
        expect(m.costPer1MInput, `${id} input`).toBeLessThan(100);
      }
      if (m.costPer1MOutput > 0) {
        expect(m.costPer1MOutput, `${id} output`).toBeLessThan(200);
      }
    }
  });
});
