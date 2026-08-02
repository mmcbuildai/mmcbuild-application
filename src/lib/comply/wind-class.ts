/**
 * AS 4055 wind-class option filtering from the address-derived wind region.
 *
 * SCRUM-317 asked for a pre-filled DEFAULT wind class derived from the site
 * address. That is not currently derivable: an AS 4055 class is set by the SITE
 * design gust speed — the AS/NZS 1170.2 regional speed with the terrain/height,
 * shielding and topographic multipliers applied — and the property-services
 * `derive` API returns only the region plus a per-region constant speed (see
 * caistech/property-services#57). Two houses on one street, one on an exposed
 * ridge and one shielded mid-block, share a region and differ in class. Picking
 * a specific class from the region alone would be a guess, and an understated
 * wind class understates tie-down and bracing requirements.
 *
 * What the region DOES determine, unambiguously, is the class FAMILY: regions A
 * and B are non-cyclonic (N1–N6), regions C and D are cyclonic (C1–C4). That is
 * already stated to the user in the field's helper text. This module enforces it
 * in the control itself, so a cyclonic site cannot be given an N class by
 * mis-click — which is the error this field is actually prone to.
 *
 * Deliberately NOT a default value: it narrows the choice to the correct family
 * and leaves the engineering judgement with the user.
 */

/** Every AS 4055 class, in the canonical order the questionnaire lists them. */
export const ALL_WIND_CLASSIFICATIONS = [
  "N1",
  "N2",
  "N3",
  "N4",
  "N5",
  "N6",
  "C1",
  "C2",
  "C3",
  "C4",
] as const;

const NON_CYCLONIC = ["N1", "N2", "N3", "N4", "N5", "N6"] as const;
const CYCLONIC = ["C1", "C2", "C3", "C4"] as const;

/**
 * The cyclonic/non-cyclonic family implied by an AS/NZS 1170.2 wind region.
 *
 * Accepts the region shapes property-services returns — "A1".."A4", "B", "C",
 * "D" — and a bare "A". Returns null for anything unrecognised so callers fall
 * back to the full list rather than filtering on a bad parse (degrade, don't
 * fake).
 */
export function windClassFamilyForRegion(
  windRegion: string | null | undefined,
): "non-cyclonic" | "cyclonic" | null {
  if (!windRegion) return null;
  const first = windRegion.trim().charAt(0).toUpperCase();
  if (first === "A" || first === "B") return "non-cyclonic";
  if (first === "C" || first === "D") return "cyclonic";
  return null;
}

/**
 * Wind-class options to offer for a site in `windRegion`.
 *
 * `currentValue` is always retained even when it falls outside the family, so a
 * previously saved answer is never silently dropped from the control (which
 * would look to the user like the app had discarded their input, and would
 * submit an empty value on the next save).
 */
export function windClassOptionsForRegion(
  windRegion: string | null | undefined,
  currentValue?: string | null,
): string[] {
  const family = windClassFamilyForRegion(windRegion);
  const base: readonly string[] =
    family === "non-cyclonic"
      ? NON_CYCLONIC
      : family === "cyclonic"
        ? CYCLONIC
        : ALL_WIND_CLASSIFICATIONS;

  if (currentValue && !base.includes(currentValue)) {
    return [...base, currentValue];
  }
  return [...base];
}

/**
 * Helper text for the wind-class field. Explains what the region did and did
 * not determine — the honest version of "we filled this in for you", since the
 * class itself still needs the user's terrain and shielding judgement.
 */
export function windClassHelperText(
  windRegion: string | null | undefined,
): string {
  const family = windClassFamilyForRegion(windRegion);
  if (!family) {
    return (
      "Site wind class (AS 4055) — assess from terrain, shielding and topography " +
      "for the site."
    );
  }
  const shown = family === "cyclonic" ? "cyclonic C classes" : "N classes";
  return (
    `Your address is in wind region ${windRegion} (AS 1170.2), so only the ` +
    `${shown} are applicable and the list is limited to those. The exact class ` +
    `still depends on terrain, shielding and topography at the site — assess and ` +
    `select it.`
  );
}
