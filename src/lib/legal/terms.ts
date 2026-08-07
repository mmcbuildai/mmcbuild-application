/**
 * The version of the Terms of Use a user must have accepted.
 *
 * WHY THIS LIVES HERE
 * It used to be a private constant inside `(dashboard)/terms/actions.ts`, which
 * is a `"use server"` file and therefore cannot export a plain value. So the
 * version was WRITTEN to profiles.terms_version on acceptance and never read
 * back — the gate only checked whether `terms_accepted_at` was null. The
 * comment above it said "bump this when the T&C text materially changes to
 * force re-acceptance", and bumping it would have done nothing at all.
 *
 * That mattered the moment the terms gained payment rules: everyone who had
 * already accepted agreed to a document with no auto-renewal and no
 * cancellation clause, and nothing would have asked them again. An acceptance
 * record that cannot distinguish WHICH document was accepted is not much of a
 * record.
 *
 * Now the constant is importable, the gate compares it, and a bump genuinely
 * re-prompts.
 *
 * WHEN TO BUMP
 * On any material change to what the user is agreeing to — payment, renewal,
 * cancellation, liability, data handling. Not for typos or reformatting.
 * Bumping re-prompts EVERY user on their next page load, so it is deliberately
 * a visible act.
 *
 * HISTORY
 *   2026-08-payment       — added payment, renewal and cancellation terms.
 *   2026-08-trial-no-card — briefly described a no-card trial, matching what the
 *     software did at the time. Superseded within hours by Karen's decision
 *     below; live for one morning.
 *   2026-08-trial-card    — the current model, and the one Karen chose
 *     (SCRUM-366, 7 August): a card IS required to start the trial and IS
 *     charged automatically at day 14 unless cancelled. Also states the trial
 *     allowance — 10 runs and 5 uploads — which no version had stated before.
 *
 * Three versions in one week, which is not a record to be proud of. The
 * alternative each time was quietly editing a document people had already
 * accepted, and that is not an alternative. Every user is re-prompted on their
 * next page load; it is one click.
 */
export const TERMS_VERSION = "2026-08-trial-card";

/**
 * Does this user need to accept (or re-accept) the terms?
 *
 * Two cases, both of which must re-prompt:
 *   - never accepted anything
 *   - accepted an older version than the current one
 *
 * A null `version` with a non-null `acceptedAt` is the pre-versioning state:
 * they accepted the beta terms before the version was recorded, so they have
 * not agreed to the payment terms and must be asked again.
 */
export function needsTermsAcceptance(
  acceptedAt: string | null,
  version: string | null,
): boolean {
  if (!acceptedAt) return true;
  return version !== TERMS_VERSION;
}
