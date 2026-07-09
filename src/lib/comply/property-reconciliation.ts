/**
 * Authoritative site reconciliation for MMC Comply.
 *
 * As of PR #87 every project stores the full authoritative `PropertyProfile`
 * (zoning envelope, planning overlays, terrain, environment) derived from the
 * property-services register. Comply's AI pipeline, however, only ever read site
 * facts OFF THE UPLOADED PLAN — so a plan that states the wrong height/BAL/
 * setback, or silently ignores a flood/heritage overlay the site actually
 * carries, was never caught against ground truth.
 *
 * This module closes that gap with a DETERMINISTIC (no-AI) cross-check: it
 * compares the plan-extracted attributes (`plans.design_attributes`) + the
 * questionnaire answers against the authoritative profile and emits
 * `ComplianceFinding`s for real discrepancies and for authoritative overlays the
 * plan must address. It is engine-first-with-fallback: every field is treated as
 * optional, and an absent profile (the normal degraded case when property-
 * services is unconfigured) yields zero findings rather than throwing.
 *
 * REGULATED — the logic is conservative on purpose. It only asserts
 * `non_compliant` where the ground truth PROVES a breach (a scalar plan value
 * beyond an authoritative limit, or a boundary distance below the smallest
 * required setback); everywhere it cannot prove compliance it emits an
 * `advisory` "confirm …" rather than a false assurance. Pure — no I/O, no side
 * effects — so it is fully unit-testable per the repo's "regression test per new
 * compliance rule" standard.
 */

import type { PropertyProfile } from "@caistech/property-services-sdk";
import type { ComplianceFinding, ContributorDiscipline } from "@/lib/ai/types";
import type { DesignAttributes } from "./questionnaire-prefill";

export interface ReconciliationInput {
  profile: PropertyProfile | null | undefined;
  attrs: DesignAttributes | null | undefined;
  questionnaire:
    | Record<string, string | number | boolean | null | undefined>
    | null
    | undefined;
}

// Measurement tolerances — an extracted value within this band of an
// authoritative limit is NOT treated as a breach (drawings + register both carry
// rounding). Chosen conservatively so a genuine exceedance still trips.
const TOL_HEIGHT_M = 0.3;
const TOL_SETBACK_M = 0.2;
const STEEP_SLOPE_PCT = 15;

/** Bushfire Attack Level severity ranking (higher = more severe construction). */
const BAL_RANK: Record<string, number> = {
  LOW: 0,
  "12.5": 1,
  "19": 2,
  "29": 3,
  "40": 4,
  FZ: 5,
};

/** Normalise a BAL string ("BAL-29", "BAL 29", "29", "bal-fz") to its rank key. */
export function normaliseBal(raw: unknown): string | null {
  if (raw == null) return null;
  const v = String(raw).toUpperCase().replace(/BAL/g, "").replace(/[^0-9A-Z.]/g, "");
  if (!v || v === "NA") return null;
  if (v === "FZ" || v === "FLAMEZONE") return "FZ";
  if (v === "LOW") return "LOW";
  if (v in BAL_RANK) return v;
  // Accept "12" → "12.5" style near-matches.
  if (v.startsWith("12")) return "12.5";
  return null;
}

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function makeFinding(f: {
  ncc_section: string;
  category: string;
  title: string;
  description: string;
  recommendation: string;
  severity: ComplianceFinding["severity"];
  confidence: number;
  ncc_citation: string;
  responsible_discipline: ContributorDiscipline;
}): ComplianceFinding {
  return {
    ncc_section: f.ncc_section,
    category: f.category,
    title: f.title,
    description: f.description,
    recommendation: f.recommendation,
    severity: f.severity,
    confidence: f.confidence,
    ncc_citation: f.ncc_citation,
    page_references: [],
    responsible_discipline: f.responsible_discipline,
    remediation_action: f.recommendation,
  };
}

/** Prefix that marks a finding as sourced from the authoritative site register
 *  (not an NCC-clause reading of the plan), so the report/reviewer can tell them
 *  apart from the AI's plan analysis. */
