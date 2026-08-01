import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// SCRUM-332: Karthik configured Vercel with MONTHLY/ANNUAL variable names while
// plans.ts read EARLY/INTRO ones. A mismatch does not throw — the plan simply
// resolves to "" and the checkout button returns "Plan not configured in
// Stripe", which reaches a customer as a button that does nothing.
//
// Both names are now accepted, with the newer one winning. These tests pin that,
// because the failure they prevent is invisible in every other kind of check:
// the app builds, deploys, renders the price, and only fails at the click.

const ENV_KEYS = [
  "STRIPE_ESSENTIAL_MONTHLY_PRICE_ID",
  "STRIPE_ESSENTIAL_EARLY_PRICE_ID",
  "STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID",
  "STRIPE_PROFESSIONAL_INTRO_PRICE_ID",
] as const;

const original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

/** plans.ts reads env at module scope, so each case needs a fresh import. */
async function loadPlans() {
  vi.resetModules();
  return import("@/lib/stripe/plans");
}

beforeEach(() => {
  clearEnv();
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("Stripe price-id env var names (SCRUM-332)", () => {
  it("reads Karthik's MONTHLY names", async () => {
    process.env.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID = "price_essential_monthly";
    process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID = "price_professional_monthly";

    const { PLANS } = await loadPlans();

    expect(PLANS.essential.stripePriceId).toBe("price_essential_monthly");
    expect(PLANS.professional.stripePriceId).toBe("price_professional_monthly");
  });

  it("still reads the original EARLY/INTRO names, so an environment already set keeps working", async () => {
    process.env.STRIPE_ESSENTIAL_EARLY_PRICE_ID = "price_essential_early";
    process.env.STRIPE_PROFESSIONAL_INTRO_PRICE_ID = "price_professional_intro";

    const { PLANS } = await loadPlans();

    expect(PLANS.essential.stripePriceId).toBe("price_essential_early");
    expect(PLANS.professional.stripePriceId).toBe("price_professional_intro");
  });

  it("prefers the MONTHLY name when both are set", async () => {
    process.env.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID = "price_monthly_wins";
    process.env.STRIPE_ESSENTIAL_EARLY_PRICE_ID = "price_early_loses";

    const { PLANS } = await loadPlans();

    expect(PLANS.essential.stripePriceId).toBe("price_monthly_wins");
  });

  it("resolves to empty when neither is set, which is what produces the dead button", async () => {
    const { PLANS } = await loadPlans();

    expect(PLANS.essential.stripePriceId).toBe("");
    expect(PLANS.professional.stripePriceId).toBe("");
  });

  it("getPlanByPriceId matches a subscription bought under either name", async () => {
    process.env.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID = "price_essential_monthly";
    process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID = "price_professional_monthly";

    const { getPlanByPriceId } = await loadPlans();

    // The webhook resolves an incoming subscription back to its tier by price id.
    // If that lookup misses, a paying customer is recorded on no tier at all.
    expect(getPlanByPriceId("price_essential_monthly")?.id).toBe("essential");
    expect(getPlanByPriceId("price_professional_monthly")?.id).toBe("professional");
    expect(getPlanByPriceId("price_not_ours")).toBeUndefined();
  });
});
