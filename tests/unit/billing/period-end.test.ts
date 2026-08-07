import { describe, it, expect } from "vitest";
import { __testing } from "@/lib/stripe/reconcile";

const { periodEndSeconds, periodStartSeconds } = __testing;

// When a subscription's period ends decides the date we print on the Billing
// page as "First charge $218.90 on <date>", and the date in the day 7/11/13
// reminder emails. It is the single most consequential number on that screen.
//
// The first version of this code read only the subscription-level
// current_period_end. Stripe moved that field onto the ITEM in the 2025-03 API
// version, so it came back undefined, the code fell back to "now", and the page
// told a real customer his card would be charged on 8 August when Stripe had
// the trial ending on the 21st. Thirteen days early, on a page about taking
// money, and nothing failed — the page rendered a confident wrong answer.

const AUG_21 = 1787270400; // 2026-08-21T00:00:00Z
const AUG_08 = 1786147200; // 2026-08-08T00:00:00Z

describe("when the period ends", () => {
  it("uses trial_end while the subscription is trialing", () => {
    // The customer is told "you will be charged on this date". That IS the
    // trial end, so read the field that means it rather than inferring it.
    expect(
      periodEndSeconds({
        status: "trialing",
        trial_end: AUG_21,
        items: { data: [{ current_period_end: AUG_08 }] },
      }),
    ).toBe(AUG_21);
  });

  it("reads current_period_end from the ITEM on newer API versions", () => {
    // The 2025-03 shape: nothing at the subscription level at all.
    expect(
      periodEndSeconds({
        status: "active",
        items: { data: [{ current_period_end: AUG_21 }] },
      }),
    ).toBe(AUG_21);
  });

  it("falls back to the subscription level on older API versions", () => {
    expect(
      periodEndSeconds({ status: "active", current_period_end: AUG_21 }),
    ).toBe(AUG_21);
  });

  it("prefers the item over the subscription when both are present", () => {
    // Stripe sends both during the transition. The item is the current one.
    expect(
      periodEndSeconds({
        status: "active",
        current_period_end: AUG_08,
        items: { data: [{ current_period_end: AUG_21 }] },
      }),
    ).toBe(AUG_21);
  });

  it("returns null rather than guessing when Stripe sends no period at all", () => {
    // THE BUG, pinned. Returning null makes the caller decide what to do about
    // a missing date. Returning a plausible-looking "now" is what printed a
    // wrong charge date to a customer with no error anywhere.
    expect(periodEndSeconds({ status: "active" })).toBeNull();
    expect(periodEndSeconds({ status: "active", items: { data: [] } })).toBeNull();
  });

  it("does not use trial_end once the trial is over", () => {
    // A subscription that has converted is billed on its period, not on a trial
    // end that is now in the past.
    expect(
      periodEndSeconds({
        status: "active",
        trial_end: AUG_08,
        items: { data: [{ current_period_end: AUG_21 }] },
      }),
    ).toBe(AUG_21);
  });
});

describe("when the period started", () => {
  it("prefers the item, then the subscription, then null", () => {
    expect(
      periodStartSeconds({ items: { data: [{ current_period_start: AUG_08 }] } }),
    ).toBe(AUG_08);
    expect(periodStartSeconds({ current_period_start: AUG_08 })).toBe(AUG_08);
    expect(periodStartSeconds({})).toBeNull();
  });
});
