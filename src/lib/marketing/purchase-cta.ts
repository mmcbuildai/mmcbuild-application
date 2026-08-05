/**
 * Public call-to-action mode — waitlist vs purchase (SCRUM-372).
 *
 * Every buy-button on the public site currently reads "Join Waitlist" and leads
 * to a waitlist form. At go-live they must become real purchase calls-to-action
 * pointing at sign-up, or the launch is invisible: the sites are live, payments
 * work, and no visitor has a way in.
 *
 * Doing that as sixteen hand edits (eight surfaces on each of the two sites)
 * was the original plan and is the wrong shape, for three reasons:
 *
 *  1. It makes the rollback real. This flip is deliberately sequenced LAST at
 *     go-live precisely because reverting it closes the door again without
 *     touching Stripe or the application. Manually reverting sixteen edits
 *     under launch pressure is not a rollback; an environment variable is.
 *  2. It removes drift. The two sites have already diverged once. Sixteen hand
 *     edits across two repositories is exactly how one site ends up in purchase
 *     mode while the other still says "Join Waitlist".
 *  3. It is testable before launch — the purchase copy can be verified on a
 *     preview with the flag on, rather than first seen in production.
 *
 * DEFAULT = WAITLIST. Absent, or any value other than the literal string
 * "true", keeps the current waitlist behaviour, so merging this changes nothing
 * anywhere until it is deliberately switched on. To open purchasing:
 *   NEXT_PUBLIC_PURCHASE_CTA_ENABLED=true
 * Note the inverted default against the 3D and beta flags (which default ON and
 * are switched off) — this one must default to the SAFE state, and the safe
 * state here is not selling.
 *
 * ⚠️ Vercel binds environment variables at BUILD time. Changing the value
 * without redeploying leaves production serving the old build while the
 * dashboard shows the new value — it looks done and is not. This has already
 * caught the 3D and beta flags. Redeploy, then verify against the live site.
 *
 * ⚠️ It must be set in BOTH Vercel projects (the app and the marketing site).
 * Setting it in one flips one site.
 *
 * NEXT_PUBLIC_* is readable in server and client components alike, so this one
 * helper gates every surface.
 */
export function isPurchaseCtaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PURCHASE_CTA_ENABLED === "true";
}

/**
 * Where a primary call-to-action leads.
 *
 * Waitlist mode keeps today's behaviour exactly: the page-level anchor where a
 * waitlist form exists on the page, `/contact` where one does not. Purchase
 * mode sends everyone to sign-up, which is where the 14-day trial flow begins
 * (SCRUM-366).
 */
export function ctaHref(waitlistHref: string): string {
  return isPurchaseCtaEnabled() ? "/signup" : waitlistHref;
}

/**
 * The label on a primary call-to-action.
 *
 * FINAL WORDING: "Get started" — Karen, 5 August, settling a genuine
 * disagreement. She approved "Get started" on SCRUM-372 on 4 August; Karthik
 * asked for "Sign Up" on 5 August and that shipped; Karen has now confirmed
 * "Get started" is the final word. Recorded here because two people specified
 * two different labels a day apart and the next person to read this deserves
 * to know which one won and why.
 *
 * ⚠️ Whatever the wording, it says less about the commitment than "Start free
 * trial" did. /signup captures a card and charges on day 15 unless cancelled,
 * and neither "Get started" nor "Sign Up" hints at that. The disclosure
 * therefore rests entirely on `ctaSubtext()` below, which must stay adjacent to
 * every button using this label — if a surface renders the label without the
 * subtext, a card gets captured off a button that never mentioned one.
 */
export const PURCHASE_CTA_LABEL = "Get started";
export const WAITLIST_CTA_LABEL = "Join Waitlist";

export function ctaLabel(): string {
  return isPurchaseCtaEnabled() ? PURCHASE_CTA_LABEL : WAITLIST_CTA_LABEL;
}

/**
 * A custom-priced plan (Enterprise) has no self-serve path — there is no price
 * to check out against — so in purchase mode it routes to contact rather than
 * sign-up. Sending it to sign-up would drop an enterprise buyer into a $49
 * Essential trial, which is worse than the waitlist it replaced.
 */
export const ENTERPRISE_CTA_LABEL = "Contact sales";

export function ctaLabelForPlan(isCustomPriced: boolean): string {
  if (!isPurchaseCtaEnabled()) return WAITLIST_CTA_LABEL;
  return isCustomPriced ? ENTERPRISE_CTA_LABEL : PURCHASE_CTA_LABEL;
}

export function ctaHrefForPlan(
  isCustomPriced: boolean,
  waitlistHref: string,
): string {
  if (!isPurchaseCtaEnabled()) return waitlistHref;
  return isCustomPriced ? "/contact" : "/signup";
}

/**
 * Supporting copy under a primary call-to-action.
 *
 * In purchase mode the trial terms must sit next to the button: the card is
 * captured at sign-up and charged on day 15 unless cancelled, and a captured
 * card must never be a surprise. Empty in waitlist mode, where there is nothing
 * to disclose.
 */
export function ctaSubtext(): string {
  return isPurchaseCtaEnabled()
    ? "14 days free. Card required at sign-up, charged when the trial ends unless you cancel."
    : "";
}

/**
 * Whether the waitlist SECTIONS (and their "join the waitlist for exclusive
 * early access" copy) still make sense. They become wrong the moment the
 * product is buyable — not just the buttons above them.
 */
export function showWaitlistSections(): boolean {
  return !isPurchaseCtaEnabled();
}
