import { describe, it, expect } from "vitest";
import { PLANS, SELLABLE_PLAN_IDS, TAX_QUALIFIER } from "@/lib/stripe/plans";

/**
 * Pricing drift between the app and the marketing site.
 *
 * There are TWO pricing pages in TWO repositories — `mmcbuild-application`
 * (this one) and `mmcbuild-marketing`, which serves mmcbuild.com.au. They have
 * already drifted once: on 7 August the marketing FAQ advertised annual billing
 * on "Professional and Enterprise", when Enterprise has no annual price at all
 * and Essential — which does — was omitted.
 *
 * The marketing page does NOT read these values. It computes its own, from a
 * hardcoded 20% discount:
 *
 *     per-month shown  = Math.round(price * 0.8)
 *     "Billed annually at $X" = Math.round(price * 0.8 * 12)
 *
 * Today that lands exactly on the live Stripe prices ($470 and $1,910). That is
 * arithmetic coincidence, not a link. Nothing stops someone changing the annual
 * price here — or the discount there — and leaving the shop window advertising a
 * figure Stripe will not charge.
 *
 * These tests pin the relationship, so the divergence fails in CI instead of in
 * front of a customer who was quoted one number and billed another.
 *
 * WHAT THIS DOES NOT COVER, stated so nobody assumes otherwise: it cannot see
 * the marketing repo, so it catches a change made HERE. A change made only
 * there still needs `scripts/check-pricing-drift.mjs`, which fetches the live
 * site. Between them: this one always runs and is deterministic, that one needs
 * the network.
 */

/** The discount the marketing site hardcodes. Mirror of `withAnnual`. */
const MARKETING_ANNUAL_DISCOUNT = 0.8;

/** What mmcbuild.com.au will print as the annual total for a tier. */
function marketingAnnualTotal(monthly: number): number {
  return Math.round(monthly * MARKETING_ANNUAL_DISCOUNT * 12);
}

/** What mmcbuild.com.au will print as the per-month figure under Annual. */
function marketingAnnualPerMonth(monthly: number): number {
  return Math.round(monthly * MARKETING_ANNUAL_DISCOUNT);
}

describe("pricing drift — app vs marketing site", () => {
  it.each(SELLABLE_PLAN_IDS)(
    "%s: the annual price we charge is the annual price the website advertises",
    (planId) => {
      const plan = PLANS[planId];
      const advertised = marketingAnnualTotal(plan.price);

      // If this fails, one of two things happened and BOTH need attention:
      //   - the annual price changed here, and mmcbuild.com.au still shows the old one
      //   - the monthly price changed here, so the website's 20% now computes
      //     something Stripe will not charge
      // Fix by updating the marketing page (and Stripe), not by moving this number.
      expect(
        plan.annualPrice,
        `${planId}: mmcbuild.com.au will advertise "Billed annually at $${advertised}", ` +
          `but this app charges $${plan.annualPrice}. One of them is wrong.`,
      ).toBe(advertised);
    },
  );

  it.each(SELLABLE_PLAN_IDS)(
    "%s: paying annually is actually cheaper than paying monthly",
    (planId) => {
      const plan = PLANS[planId];
      // The website claims a saving. If this ever inverts, it is advertising a
      // worse deal as a better one.
      expect(plan.annualPrice).toBeLessThan(plan.price * 12);
    },
  );

  it("the saving really is about 20%, which is what the website says", () => {
    for (const planId of SELLABLE_PLAN_IDS) {
      const plan = PLANS[planId];
      const saving = 1 - plan.annualPrice / (plan.price * 12);
      // Allow a little slack for rounding to whole dollars, but not enough to
      // let "20%" quietly become 15% or 25% while the copy still says 20%.
      expect(saving, `${planId} saving`).toBeGreaterThan(0.18);
      expect(saving, `${planId} saving`).toBeLessThan(0.22);
    }
  });

  it("the per-month figure shown under Annual is a whole number", () => {
    // The site prints "$39" and "$159" with no decimals. A price that rounds
    // badly would display a figure that does not multiply back to the annual
    // total, and a careful buyer will notice.
    for (const planId of SELLABLE_PLAN_IDS) {
      const perMonth = marketingAnnualPerMonth(PLANS[planId].price);
      expect(Number.isInteger(perMonth)).toBe(true);
    }
  });

  it("Enterprise has no annual price, because it is quoted individually", () => {
    // The FAQ used to offer annual billing on Enterprise. There is nothing to
    // sell — it is custom-priced — so the copy was promising a discount that
    // could not be applied.
    expect(PLANS.enterprise.price).toBeNull();
    expect(PLANS.enterprise.annualPrice).toBeNull();
    expect(SELLABLE_PLAN_IDS).not.toContain("enterprise" as never);
  });

  it("prices are quoted GST-exclusive on both sites", () => {
    // Both pricing pages print this suffix. It is single-sourced here so a new
    // price surface cannot quietly omit it.
    expect(TAX_QUALIFIER).toBe("+ GST");
  });
});
