/**
 * "Continue with Google" visibility gate (SCRUM-240).
 *
 * The button and its whole sign-in path have been built and merged since 17
 * July (PR #110). What was never done is the account-side half: a Google Cloud
 * OAuth client entered into Supabase Auth. Without it the button renders
 * perfectly, and clicking it returns
 *
 *     Unsupported provider: provider is not enabled
 *
 * Karthik, 8 August: "Please hide the option for now."
 *
 * DEFAULT = DISABLED, and that direction is deliberate.
 *
 * The comparable flags in this codebase (beta module, 3D rendering) default to
 * ENABLED and are switched off — which means an unset or misspelt variable
 * leaves the feature ON. That is the right default for hiding something that
 * works. It is the wrong default here, because the thing being gated does not
 * work: an unset variable would put a broken button back on the login page, in
 * front of someone trying to reach the product for the first time.
 *
 * So this one fails closed. The button appears only when the variable is
 * explicitly the string "true", which is a thing you can only do on purpose —
 * and the person who does it will be the person who has just finished
 * configuring the provider.
 *
 * To switch on, once Google is configured in Supabase Auth:
 *   NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED=true
 * in production and preview, then REDEPLOY. These bind at build time, so
 * setting the value alone changes nothing — and the Vercel dashboard will show
 * the new value as though it had worked.
 *
 * NEXT_PUBLIC_* so one helper gates both the server-rendered auth pages and any
 * client component that needs it.
 */
export function isGoogleSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED === "true";
}
