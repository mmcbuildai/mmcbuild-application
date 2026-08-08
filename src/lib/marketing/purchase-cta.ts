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
 * ⚠️ CORRECTED 2026-08-09. This note previously said "/signup captures a card
 * and charges on day 15 unless cancelled". That is not what the code does, and
 * the belief produced a false claim on every public page — see `ctaSubtext()`.
 *
 * What actually happens: /signup captures NO card. It creates an organisation
 * with a 14-day trial (migration 00027) and all modules unlocked. A card is
 * captured later, at Stripe Checkout, which is a separate deliberate step —
 * `payment_method_collection: "always"` in billing/actions.ts is what forces it
 * there. So the subtext still belongs next to the button, but as an accurate
 * description of a free start, not a warning about a card nobody is taking yet.
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
 * ⚠️ THE PREVIOUS WORDING WAS FALSE, and it was false next to every "Get
 * started" button on both websites: "14 days free. Card required at sign-up,
 * charged when the trial ends unless you cancel."
 *
 * No card is required at sign-up. The signup page itself said so one click
 * later — "No credit card required" — so a visitor met two contradictory
 * statements about their card in the space of a single click, on a product
 * that had just started charging real ones.
 *
 * The wording below states only what is certain today and stays true whichever
 * way the open trial-model question is decided (SCRUM-391): the trial is 14
 * days, all modules are unlocked, no card is needed to begin, and a card is
 * taken when the customer subscribes.
 *
 * ⚠️ Deliberately NOT stated: the 10-run cap (TRIAL_RUN_LIMIT), which no
 * pre-signup surface currently discloses, and the fact that subscribing today
 * grants a FURTHER 14-day Stripe trial on top of this one. Both are real, both
 * are Karen's decisions on SCRUM-391, and neither is something to resolve by
 * inventing copy. Update this the moment she answers.
 *
 * Empty in waitlist mode, where there is nothing to disclose.
 */
export function ctaSubtext(): string {
  return isPurchaseCtaEnabled()
    ? "14 days free, all modules unlocked. No card needed to start — you add one when you subscribe."
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
