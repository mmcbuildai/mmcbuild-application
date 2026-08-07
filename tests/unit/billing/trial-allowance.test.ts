import { describe, it, expect } from "vitest";
import {
  PLANS,
  TRIAL_DAYS,
  TRIAL_RUN_LIMIT,
  TRIAL_UPLOAD_LIMIT,
} from "@/lib/stripe/plans";

// Option A (SCRUM-366, Karen 7 August): a card is taken up front and charged
// automatically at day 14. That makes the trial allowance a commercial promise
// rather than a throttle — the customer has already handed over a card on the
// strength of it.
//
// Karen's D1: "give the trial the Essential allowance — 10 runs and 5 uploads
// for the 14 days."
//
// The failure this guards is specific and was live until 7 August: the trial
// capped at 3 runs while the page promised "free for 14 days". Someone who used
// three runs on day two had twelve days of a product that did nothing and was
// then charged $49. Nothing errors — it simply arrives as a chargeback.

describe("trial allowance", () => {
  it("matches the Essential tier, which is what was promised", () => {
    expect(TRIAL_RUN_LIMIT).toBe(PLANS.essential.runLimit);
    expect(TRIAL_UPLOAD_LIMIT).toBe(PLANS.essential.uploadLimit);
  });

  it("is the agreed allowance, not merely self-consistent", () => {
    // Pinned to the decision itself. If the Essential tier changes, the test
    // above passes and this one fails, which is the prompt to go and ask
    // whether the trial promise was meant to move with it.
    expect(TRIAL_RUN_LIMIT).toBe(10);
    expect(TRIAL_UPLOAD_LIMIT).toBe(5);
    expect(TRIAL_DAYS).toBe(14);
  });

  it("gives the trial enough runs to be usable for its full length", () => {
    // The defect in one line: a trial a customer can exhaust in a day or two,
    // while still being billed at the end of the fortnight.
    expect(TRIAL_RUN_LIMIT).toBeGreaterThan(3);
  });
});
