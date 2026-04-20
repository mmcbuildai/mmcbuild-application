import { describe, it, expect } from "vitest";
import { PLANS, TRIAL_RUN_LIMIT, TRIAL_DAYS, getPlanByPriceId } from "@/lib/stripe/plans";

describe("Plans configuration", () => {
  it("has three tiers", () => {
    expect(Object.keys(PLANS)).toEqual(["basic", "professional", "enterprise"]);
  });

  it("basic has correct pricing", () => {
    expect(PLANS.basic.price).toBe(149);
    expect(PLANS.basic.runLimit).toBe(10);
    expect(PLANS.basic.currency).toBe("aud");
  });

  it("professional has correct pricing", () => {
    expect(PLANS.professional.price).toBe(399);
    expect(PLANS.professional.runLimit).toBe(30);
  });

  it("enterprise has unlimited runs", () => {
    expect(PLANS.enterprise.runLimit).toBe(Infinity);
    expect(PLANS.enterprise.price).toBeNull();
    expect(PLANS.enterprise.isCustom).toBe(true);
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
});