const SITE = "Site register";

/**
 * Cross-check the uploaded design against the authoritative property profile.
 * Returns findings for real breaches + authoritative overlays the plan must
 * address. Empty array when there is no profile (degraded/normal case).
 */
export function reconcileAuthoritative(
  input: ReconciliationInput,
): ComplianceFinding[] {
  const profile = input.profile ?? null;
  if (!profile) return [];

  const attrs = input.attrs ?? {};
  const q = input.questionnaire ?? {};
  const findings: ComplianceFinding[] = [];

  // --- 1. Zoning: maximum building height ----------------------------------
  const maxHeight = profile.zoning?.maximumHeight ?? null;
  const planHeight = num(attrs.building_height_m) ?? num(q.building_height);
  if (maxHeight != null && planHeight != null) {
    if (planHeight > maxHeight + TOL_HEIGHT_M) {
      findings.push(
        makeFinding({
          ncc_section: "Planning — Height of buildings",
          category: "structural",
          title: `${SITE}: building height exceeds the zone maximum`,
          description: `The design height (${planHeight} m) exceeds the authoritative maximum building height for this site (${maxHeight} m under ${profile.zoning?.name ?? "the applicable zone"}). The plan cannot be approved at this height without a variation.`,
          recommendation: `Reduce the overall building height to ${maxHeight} m or below, or obtain a planning variation for the excess before lodging.`,
          severity: "non_compliant",
          confidence: 0.95,
          ncc_citation: "LEP/DCP height of buildings (site-derived)",
          responsible_discipline: "building_surveyor",
        }),
      );
    } else {
      findings.push(
        makeFinding({
          ncc_section: "Planning — Height of buildings",
          category: "structural",
          title: `${SITE}: building height within the zone maximum`,
          description: `The design height (${planHeight} m) is within the authoritative maximum for this site (${maxHeight} m).`,
          recommendation: "No action — height complies with the site's zone limit.",
          severity: "compliant",
          confidence: 0.9,
          ncc_citation: "LEP/DCP height of buildings (site-derived)",
          responsible_discipline: "building_surveyor",
        }),
      );
    }
  } else if (maxHeight != null && planHeight == null) {
    findings.push(
      makeFinding({
        ncc_section: "Planning — Height of buildings",
        category: "structural",
        title: `${SITE}: confirm design height against the zone maximum (${maxHeight} m)`,
        description: `The site has an authoritative maximum building height of ${maxHeight} m, but a building height could not be read from the design to cross-check it.`,
        recommendation: `Confirm the overall building height and verify it does not exceed ${maxHeight} m.`,
        severity: "advisory",
        confidence: 0.8,
        ncc_citation: "LEP/DCP height of buildings (site-derived)",
        responsible_discipline: "building_surveyor",
      }),
    );
  }

  // --- 2. Zoning: maximum storeys ------------------------------------------
  const maxStoreys = profile.zoning?.maximumHeightStoreys ?? null;
  const planStoreys = num(attrs.storeys) ?? num(q.storeys);
  if (maxStoreys != null && planStoreys != null) {
    if (planStoreys > maxStoreys) {
      findings.push(
        makeFinding({
          ncc_section: "Planning — Number of storeys",
          category: "structural",
          title: `${SITE}: storey count exceeds the zone maximum`,
          description: `The design has ${planStoreys} storeys; the authoritative maximum for this site is ${maxStoreys}.`,
          recommendation: `Reduce the number of storeys to ${maxStoreys} or obtain a planning variation.`,
          severity: "non_compliant",
          confidence: 0.95,
          ncc_citation: "LEP/DCP number of storeys (site-derived)",
          responsible_discipline: "building_surveyor",
        }),
      );
    } else {
      findings.push(
        makeFinding({
          ncc_section: "Planning — Number of storeys",
          category: "structural",
          title: `${SITE}: storey count within the zone maximum`,
          description: `The design has ${planStoreys} storeys, within the authoritative maximum of ${maxStoreys}.`,
          recommendation: "No action — storey count complies with the site's zone limit.",
          severity: "compliant",
          confidence: 0.9,
          ncc_citation: "LEP/DCP number of storeys (site-derived)",
          responsible_discipline: "building_surveyor",
        }),
      );
    }
  }

  // --- 3. Zoning: setbacks --------------------------------------------------
  const setbacks = profile.zoning?.setbacks ?? null;
  const requiredSetbacks = setbacks
    ? [setbacks.front, setbacks.side, setbacks.rear].filter(
        (n): n is number => typeof n === "number" && n > 0,
      )
    : [];
  const minRequiredSetback = requiredSetbacks.length
    ? Math.min(...requiredSetbacks)
    : null;
  const planMinSetback =
    num(attrs.distance_to_boundary_m) ?? num(q.distance_to_boundary);
  if (minRequiredSetback != null) {
    const parts = [
      setbacks?.front != null ? `front ${setbacks.front} m` : null,
      setbacks?.side != null ? `side ${setbacks.side} m` : null,
      setbacks?.rear != null ? `rear ${setbacks.rear} m` : null,
    ].filter(Boolean);
    const setbackList = parts.length ? parts.join(", ") : `min ${minRequiredSetback} m`;
    if (planMinSetback != null && planMinSetback < minRequiredSetback - TOL_SETBACK_M) {
      // A boundary distance below the SMALLEST required setback proves at least
      // one boundary is under its own requirement (that boundary's requirement
      // is ≥ the smallest required > the measured distance).
      findings.push(
        makeFinding({
          ncc_section: "Planning — Setbacks",
          category: "structural",
          title: `${SITE}: a boundary setback is below the required minimum`,
          description: `The smallest boundary setback read from the design (${planMinSetback} m) is less than the smallest required setback for this site (${minRequiredSetback} m; required ${setbackList}).`,
          recommendation: `Increase the encroaching boundary setback to meet the required minimum (${setbackList}), or obtain a variation.`,
          severity: "non_compliant",
          confidence: 0.9,
          ncc_citation: "LEP/DCP setbacks (site-derived)",
          responsible_discipline: "building_surveyor",
        }),
      );
    } else {
      // Cannot prove EVERY boundary complies from a single smallest distance —
      // surface the required setbacks to confirm per-boundary (never a false pass).
      findings.push(
        makeFinding({
          ncc_section: "Planning — Setbacks",
          category: "structural",
          title: `${SITE}: confirm each boundary meets the required setback`,
          description: `The site's authoritative required setbacks are ${setbackList}. Confirm the design meets each on the corresponding boundary.`,
          recommendation: `Verify front/side/rear setbacks against the required ${setbackList}.`,
          severity: "advisory",
          confidence: 0.8,
          ncc_citation: "LEP/DCP setbacks (site-derived)",
          responsible_discipline: "building_surveyor",
        }),
      );
    }
  }

  // --- 4. Bushfire Attack Level (environment) ------------------------------
  const siteBal = normaliseBal(profile.environment?.bal);
  const planBal = normaliseBal(q.bal_rating);
  if (siteBal && siteBal !== "LOW") {
    if (planBal == null) {
      findings.push(
        makeFinding({
          ncc_section: "NCC G5 / AS 3959 — Bushfire",
          category: "bushfire",
          title: `${SITE}: design must meet BAL-${siteBal} (AS 3959)`,
          description: `The site's authoritative Bushfire Attack Level is BAL-${siteBal}, but no bushfire rating was specified for the design. Construction must comply with AS 3959 for BAL-${siteBal}.`,
          recommendation: `Specify BAL-${siteBal} construction (AS 3959) — external walls, glazing, decks, subfloor and roof detailing to the required level.`,
          severity: "advisory",
          confidence: 0.85,
          ncc_citation: "AS 3959-2018 (site-derived BAL)",
          responsible_discipline: "fire_engineer",
        }),
      );
    } else if ((BAL_RANK[planBal] ?? -1) < (BAL_RANK[siteBal] ?? -1)) {
      findings.push(
        makeFinding({
          ncc_section: "NCC G5 / AS 3959 — Bushfire",
          category: "bushfire",
          title: `${SITE}: design BAL is below the site's authoritative BAL`,
          description: `The design specifies BAL-${planBal}, but the site's authoritative Bushfire Attack Level is BAL-${siteBal}. The construction standard is inadequate for the site's bushfire exposure.`,
          recommendation: `Upgrade bushfire construction to BAL-${siteBal} (AS 3959).`,
          severity: "non_compliant",
          confidence: 0.9,
          ncc_citation: "AS 3959-2018 (site-derived BAL)",
          responsible_discipline: "fire_engineer",
        }),
      );
    } else {
      findings.push(
        makeFinding({
          ncc_section: "NCC G5 / AS 3959 — Bushfire",
          category: "bushfire",
          title: `${SITE}: design BAL meets the site's authoritative BAL`,
          description: `The design's BAL-${planBal} meets or exceeds the site's authoritative BAL-${siteBal}.`,
          recommendation: "No action — bushfire construction level matches the site.",
          severity: "compliant",
          confidence: 0.85,
          ncc_citation: "AS 3959-2018 (site-derived BAL)",
          responsible_discipline: "fire_engineer",
        }),
      );
    }
  }

  // --- 5. Planning overlays -------------------------------------------------
  for (const overlay of profile.overlays ?? []) {
    const type = (overlay.type ?? "").toLowerCase();
    // Bushfire BAL is already reconciled from environment.bal above; here we add
    // the overlay's construction/reporting requirements (not a duplicate BAL).
    const isBushfire = type.includes("bush") || type.includes("fire");
    const discipline: ContributorDiscipline = isBushfire
      ? "fire_engineer"
      : type.includes("flood")
        ? "hydraulic_engineer"
        : type.includes("herit")
          ? "building_surveyor"
          : "building_surveyor";
    const category = isBushfire
      ? "bushfire"
      : type.includes("flood")
        ? "waterproofing"
        : "structural";
    const reqs = (overlay.requirements ?? []).filter(Boolean);
    const reqText = reqs.length
      ? ` Requirements: ${reqs.join("; ")}.`
      : "";
    findings.push(
      makeFinding({
        ncc_section: `Planning overlay — ${overlay.name || overlay.type}`,
        category,
        title: `${SITE}: ${overlay.name || overlay.type} overlay applies to this site`,
        description: `This site carries a ${overlay.name || overlay.type} planning overlay that the design must address.${reqText}${overlay.requiresReport ? " A specialist report is required for this overlay." : ""}`,
        recommendation: reqs.length
          ? `Confirm the design satisfies: ${reqs.join("; ")}.${overlay.requiresReport ? " Commission the required specialist report." : ""}`
          : `Confirm the design addresses the ${overlay.name || overlay.type} overlay.${overlay.requiresReport ? " Commission the required specialist report." : ""}`,
        severity: "advisory",
        confidence: 0.85,
        ncc_citation: "Planning overlay (site-derived)",
        responsible_discipline: discipline,
      }),
    );
  }

  // --- 6. Terrain constructability -----------------------------------------
  const slope = profile.terrain?.slopePercent ?? null;
  const buildability = profile.terrain?.buildability ?? null;
  if ((slope != null && slope > STEEP_SLOPE_PCT) || buildability) {
    const slopeText = slope != null ? `Site slope is approximately ${slope}%.` : "";
    const buildText = buildability ? ` Buildability: ${buildability}.` : "";
    findings.push(
      makeFinding({
        ncc_section: "NCC Part H1 — Site preparation & footings",
        category: "structural",
        title: `${SITE}: terrain affects foundation & earthworks`,
        description: `${slopeText}${buildText} Site slope and buildability drive footing selection, cut/fill and any retaining requirements.`.trim(),
        recommendation:
          "Confirm the footing system and earthworks suit the site slope/buildability (a geotechnical report may be required).",
        severity: "advisory",
        confidence: 0.75,
        ncc_citation: "NCC Vol 2 H1 / AS 2870 (site-derived terrain)",
        responsible_discipline: "geotechnical_engineer",
      }),
    );
  }

  // --- 7. Lot size vs minimum lot size -------------------------------------
  const lotSize = profile.lot?.lotSize ?? null;
  const minLot = profile.zoning?.minimumLotSize ?? null;
  if (lotSize != null && minLot != null && lotSize < minLot) {
    findings.push(
      makeFinding({
        ncc_section: "Planning — Minimum lot size",
        category: "structural",
        title: `${SITE}: lot is smaller than the zone minimum`,
        description: `The lot (${lotSize} m²) is smaller than the authoritative minimum lot size for this zone (${minLot} m²). This constrains subdivision and some dual-occupancy / secondary-dwelling entitlements.`,
        recommendation:
          "Confirm the proposal's entitlement on an undersized lot with the consent authority before relying on it.",
        severity: "advisory",
        confidence: 0.8,
        ncc_citation: "LEP minimum lot size (site-derived)",
        responsible_discipline: "building_surveyor",
      }),
    );
  }

  return findings;
}

