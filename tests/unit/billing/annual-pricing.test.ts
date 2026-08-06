import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Annual billing (go-live item 2). Stripe has had live annual prices since
// 5 August; the app had no way to sell them, so the website advertised annual
// billing that nothing could charge for.
//
// Three failures these tests exist to prevent, none of which throw at build or
// deploy time:
//
//   1. An annual price id that no longer resolves to a tier. A customer pays for
//      a year and the subscription lands with no tier — they get nothing, and
//      the only symptom is a support email.
//   2. An annual price that is not actually cheaper than twelve monthly ones.
//      A transposed figure ($1,910 -> $19,100, or annual quoted per-month)
//      publishes a worse deal as a saving.
//   3. Annual offered when no annual price is configured. Checkout then fails
//      at Stripe with "No such price", in front of someone who has already
//      decided to pay.

const ENV_KEYS = [
  "STRIPE_ESSENTIAL_MONTHLY_PRICE_ID",
  "STRIPE_ESSENTIAL_ANNUAL_PRICE_ID",
  "STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID",
  "STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID",
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

function setAllPriceIds() {
  process.env.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID = "price_essential_monthly";
  process.env.STRIPE_ESSENTIAL_ANNUAL_PRICE_ID = "price_essential_annual";
  process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID = "price_professional_monthly";
  process.env.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID = "price_professional_annual";
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

describe("annual billing", () => {
  it("resolves an annual price id back to its tier", async () => {
    setAllPriceIds();
    const { getPlanByPriceId } = await loadPlans();

    // The failure this prevents: a paid annual subscription resolving to no
    // tier, so the customer is charged and granted nothing.
    expect(getPlanByPriceId("price_essential_annual")?.id).toBe("essential");
    expect(getPlanByPriceId("price_professional_annual")?.id).toBe("professional");
  });

  it("still resolves monthly price ids", async () => {
    setAllPriceIds();
    const { getPlanByPriceId } = await loadPlans();

    expect(getPlanByPriceId("price_essential_monthly")?.id).toBe("essential");
    expect(getPlanByPriceId("price_professional_monthly")?.id).toBe("professional");
  });

  it("picks the right price id for each interval", async () => {
    setAllPriceIds();
    const { priceIdFor } = await loadPlans();

    expect(priceIdFor("essential", "month")).toBe("price_essential_monthly");
    expect(priceIdFor("essential", "year")).toBe("price_essential_annual");
    expect(priceIdFor("professional", "year")).toBe("price_professional_annual");
  });

  it("reports annual as unavailable when a price id is missing", async () => {
    // Only Essential configured — Professional's annual id is absent.
    process.env.STRIPE_ESSENTIAL_ANNUAL_PRICE_ID = "price_essential_annual";
    const { annualBillingAvailable, priceIdFor } = await loadPlans();

    // Half-configured must read as unavailable: offering the switch would show
    // an annual price for Professional that cannot be bought.
    expect(annualBillingAvailable()).toBe(false);
    expect(priceIdFor("professional", "year")).toBe("");
  });

  it("reports annual as available only when every sellable tier has one", async () => {
    setAllPriceIds();
    const { annualBillingAvailable } = await loadPlans();

    expect(annualBillingAvailable()).toBe(true);
  });

  it("prices annual below twelve months, for every sellable tier", async () => {
    const { SELLABLE_PLAN_IDS, displayPriceFor } = await loadPlans();

    for (const id of SELLABLE_PLAN_IDS) {
      const monthly = displayPriceFor(id, "month");
      const annual = displayPriceFor(id, "year");

      expect(monthly, `${id} monthly price`).toBeTruthy();
      expect(annual, `${id} annual price`).toBeTruthy();
      // The claim on the page is that paying annually saves money. If this ever
      // fails, the page is advertising a worse deal as a better one.
      expect(annual!, `${id}: annual must be cheaper than 12 months`).toBeLessThan(
        monthly! * 12,
      );
    }
  });

  it("states the saving in whole months, and omits it when there is none", async () => {
    const { annualSavingMonths } = await loadPlans();

    // $470 against $49/month is $588 - $470 = $118, i.e. ~2 months.
    expect(annualSavingMonths("essential")).toBe(2);
    // $1,910 against $199/month is $2,388 - $1,910 = $478, i.e. ~2 months.
    expect(annualSavingMonths("professional")).toBe(2);
    // Enterprise is contact-us: no price either way, so no claim to make.
    expect(annualSavingMonths("enterprise")).toBeNull();
  });
});
