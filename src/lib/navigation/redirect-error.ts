/**
 * Recognise the error a Next.js server-action redirect throws on the client.
 *
 * WHY THIS EXISTS
 * `redirect()` inside a server action is implemented as a throw. When a client
 * component awaits that action inside a try/catch — which every dialog in this
 * app does, because the same action also returns `{ error }` for failures the
 * user can act on — the catch sees the redirect and treats it as a failure.
 * The user is then held in the dialog and shown the framework's internal
 * string as though it were the reason their action did not work.
 *
 * That is the same class of defect as SCRUM-378 itself: a real outcome
 * arriving as a meaningless message. A catch that shows errors to a human must
 * therefore let this one through untouched.
 *
 * We key on the `digest` prefix rather than importing Next's own predicate,
 * which lives under `next/dist/client/components/...` and is not a public
 * entry point — importing it couples us to a private path that has moved
 * between releases. The digest format (`NEXT_REDIRECT;<kind>;<url>;...`) is
 * the same string `global-error.tsx` already keys on.
 */
export function isRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * The sibling case: `notFound()` throws with its own digest. Included so a
 * caller does not have to remember that there are two of these.
 */
export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_NOT_FOUND");
}

/** True for any control-flow throw Next uses for navigation. */
export function isNavigationError(error: unknown): boolean {
  return isRedirectError(error) || isNotFoundError(error);
}
