import { TRIAL_DAYS } from "@/lib/legal/commercial-facts";

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
 * ⚠️ HISTORY, because this claim has now been wrong in BOTH directions.
 * On 2026-08-09 this note said "/signup captures a card and charges on day 15",
 * which was false — sign-up took no card — and the belief put a false claim on
 * every public page. It was corrected to "captures NO card", which was true
 * until 2026-08-13, when sign-up was rewired to lead into Stripe checkout.
 *
 * What happens NOW: "Get started" carries its plan to /signup, which creates
 * the account and redirects to /billing/start, which opens a Stripe session
 * with `payment_method_collection: "always"`. A card IS taken, nothing is
 * charged for 14 days, and the customer can cancel before then. The single
 * source for all of that is `SIGNUP_REQUIRES_CARD` in commercial-facts.ts —
 * read it there rather than restating it in a comment that goes stale.
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

/**
 * ⚠️ THE PLAN MUST TRAVEL WITH THE CLICK (2026-08-13).
 *
 * This returned a bare `/signup`, which took no card and granted a free 14-day
 * trial from a database default — so every plan button on both sites, under
 * every price, led AWAY from payment. Checkout existed and was correct; nothing
 * pointed at it. Live Stripe showed zero checkout sessions in 48 hours while
 * advertising was running.
 *
 * The plan and interval now ride on the query string, and sign-up carries them
 * into `/billing/start`, which creates the Stripe session. A bare `/signup`
 * still reaches checkout on Essential — see the note in that route.
 */
export function ctaHrefForPlan(
  isCustomPriced: boolean,
  waitlistHref: string,
  planId?: string,
  interval?: "month" | "year",
): string {
  if (!isPurchaseCtaEnabled()) return waitlistHref;
  if (isCustomPriced) return "/contact";
  const params = new URLSearchParams();
  if (planId) params.set("plan", planId);
  params.set("interval", interval === "year" ? "year" : "month");
  return `/signup?${params.toString()}`;
}

/**
 * Small print under a primary call-to-action: what a visitor is committing to
 * when they click it.
 *
 * ⚠️ REWRITTEN 2026-08-13. The two doors are now one.
 *
 * This note used to explain that sign-up took no card while checkout did, and
 * that the wording had to describe sign-up because that is where the buttons
 * led. That is no longer true: every "Get started" now carries its plan into
 * `/billing/start`, which creates the Stripe session, so the visitor reaches
 * the card. A card IS required, and saying otherwise under a price is a false
 * claim on a page that takes payment.
 *
 * The sentence states all four facts a buyer is entitled to before clicking:
 * the trial length, that a card is taken now, that nothing is charged during
 * the trial, and that they can cancel before it ends.
 *
 * Empty in waitlist mode, where there is no card and nothing to disclose.
 */
export function ctaSubtext(): string {
  return isPurchaseCtaEnabled()
    ? `${TRIAL_DAYS} days free, all modules unlocked. Card required to start — ` +
      `nothing charged for ${TRIAL_DAYS} days, cancel any time before then.`
    : "";
}

/**
 * The trial headline — deliberately separate from `ctaSubtext()` above.
 * "14 days free, all modules unlocked" is the strongest reason to click
 * "Get started" and was previously buried as small grey subtext under the
 * button; callers should give it prominent, attention-grabbing treatment
 * rather than pairing it with the billing fine print.
 *
 * Empty in waitlist mode, where there is no trial to advertise.
 */
export function trialHighlight(): string {
  return isPurchaseCtaEnabled()
    ? `${TRIAL_DAYS} days free, all modules unlocked`
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
