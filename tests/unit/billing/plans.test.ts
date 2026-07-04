import { describe, it, expect } from "vitest";
import {
  PLANS,
  TRIAL_RUN_LIMIT,
  TRIAL_DAYS,
  getPlanByPriceId,
  normalizePlanId,
} from "@/lib/stripe/plans";

describe("Plans configuration", () => {
  it("has three tiers", () => {
    expect(Object.keys(PLANS)).toEqual(["essential", "professional", "enterprise"]);
  });

  it("essential has correct pricing + limits", () => {
    expect(PLANS.essential.price).toBe(49);
    expect(PLANS.essential.standardPrice).toBe(99);
    expect(PLANS.essential.runLimit).toBe(10);
    expect(PLANS.essential.uploadLimit).toBe(5);
    expect(PLANS.essential.seatLimit).toBe(1);
    expect(PLANS.essential.currency).toBe("aud");
  });

  it("professional has correct pricing + limits", () => {
    expect(PLANS.professional.price).toBe(199);
    expect(PLANS.professional.standardPrice).toBe(299);
    expect(PLANS.professional.runLimit).toBe(30);
    expect(PLANS.professional.uploadLimit).toBe(10);
    expect(PLANS.professional.seatLimit).toBe(5);
  });

  it("enterprise has unlimited runs", () => {
    expect(PLANS.enterprise.runLimit).toBe(Infinity);
    expect(PLANS.enterprise.price).toBeNull();
    expect(PLANS.enterprise.isCustom).toBe(true);
  });

  it("every tier unlocks all five modules", () => {
    for (const plan of Object.values(PLANS)) {
      expect([...plan.modules].sort()).toEqual(
        ["build", "comply", "direct", "quote", "train"],
      );
    }
  });

  it("trial constants are correct", () => {
    expect(TRIAL_RUN_LIMIT).toBe(3);
    expect(TRIAL_DAYS).toBe(14);
  });
});

describe("getPlanByPriceId", () => {
  it("returns undefined for unknown price ID", () => {
    expect(getPlanByPriceId("price_unknown")).toBeUndefined();
  });

  it("returns undefined for an empty price ID (never matches an unset tier price)", () => {
    // Enterprise has an empty stripePriceId; an empty lookup must not match it.
    expect(getPlanByPriceId("")).toBeUndefined();
  });
});

describe("normalizePlanId (legacy aliases)", () => {
  it("maps the legacy 'basic' plan_id to essential", () => {
    expect(normalizePlanId("basic")).toBe("essential");
  });

  it("passes current tier ids through unchanged", () => {
    expect(normalizePlanId("essential")).toBe("essential");
    expect(normalizePlanId("professional")).toBe("professional");
    expect(normalizePlanId("enterprise")).toBe("enterprise");
  });
});
