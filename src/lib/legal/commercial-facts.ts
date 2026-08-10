/**
 * The commercial facts, stated ONCE.
 *
 * WHY THIS EXISTS
 * These facts — how long the free periods run, what they include, whether a card
 * is taken, whether anything is charged — were prose in eleven places. Prose has
 * nothing tying it to the software, so it stays wherever it was typed while the
 * system moves underneath it, and no diff ever shows the divergence because the
 * sentence does not change. That is not a hypothetical:
 *
 *   25 Jun  the run cap became 10. A sentence saying 3 stayed put, and was still
 *           being copied into new documents on 10 August.
 *   7 Aug   074c5e2 "terms now describe the trial we actually run" corrected the
 *           terms to card-free. 35053b2 overwrote it the SAME DAY with Option A,
 *           a model the software has never run. Live under a tickbox for three
 *           days.
 *   10 Aug  the pricing pages disagreed about whether a card was needed. Both
 *           sentences were true — of different doors — so every review passed.
 *
 * Each was found by a person reading two pages side by side, which is not a
 * control. A surface that imports its numbers cannot state the wrong ones.
 *
 * WHAT BELONGS HERE
 * Facts a customer could hold us to. Not wording — the legal text stays written
 * by hand in its own file, because it is a document, not a template. This module
 * supplies the parts that DRIFT: the figures, and the card/charge claims.
 *
 * ⚠️ THE POINT IS DERIVATION, NOT RELOCATION.
 * `CHECKOUT_REQUIRES_CARD` is consumed by the Stripe call in
 * `(dashboard)/billing/actions.ts` — it sets `payment_method_collection`. So the
 * sentence and the behaviour read the same constant and cannot disagree. A
 * boolean merely *asserting* what Stripe does would be a second place to be
 * wrong, which is the problem rather than the fix.
 */

/**
 * ⚠️ THIS FILE HAS NO IMPORTS, ON PURPOSE, AND MUST KEEP NONE.
 *
 * It is byte-identical in mmcbuild-application and mmcbuild-marketing and
 * guarded by `sibling-parity` — the same discipline as purchase-cta.ts, which
 * consumes it. The marketing site has no `lib/stripe`, so anything imported
 * here could not resolve there, and the two copies would stop being copies.
 *
 * That is also why the three primitives are DECLARED here rather than in
 * `lib/stripe/plans`, which re-exports them: the facts are what we tell a
 * customer, and Stripe is one of the places that enforces them, not their home.
 */

/** How long the ACCOUNT's free period runs. */
export const TRIAL_DAYS = 14;

/**
 * What the account's free period includes.
 *
 * Deliberately equal to PLANS.essential.runLimit / uploadLimit, pinned by
 * `tests/unit/billing/trial-allowance.test.ts` so the pair cannot drift.
 *
 * ⚠️ This number was declared TWICE for months — here (as `persona-access`) and
 * in `plans` — both 10, with the sidebar reading one and the terms the other.
 * Nothing would have reported the day they disagreed. It is now declared once
 * and re-exported, and a test fails if a second declaration appears.
 */
export const TRIAL_RUN_LIMIT = 10;
export const TRIAL_UPLOAD_LIMIT = 5;

/**
 * Sign-up takes no card.
 *
 * ⚠️ Not derivable the way the checkout flag is: this is the ABSENCE of a
 * payment step, and absence has no constant to export. It is pinned by test
 * instead (`commercial-facts.test.ts` asserts no Stripe session is created on
 * the signup path), because the alternative is trusting that nobody adds one.
 */
export const SIGNUP_REQUIRES_CARD = false;

/**
 * Checkout takes a card. CONSUMED by the Stripe session — see the file header.
 *
 * With a trial present Stripe's default (`if_required`) collects NOTHING, and
 * creates a subscription with no card that fails its first charge silently
 * fourteen days later.
 */
export const CHECKOUT_REQUIRES_CARD = true;

/** Stripe's value for the above. Keeps the mapping in one place. */
export const PAYMENT_METHOD_COLLECTION = CHECKOUT_REQUIRES_CARD ? "always" : "if_required";

/**
 * Subscribing grants a SECOND free period, on top of the account's.
 *
 * ⚠️ Open question, not a settled feature: SCRUM-393 asks whether it should
 * exist. Stating it accurately is not an endorsement — but while it is what the
 * software does, it is what the terms must say.
 */
export const SUBSCRIPTION_GRANTS_FURTHER_TRIAL = true;

/** After the subscription's trial, the stored card is charged automatically. */
export const SUBSCRIPTION_AUTO_CHARGES = true;

/** "10 compliance runs and 5 plan uploads" */
export function trialAllowanceText(): string {
  return `${TRIAL_RUN_LIMIT} compliance runs and ${TRIAL_UPLOAD_LIMIT} plan uploads`;
}

/** "14 days" — the account's free period. */
export function accountTrialLengthText(): string {
  return `${TRIAL_DAYS} days`;
}

/** "14-day" — adjectival form, for "a 14-day free trial". */
export function trialLengthAdjective(): string {
  return `${TRIAL_DAYS}-day`;
}

/**
 * The one sentence that has caused the most trouble, so it is written once.
 * "No payment card is required to create an account, and none is stored."
 */
export function signupCardClause(): string {
  return SIGNUP_REQUIRES_CARD
    ? "A payment card is required to create an account."
    : "No payment card is required to create an account, and none is stored.";
}

/** "No credit card required" — the short marketing form of the same fact. */
export function signupCardClauseShort(): string {
  return SIGNUP_REQUIRES_CARD ? "Credit card required" : "No credit card required";
}
