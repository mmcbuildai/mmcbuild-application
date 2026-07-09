/**
 * Inline compliance flagging for MMC Build design-optimisation suggestions
 * (SCRUM-174).
 *
 * Today Build (design optimisation) and Comply (NCC check) run as separate
 * pipelines, so a user can decide to pursue an MMC suggestion (e.g. switch
 * external walls to EPS-core SIPs) that would fail Comply for this site — and
 * not find out until they run a full Comply pass later. Karen (2026-05-01):
 * "if anything … is out of compliance, red-flag it then and there, rather than
 * have them go through a process and then go back and re-jig it."
 *
 * This module is that early-warning check. It is DETERMINISTIC (no AI, no
 * network) so it resolves instantly (the "within 2s" acceptance) and costs
 * nothing to recompute, and it leans on the AUTHORITATIVE site data captured in
 * PR #87/#88 (`property_profile.environment.bal` / `climateZoneNumber`) with the
 * questionnaire as fallback. It is ADVISORY: it surfaces well-known MMC-method ×
 * NCC conflicts as a "verify in Comply" heads-up, never a definitive pass/fail —
 * the authoritative determination is still the full Comply run.
 *
 * Pure — no I/O, no side effects — so the rules are fully unit-testable.
 */

import { normaliseBal } from "@/lib/comply/property-reconciliation";
import type { PropertyProfile } from "@caistech/property-services-sdk";

export interface SuggestionComplianceContext {
  /** Normalised BAL rank key ("12.5" | "19" | "29" | "40" | "FZ" | "LOW") or null. */
  bal: string | null;
  climateZone: number | null;
  buildingClass: string | null;
  /** "Type A" | "Type B" | "Type C" or null. */
  constructionType: string | null;
  /** Attached/party-wall dwelling (duplex, townhouse, terrace). */
  attachedDwelling: boolean;
}

export interface SuggestionComplianceFlag {
  severity: "warning" | "caution";
  /** Short label for the card badge. */
  title: string;
  /** One-sentence explanation for the expanded card. */
  detail: string;
  /** The NCC/AS reference this concerns. */
  nccClause: string;
}

/**
 * MMC categories whose EXTERNAL WALL build-up is (or commonly is) combustible —
 * the systems AS 3959 / fire-resistance provisions bite on. Steel framing and
 * precast concrete are non-combustible and are deliberately excluded.
 */
const COMBUSTIBLE_WALL_SYSTEMS = new Set([
  "sip_panels", // EPS / PUR cores are combustible
  "clt_mass_timber",
  "prefabricated_wall_panels", // typically timber-framed
  "hybrid_systems", // may incorporate timber
]);

/**
 * Lightweight wall systems whose party/separating-wall detail must be checked
 * for the required FRL + acoustic performance (masonry/precast usually pass, so
 * they're excluded).
 */
const LIGHTWEIGHT_WALL_SYSTEMS = new Set([
  "sip_panels",
  "clt_mass_timber",
  "prefabricated_wall_panels",
  "steel_framing",
  "hybrid_systems",
]);

function label(category: string): string {
  const map: Record<string, string> = {
    sip_panels: "SIP panels",
    clt_mass_timber: "CLT / mass timber",
    prefabricated_wall_panels: "prefabricated wall panels",
    hybrid_systems: "hybrid system",
    steel_framing: "light-gauge steel framing",
  };
  return map[category] ?? category.replace(/_/g, " ");
}

/**
 * Build the compliance context from the project's questionnaire responses +
 * authoritative property profile. Authoritative site data wins for BAL/climate
 * (it's ground truth); the questionnaire supplies building class, construction
 * type and the attached-dwelling flag. All fields degrade to null/false.
 */
export function buildComplianceContext(
  questionnaire: Record<string, unknown> | null | undefined,
  profile: PropertyProfile | null | undefined,
): SuggestionComplianceContext {
  const q = questionnaire ?? {};
  const bal =
    normaliseBal(profile?.environment?.bal) ?? normaliseBal(q.bal_rating as string);

  const climateFromProfile = profile?.environment?.climateZoneNumber ?? null;
  const climateFromQ = Number(q.climate_zone);
  const climateZone =
    climateFromProfile != null
      ? climateFromProfile
      : Number.isFinite(climateFromQ)
        ? climateFromQ
        : null;

  const attached =
    q.attached_dwelling === true || q.attached_dwelling === "true";

  return {
    bal,
    climateZone,
    buildingClass: typeof q.building_class === "string" ? q.building_class : null,
    constructionType:
      typeof q.construction_type === "string" ? q.construction_type : null,
    attachedDwelling: attached,
  };
}

