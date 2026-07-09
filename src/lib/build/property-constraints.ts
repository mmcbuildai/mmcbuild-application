/**
 * Authoritative site design constraints for MMC Build (Design Optimisation).
 *
 * The design optimiser proposes MMC alternatives (panelised walls, modular pods,
 * SIPs, mass timber, etc.) but historically read NOTHING of the authoritative
 * property profile — so it could suggest an alternative that breaches the site's
 * height/setback envelope or ignores a bushfire/flood overlay it must satisfy.
 *
 * This module turns the authoritative `PropertyProfile` into a compact
 * constraints block appended to the optimisation prompt, so the optimiser
 * designs WITHIN the site's ground-truth planning/site limits. Engine-first-with-
 * fallback: every field is optional and an absent profile yields "" (the
 * optimiser then runs exactly as before). Pure — no I/O — so it is unit-testable.
 */

import type { PropertyProfile } from "@caistech/property-services-sdk";

/**
 * Build the authoritative-constraints prompt block for the design optimiser.
 * Returns "" when there is no usable profile.
 */
export function buildDesignConstraints(
  profile: PropertyProfile | null | undefined,
): string {
  if (!profile) return "";
  const lines: string[] = [];

  const z = profile.zoning;
  if (z?.maximumHeight != null) {
    lines.push(
      `- Maximum building height ${z.maximumHeight} m${z.maximumHeightStoreys != null ? ` (${z.maximumHeightStoreys} storeys)` : ""} — do NOT propose an alternative that raises the overall height beyond this envelope.`,
    );
  } else if (z?.maximumHeightStoreys != null) {
    lines.push(
      `- Maximum ${z.maximumHeightStoreys} storeys — do NOT propose an alternative that adds storeys beyond this.`,
    );
  }
  if (z?.setbacks) {
    const parts = [
      z.setbacks.front != null ? `front ${z.setbacks.front} m` : null,
      z.setbacks.side != null ? `side ${z.setbacks.side} m` : null,
      z.setbacks.rear != null ? `rear ${z.setbacks.rear} m` : null,
    ].filter(Boolean);
    if (parts.length) {
      lines.push(
        `- Required boundary setbacks (${parts.join(", ")}) — any panelised/modular footprint change must stay within these boundaries.`,
      );
    }
  }
  if (z?.modularProvisions) {
    lines.push(
      `- Local modular/prefab provisions: ${z.modularProvisions} — factor these into MMC-system suitability.`,
    );
  }

  const bal = profile.environment?.bal;
  if (bal && !/low/i.test(bal) && !/^n\/?a$/i.test(bal)) {
    lines.push(
      `- Bushfire Attack Level ${bal} — any external wall, cladding, glazing, decking or subfloor alternative MUST comply with AS 3959 for ${bal} (favour non-combustible / bushfire-rated systems; do not propose combustible cladding).`,
    );
  }

  for (const overlay of profile.overlays ?? []) {
    const type = (overlay.type ?? "").toLowerCase();
    if (type.includes("flood")) {
      lines.push(
        `- Flood overlay — favour suspended/elevated floor systems and flood-compatible materials; confirm the minimum habitable floor level before recommending a slab-on-ground alternative.`,
      );
    } else if (type.includes("herit")) {
      lines.push(
        `- Heritage overlay — external appearance is constrained; keep visible cladding/roofing/form sympathetic and avoid alternatives that change the street-facing character.`,
      );
    }
  }

  const t = profile.terrain;
  if (t && (t.slopePercent != null || t.buildability)) {
    const bits = [
      t.slopePercent != null ? `slope ~${t.slopePercent}%` : null,
      t.buildability ? `buildability ${t.buildability}` : null,
    ].filter(Boolean);
    lines.push(
      `- Terrain (${bits.join(", ")}) — favour foundation systems tolerant of the site slope (e.g. screw piles, suspended/cassette floors) and note earthworks/retaining implications.`,
    );
  }

  if (lines.length === 0) return "";
  return (
    "\n\nAUTHORITATIVE SITE CONSTRAINTS (ground-truth planning/site limits for this parcel — design WITHIN them; never recommend an alternative that would breach the height/setback envelope or an overlay requirement):\n" +
    lines.join("\n")
  );
}
