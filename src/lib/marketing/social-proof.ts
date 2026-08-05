/**
 * Social proof — partners and testimonials (SCRUM-376).
 *
 * WHY THIS FILE IS EMPTY
 *
 * The homepage previously carried a "Trusted Partners" strip naming eight real
 * builders, three testimonials from named people at named companies, and a
 * results strip ("100+ Active Professionals · 50+ Projects Delivered · $2M+
 * Cost Savings"). None of it was true — there were around twenty leads in the
 * database, no external testers, and no customers those quotes could have come
 * from. It was added deliberately as a placeholder for future partnerships and
 * was never replaced. It was removed from production on 2026-08-05.
 *
 * Karen asked for the SECTION to be kept so real partners can be added later
 * without rebuilding it. That is what this is: the structure, with no content.
 *
 * ⚠️ THE NAMES DO NOT COME BACK HERE. Restoring the layout is safe; restoring
 * "Lendlease", "Mirvac" or "Sarah Jenkins" behind a flag is not — it would put
 * the same false claims one setting away from being live again, and whoever
 * flipped that setting later would have no way to know they were never real.
 * Anything added below must be a real relationship with written permission to
 * use the name, or a real quote from a real user with their consent.
 *
 * HOW TO TURN IT ON
 *
 *   1. Add the real entries to PARTNERS / TESTIMONIALS below.
 *   2. Set NEXT_PUBLIC_SOCIAL_PROOF_ENABLED=true in BOTH Vercel projects.
 *
 * Both steps are required. An empty list renders nothing even when the flag is
 * on, so switching it early cannot produce an empty box on the live site — and
 * more importantly, the flag alone can never resurrect content that isn't here.
 *
 * This file is intentionally BYTE-IDENTICAL in mmcbuild-marketing and
 * mmcbuild-application, the same discipline as lib/marketing/purchase-cta.ts.
 * If you change it here, change it there in the same pair of PRs.
 */

export type Partner = {
  /** The organisation's name, exactly as they have agreed it may be shown. */
  name: string;
  /** Path to their logo in /public. Emoji are not logos — that was the tell last time. */
  logoSrc: string;
  /** Who confirmed permission to use the name and mark, and when. Not rendered. */
  permission: string;
};

export type Testimonial = {
  quote: string;
  author: string;
  role: string;
  company: string;
  /** Who obtained consent to publish this, and when. Not rendered. */
  consent: string;
};

/** Real partners only. See the warning above. */
export const PARTNERS: Partner[] = [];

/** Real, consented quotes from real users only. See the warning above. */
export const TESTIMONIALS: Testimonial[] = [];

/**
 * Strict equality against the literal string, matching isPurchaseCtaEnabled().
 * Unset, "TRUE", "1" and "yes" all leave it off — the only way to turn this on
 * is to mean it.
 */
export function isSocialProofEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SOCIAL_PROOF_ENABLED === "true";
}

/** Show the partners strip only when it is switched on AND there is something real to show. */
export function showPartners(): boolean {
  return isSocialProofEnabled() && PARTNERS.length > 0;
}

/** Show the testimonials only when switched on AND there is something real to show. */
export function showTestimonials(): boolean {
  return isSocialProofEnabled() && TESTIMONIALS.length > 0;
}
