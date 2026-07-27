import { describe, it, expect } from "vitest";
import {
  NCC_CATEGORIES,
  getCategoryVolume,
  getCategoryLabel,
} from "@/lib/ai/types";
import { COMPLIANCE_USER_CONTEXT_TEMPLATE } from "@/lib/ai/prompts/compliance-system";

// SCRUM-318 regression: the compliance context substituted "Type C" — the LEAST
// fire-resistant tier — when Construction Type was left blank, so an unspecified
// Class 2–9 building was silently assessed against the most lenient requirements
// (failing in the dangerous direction). Blank must read "Not specified" so the
// analysis flags the gap instead of assuming leniency.
describe("SCRUM-318 — Construction Type default", () => {
  it("renders 'Not specified' when construction_type is blank", () => {
    const ctx = COMPLIANCE_USER_CONTEXT_TEMPLATE({ building_class: "Class 2" });
    expect(ctx).toContain("Construction Type: Not specified");
    expect(ctx).not.toContain("Construction Type: Type C");
  });

  it("passes a supplied construction_type through unchanged", () => {
    const ctx = COMPLIANCE_USER_CONTEXT_TEMPLATE({
      building_class: "Class 2",
      construction_type: "Type A",
    });
    expect(ctx).toContain("Construction Type: Type A");
  });
});

// SCRUM-314 regression: the "Accessibility" domain was mapped to NCC Volume 1,
// so a residential (Class 1) report showed an "NCC Volume 1" section, and the
// generic accessibility domain double-counted the H8 ground already covered by
// safe_movement (H5) + livable_housing (H8). The generic domain is retired.
describe("SCRUM-314 — NCC volume mapping + accessibility de-duplication", () => {
  it("no longer carries a generic 'accessibility' category", () => {
    expect(NCC_CATEGORIES.map((c) => c.key)).not.toContain("accessibility");
  });

  it("keeps the precise H5/H8 domains that replace it", () => {
    const keys = NCC_CATEGORIES.map((c) => c.key);
    expect(keys).toContain("safe_movement");
    expect(keys).toContain("livable_housing");
  });

  it("has no Volume 1 domains — this is a residential (Volume Two) tool", () => {
    expect(NCC_CATEGORIES.filter((c) => c.volume === 1)).toHaveLength(0);
  });

  it("resolves a historical 'accessibility' finding via the fallback (Volume 2, label kept)", () => {
    // Old checks stored category="accessibility"; they must still render sanely.
    expect(getCategoryVolume("accessibility")).toBe(2);
    expect(getCategoryLabel("accessibility")).toBe("Accessibility");
  });
});
