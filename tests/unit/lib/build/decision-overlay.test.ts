import { describe, it, expect } from "vitest";
import { overlayStyleForDecision } from "@/lib/build/decision-overlay";

// SCRUM-169: a suggestion's decision drives its 3D overlay — rejected drops out
// (original geometry), considering fades, pursuing is prominent.
describe("overlayStyleForDecision", () => {
  it("hides the overlay for rejected (shows the original geometry)", () => {
    expect(overlayStyleForDecision("rejected")).toEqual({
      visible: false,
      opacity: 0,
    });
  });

  it("shows pursuing prominently", () => {
    const s = overlayStyleForDecision("pursuing");
    expect(s.visible).toBe(true);
    expect(s.opacity).toBeGreaterThan(0.35);
  });

  it("fades considering below the default", () => {
    const s = overlayStyleForDecision("considering");
    expect(s.visible).toBe(true);
    expect(s.opacity).toBeLessThan(0.35);
    expect(s.opacity).toBeGreaterThan(0);
  });

  it("shows undecided / null / unknown at the default weight", () => {
    for (const d of ["undecided", null, undefined, "something-else"]) {
      expect(overlayStyleForDecision(d as string | null | undefined)).toEqual({
        visible: true,
        opacity: 0.35,
      });
    }
  });
});
