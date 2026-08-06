/**
 * Case-studies visibility switch.
 *
 * The page publishes two named projects — "Morpeth Gardens Country Club,
 * 39 Metford Road, Tenambit NSW" and "44 Hugh Street Residence, Belmore NSW" —
 * each with quantified build-time, cost, energy and carbon savings, plus
 * testimonials attributed to a "Project Manager, Urban Dwell Constructions" and
 * a "Homeowner, Private Client". The page headline is "Real projects, real
 * results".
 *
 * ⚠️ WHETHER THOSE ARE REAL HAS NOT BEEN CONFIRMED, and the homepage carried
 * fabricated partner logos, testimonials and metrics until they were removed on
 * 5 August (SCRUM-376). Same page, same build, same shape of claim. Until
 * someone confirms these two projects and those numbers, the safe position is
 * not to link to them.
 *
 * HIDING THE LINKS IS NOT THE SAME AS REMOVING THE CLAIM. The page still
 * exists at /case-studies and can be reached directly or from a search result,
 * which is why `caseStudiesNoIndex()` exists — with the switch off, the page
 * asks search engines not to index it. That reduces the exposure; it does not
 * eliminate it. If the projects turn out not to be real, the page content has
 * to go, exactly as the homepage blocks did.
 *
 * To turn it back on: set NEXT_PUBLIC_CASE_STUDIES_ENABLED=true in BOTH Vercel
 * projects — but only once the projects and figures are confirmed.
 *
 * Byte-identical in mmcbuild-marketing and mmcbuild-application, the same
 * discipline as lib/marketing/purchase-cta.ts. Change it in one, change it in
 * the other, in the same pair of PRs.
 */

/** Strict equality against the literal string, matching the other switches. */
export function isCaseStudiesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CASE_STUDIES_ENABLED === "true";
}

/** Show the Case Studies link in navigation and the footer. */
export function showCaseStudiesLinks(): boolean {
  return isCaseStudiesEnabled();
}

/**
 * Ask search engines not to index the page while it is switched off. Without
 * this, hiding the links leaves the claims live and findable — quieter, but
 * just as published.
 */
export function caseStudiesNoIndex(): boolean {
  return !isCaseStudiesEnabled();
}
