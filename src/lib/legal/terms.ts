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
 *   2026-08-payment      — added payment, renewal and cancellation terms.
 *   2026-08-trial-no-card — corrected the trial: the previous version said a card
 *     was required to start it and that we would charge automatically at day 14.
 *     The software has never done either, and the decision (7 August) was to keep
 *     it that way, so the document now matches: no card, no automatic charge, and
 *     the 3-run cap stated rather than left to be discovered.
 *
 * Two bumps in one week is not ideal, and the alternative was quietly editing a
 * document people had already accepted — which is not an alternative. This
 * version asks LESS of a user than the one it replaces, so nobody is worse off
 * for having accepted the earlier one.
 */
export const TERMS_VERSION = "2026-08-trial-no-card";

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
