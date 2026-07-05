import { describe, it, expect } from "vitest";
import { canRunOptimisationInline } from "@/lib/build/optimisation-gate";

/**
 * Regression: the inline "Run Design Optimisation" action must unlock purely
 * from client state — a ready design + at least one saved system — so it never
 * depends on a server refresh landing.
 *
 * Karen, 2026-07-05: a two-storey plan rendered correctly in "Show my design"
 * and had a system selected, but the button never activated (single-storey,
 * with its fast extraction, worked). The two-storey extraction runs for minutes
 * in-place, and the old server-gated button relied on an in-place router.refresh
 * to unlock — the race left it dead. These cases lock the intended gating so a
 * ready + system-selected design ALWAYS resolves to a runnable button.
 */
describe("canRunOptimisationInline", () => {
  it("unlocks when the design is ready and a system is saved", () => {
    expect(
      canRunOptimisationInline({ designReady: true, savedSystems: ["sips"] }),
    ).toBe(true);
  });

  it("unlocks the multi-storey case (ready design + saved system) regardless of how long extraction took", () => {
    // The exact shape of Karen's stranded two-storey project: design ready,
    // 'sips' saved. It MUST be runnable.
    expect(
      canRunOptimisationInline({ designReady: true, savedSystems: ["sips"] }),
    ).toBe(true);
  });

  it("unlocks with multiple saved systems", () => {
    expect(
      canRunOptimisationInline({
        designReady: true,
        savedSystems: ["sips", "volumetric"],
      }),
    ).toBe(true);
  });

  it("stays locked when no system is saved yet", () => {
    expect(
      canRunOptimisationInline({ designReady: true, savedSystems: [] }),
    ).toBe(false);
  });

  it("stays locked when the design is not ready", () => {
    expect(
      canRunOptimisationInline({ designReady: false, savedSystems: ["sips"] }),
    ).toBe(false);
  });

  it("stays locked when neither precondition is met", () => {
    expect(
      canRunOptimisationInline({ designReady: false, savedSystems: [] }),
    ).toBe(false);
  });
});