/**
 * Deterministic inline compliance check for a single suggestion. Returns the
 * highest-severity flag that applies, or null when nothing well-known is at
 * risk. Advisory only — always points the user to the full Comply run.
 */
export function checkSuggestionCompliance(input: {
  technologyCategory: string;
  context: SuggestionComplianceContext;
}): SuggestionComplianceFlag | null {
  const { technologyCategory: cat, context: c } = input;
  const flags: SuggestionComplianceFlag[] = [];

  // --- Rule 1: bushfire (BAL) vs combustible external wall systems ---------
  // AS 3959 escalates construction requirements with BAL. At BAL-40 / FZ,
  // combustible external cladding is heavily restricted / non-combustible is
  // effectively required.
  if (c.bal && COMBUSTIBLE_WALL_SYSTEMS.has(cat)) {
    if (c.bal === "FZ" || c.bal === "40") {
      flags.push({
        severity: "warning",
        title: `May not meet BAL-${c.bal} bushfire construction`,
        detail: `This site is BAL-${c.bal}. Combustible external wall systems such as ${label(cat)} must satisfy AS 3959 for BAL-${c.bal}, which typically requires non-combustible cladding or specific protection. Confirm the build-up in Comply before committing.`,
        nccClause: "AS 3959 / NCC Vol 2 Part G5",
      });
    } else if (c.bal === "29" || c.bal === "19") {
      flags.push({
        severity: "caution",
        title: `BAL-${c.bal} bushfire requirements apply`,
        detail: `This site is BAL-${c.bal}. A ${label(cat)} external wall must meet the AS 3959 bushfire construction requirements for BAL-${c.bal}. Confirm the detailing in Comply.`,
        nccClause: "AS 3959 / NCC Vol 2 Part G5",
      });
    }
  }

  // --- Rule 2: Type A / Type B construction vs combustible systems ---------
  // Type A/B (larger / higher-rise) construction generally requires
  // non-combustible elements and rated FRLs; a combustible MMC needs a
  // fire-engineering / Performance Solution pathway.
  const ctype = (c.constructionType ?? "").toLowerCase();
  if (
    (ctype.includes("type a") || ctype.includes("type b")) &&
    COMBUSTIBLE_WALL_SYSTEMS.has(cat)
  ) {
    const t = ctype.includes("type a") ? "A" : "B";
    flags.push({
      severity: "warning",
      title: `Type ${t} construction expects non-combustible elements`,
      detail: `This project is Type ${t} construction, which generally requires non-combustible construction and rated fire-resistance levels. A ${label(cat)} system would need a fire-engineering / Performance Solution pathway. Confirm in Comply.`,
      nccClause: "NCC Vol 1 C2 / Spec 5 (fire resistance)",
    });
  }

  // --- Rule 3: party/separating wall vs lightweight systems ----------------
  // A separating wall between attached dwellings needs the required FRL
  // (typically 60/60/60) AND acoustic performance (Rw+Ctr ≥ 50). Lightweight
  // systems can meet this, but the detail must be verified.
  if (c.attachedDwelling && LIGHTWEIGHT_WALL_SYSTEMS.has(cat)) {
    flags.push({
      severity: "caution",
      title: "Party-wall FRL + acoustic must be verified",
      detail: `This is an attached dwelling, so a separating (party) wall must achieve the required fire-resistance level (typically 60/60/60) and acoustic performance (Rw+Ctr ≥ 50). Confirm the ${label(cat)} party-wall detail meets both in Comply.`,
      nccClause: "NCC Vol 2 Part 5.8 (fire) / Part 5.10 (sound) — Class 1",
    });
  }

  if (flags.length === 0) return null;
  // Highest severity first (warning > caution); stable within a severity.
  flags.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return flags[0];
}

function severityRank(s: SuggestionComplianceFlag["severity"]): number {
  return s === "warning" ? 2 : 1;
}