/**
 * A compact, human-legible block of the authoritative site data, appended to the
 * Comply AI prompt so every NCC category also reasons against ground truth (not
 * just what the plan claims). Returns "" when there is no profile. Pure.
 */
export function buildAuthoritativeContext(
  profile: PropertyProfile | null | undefined,
): string {
  if (!profile) return "";
  const lines: string[] = [];

  const z = profile.zoning;
  if (z) {
    if (z.name || z.code) lines.push(`- Zoning: ${z.name ?? z.code}${z.code && z.name ? ` (${z.code})` : ""}`);
    if (z.maximumHeight != null)
      lines.push(
        `- Maximum building height: ${z.maximumHeight} m${z.maximumHeightStoreys != null ? ` (${z.maximumHeightStoreys} storeys)` : ""}`,
      );
    else if (z.maximumHeightStoreys != null)
      lines.push(`- Maximum storeys: ${z.maximumHeightStoreys}`);
    if (z.setbacks) {
      const parts = [
        z.setbacks.front != null ? `front ${z.setbacks.front} m` : null,
        z.setbacks.side != null ? `side ${z.setbacks.side} m` : null,
        z.setbacks.rear != null ? `rear ${z.setbacks.rear} m` : null,
      ].filter(Boolean);
      if (parts.length) lines.push(`- Required setbacks: ${parts.join(", ")}`);
    }
    if (z.minimumLotSize != null) lines.push(`- Minimum lot size: ${z.minimumLotSize} m²`);
  }
  if (profile.lot?.lotSize != null) lines.push(`- Lot size: ${profile.lot.lotSize} m²`);

  const e = profile.environment;
  if (e) {
    if (e.bal) lines.push(`- Site Bushfire Attack Level (BAL): ${e.bal}`);
    if (e.windRegion) lines.push(`- Wind region: ${e.windRegion}`);
    if (e.climateZoneNumber != null) lines.push(`- Climate zone: ${e.climateZoneNumber}`);
  }

  const overlays = (profile.overlays ?? []).filter(Boolean);
  if (overlays.length) {
    lines.push(
      `- Planning overlays: ${overlays
        .map((o) => o.name || o.type)
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  const t = profile.terrain;
  if (t && (t.slopePercent != null || t.buildability)) {
    const bits = [
      t.slopePercent != null ? `slope ${t.slopePercent}%` : null,
      t.buildability ? `buildability ${t.buildability}` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`- Terrain: ${bits.join(", ")}`);
  }

  if (lines.length === 0) return "";
  return (
    "\n\nAUTHORITATIVE SITE DATA (from the property register — treat as GROUND TRUTH and cross-check the plan against it; where the plan or questionnaire conflicts with the values below, the register is authoritative):\n" +
    lines.join("\n")
  );
}
