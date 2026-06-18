// Platform operator identity = an EMAIL allowlist, NOT an org role.
//
// This distinction is load-bearing: a supplier/tester who self-signs-up becomes
// the OWNER of their own personal org (see (auth)/actions.ts + auth/callback).
// So "owner/admin role" cannot mean "our staff" — every self-signup is an owner
// of something. Cross-org / platform-wide surfaces (e.g. the global beta-activity
// view) MUST gate on this allowlist, never on role, or they leak every tester's
// data to every self-signed-up supplier.
//
// Baked-in defaults so the gate works on deploy without a separate env step;
// ADMIN_EMAILS (comma-separated) extends it for any operators added later.
export const DEFAULT_OPERATOR_EMAILS = [
  "dennis@corporateaisolutions.com",
  "karen.engel@mmcbuild.com.au",
  "karthik.rao@mmcbuild.com.au",
];

/** The full, normalised operator allowlist (defaults + ADMIN_EMAILS env). */
export function operatorEmails(): string[] {
  return [
    ...DEFAULT_OPERATOR_EMAILS,
    ...(process.env.ADMIN_EMAILS ?? "").split(","),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True if the given email is a platform operator (our staff), case-insensitive. */
export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return operatorEmails().includes(email.toLowerCase());
}
