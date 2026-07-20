/**
 * Beta Test module visibility gate (SCRUM-351).
 *
 * The in-app beta-testing module (the /beta dashboard, the per-module task
 * checklist, the "Feedback on this page" button, and the /admin/beta-activity
 * monitoring pages) is testing scaffolding, not part of the shipped MVP. For Go
 * Live it must be hidden — but nothing is deleted, so it can be switched back on
 * for a future test round by flipping one env var.
 *
 * DEFAULT = ENABLED. Absent or any value other than the literal string "false"
 * keeps the beta module visible, so merging this change alters nothing in the
 * current (still-in-beta) environment. To hide it at Go Live, set
 *   NEXT_PUBLIC_BETA_TESTING_ENABLED=false
 * in the environment (production + preview) and redeploy.
 *
 * NEXT_PUBLIC_* is readable in both server and client components, so this single
 * helper gates every surface (server pages/redirects + client nav/buttons).
 *
 * This gates ONLY the beta-testing UI. The `beta` role/tier, signup, RLS, and
 * the beta_feedback data are intentionally left untouched.
 */
export function isBetaTestingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BETA_TESTING_ENABLED !== "false";
}
