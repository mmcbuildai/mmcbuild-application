import { describe, it, expect } from "vitest";
import { isPrefillPending } from "@/lib/comply/questionnaire-prefill";

describe("isPrefillPending (questionnaire hold-back gate)", () => {
  it("is pending when prefill empty, a vision plan is still extracting, and no layout exists", () => {
    expect(
      isPrefillPending({
        prefill: {},
        hasPendingVisionPlan: true,
        hasSpatialLayout: false,
      }),
    ).toBe(true);
  });

  it("is NOT pending when the prefill already has values (extraction landed)", () => {
    expect(
      isPrefillPending({
        prefill: { storeys: "2" },
        hasPendingVisionPlan: true,
        hasSpatialLayout: false,
      }),
    ).toBe(false);
  });

  it("is NOT pending when there is no vision-capable plan still extracting (e.g. DWG only)", () => {
    expect(
      isPrefillPending({
        prefill: {},
        hasPendingVisionPlan: false,
        hasSpatialLayout: false,
      }),
    ).toBe(false);
  });

  it("is NOT pending when a 3D spatial layout already exists", () => {
    expect(
      isPrefillPending({
        prefill: {},
        hasPendingVisionPlan: true,
        hasSpatialLayout: true,
      }),
    ).toBe(false);
  });

  it("never traps: empty prefill + nothing in flight resolves to not-pending", () => {
    expect(
      isPrefillPending({
        prefill: {},
        hasPendingVisionPlan: false,
        hasSpatialLayout: true,
      }),
    ).toBe(false);
  });
});
