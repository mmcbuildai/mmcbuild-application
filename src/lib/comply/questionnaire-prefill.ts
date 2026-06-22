/**
 * Builds a Comply questionnaire prefill map from a design's extracted
 * SpatialLayout. Mirrors the address-driven site-intel prefill pattern
 * (climate_zone / bal_rating / wind) already used by the questionnaire form:
 * each derived value is offered as an editable default and badged in the UI as
 * "Extracted from your design".
 *
 * The function is intentionally CONSERVATIVE — it returns ONLY fields it can
 * confidently derive. A key is omitted entirely when the layout does not carry
 * enough signal to justify it (never guess). This keeps the "Extracted" badge
 * honest and avoids pre-filling a field with a wrong value the user might trust.
 */

import type { SpatialLayout, Room } from "@/lib/build/spatial/types";

// Canonical questionnaire option lists (must match questionnaire-form.tsx).
const ROOF_MATERIALS = [
  "Concrete tile",
  "Terracotta tile",
  "Metal (Colorbond)",
  "Metal (Zincalume)",
  "Slate",
  "Asphalt shingle",
] as const;

const WALL_CLADDINGS = [
  "Brick veneer",
  "Double brick",
  "Fibre cement",
  "Timber weatherboard",
  "Metal cladding",
  "Rendered foam",
  "Autoclaved aerated concrete",
] as const;

type RoofMaterial = (typeof ROOF_MATERIALS)[number];
type WallCladding = (typeof WALL_CLADDINGS)[number];

export const WET_AREA_RE = /bath|ensuite|laundry|\bwc\b|powder|toilet/i;
export const STAIR_RE = /stair/i;
export const BALCONY_DECK_RE = /balcony|deck/i;
export const POOL_RE = /\bpool\b/i;

/** A room's best descriptive string for keyword matching. */
function roomLabel(room: Room): string {
  return `${room.type ?? ""} ${room.name ?? ""}`;
}

function anyRoomMatches(rooms: Room[], re: RegExp): boolean {
  return rooms.some((r) => re.test(roomLabel(r)));
}

/** Normalise an extracted roof material string to a questionnaire option. */
export function normaliseRoofMaterial(
  raw: string | undefined,
): RoofMaterial | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v.includes("colorbond")) return "Metal (Colorbond)";
  if (v.includes("zincalume")) return "Metal (Zincalume)";
  if (v.includes("terracotta")) return "Terracotta tile";
  if (v.includes("slate")) return "Slate";
  if (v.includes("shingle")) return "Asphalt shingle";
  if (v.includes("tile") || v.includes("concrete")) return "Concrete tile";
  return null;
}

/** Normalise an extracted wall cladding string to a questionnaire option. */
export function normaliseWallCladding(
  raw: string | undefined,
): WallCladding | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v.includes("brick_veneer") || v.includes("brick veneer")) return "Brick veneer";
  if (v.includes("brick")) return "Brick veneer";
  if (v.includes("weatherboard") || v.includes("timber")) return "Timber weatherboard";
  if (v.includes("fibre") || v.includes("fiber") || v.includes("fc")) return "Fibre cement";
  if (v.includes("render")) return "Rendered foam";
  if (v.includes("hebel") || v.includes("aac")) return "Autoclaved aerated concrete";
  if (v.includes("metal")) return "Metal cladding";
  return null;
}

export function buildDesignPrefill(
  layout: SpatialLayout | null | undefined,
): Record<string, string> {
  if (!layout) return {};

  const out: Record<string, string> = {};
  const rooms = Array.isArray(layout.rooms) ? layout.rooms : [];
  const walls = Array.isArray(layout.walls) ? layout.walls : [];

  // Storeys
  if (typeof layout.storeys === "number" && layout.storeys >= 1) {
    out.storeys = String(layout.storeys);
  }

  // Total floor area (sum of room areas, rounded)
  const floorArea = rooms.reduce(
    (sum, r) => sum + (typeof r.area_m2 === "number" ? r.area_m2 : 0),
    0,
  );
  if (floorArea > 0) {
    out.floor_area = String(Math.round(floorArea));
  }

  // Wet area count
  const wetCount = rooms.filter((r) => WET_AREA_RE.test(roomLabel(r))).length;
  if (wetCount > 0) {
    out.wet_area_count = String(wetCount);
  }

  // Attached dwelling (party wall present)
  if (walls.some((w) => w.type === "party")) {
    out.attached_dwelling = "true";
  }

  // Roof material
  const roof = normaliseRoofMaterial(
    layout.roof?.material ?? layout.materials?.roof_material,
  );
  if (roof) {
    out.roof_material = roof;
  }

  // Wall cladding (materials.wall_default, else first defined wall cladding)
  const firstWallCladding = walls.find((w) => w.cladding)?.cladding;
  const cladding = normaliseWallCladding(
    layout.materials?.wall_default ?? firstWallCladding,
  );
  if (cladding) {
    out.wall_cladding = cladding;
  }

  // Stairs (multi-storey or a stair-named room)
  if (
    (typeof layout.storeys === "number" && layout.storeys > 1) ||
    anyRoomMatches(rooms, STAIR_RE)
  ) {
    out.has_stairs = "true";
  }

  // Balcony / deck
  if (anyRoomMatches(rooms, BALCONY_DECK_RE)) {
    out.has_balcony_deck = "true";
  }

  // Swimming pool
  if (anyRoomMatches(rooms, POOL_RE)) {
    out.has_swimming_pool = "true";
  }

  // Habitable ceiling height (first storey's floor-to-ceiling, sanity-bounded)
  const fc = layout.storey_details?.[0]?.floor_to_ceiling_m;
  if (typeof fc === "number" && fc >= 2.1 && fc <= 4) {
    out.ceiling_height_habitable = String(fc);
  }

  return out;
}

/**
 * The compact, questionnaire-relevant attribute object produced by the
 * lightweight on-upload vision extraction (`extract-design-attributes` Inngest
 * function), stored on `plans.design_attributes`. This is NOT the full 3D
 * SpatialLayout — it carries only the handful of fields the Comply
 * questionnaire prefill needs, so the questionnaire can be pre-populated for
 * users who run Comply against their design BEFORE running the Build/3D module.
 */
export interface DesignAttributes {
  storeys?: number;
  floor_area_m2?: number;
  /**
   * AGGREGATES, not a raw room list. The on-upload extraction returns counts +
   * flags directly (not a per-room array): a full rooms[] array on a multi-page
   * architectural set overran the model output cap → `output_too_large` (every
   * real plan failed, 2026-06-22). Aggregates bound the output to a fixed handful
   * of fields, so the extraction can never blow the cap.
   */
  wet_area_count?: number;
  has_stairs?: boolean;
  has_balcony_deck?: boolean;
  has_swimming_pool?: boolean;
  has_party_wall?: boolean;
  roof_material?: string;
  wall_cladding?: string;
  ceiling_height_habitable_m?: number;
}

/**
 * Maps the lightweight `DesignAttributes` (extracted on upload) to the SAME
 * questionnaire keys `buildDesignPrefill` produces, reusing the shared
 * normalisers and wet/stair/balcony/pool regexes so the mapping logic is not
 * duplicated. The questionnaire prefill reads this as a FALLBACK when there is
 * no full 3D spatial layout for the project.
 *
 * Conservative like `buildDesignPrefill`: a key is omitted entirely whenever
 * the attribute isn't confidently derivable, so the "Extracted from your
 * design" badge stays honest. Pure — no I/O, no side effects.
 */
export function buildDesignPrefillFromAttributes(
  attrs: DesignAttributes | null | undefined,
): Record<string, string> {
  if (!attrs) return {};

  const out: Record<string, string> = {};

  // Storeys
  if (typeof attrs.storeys === "number" && attrs.storeys >= 1) {
    out.storeys = String(attrs.storeys);
  }

  // Total floor area (rounded; positive only)
  if (typeof attrs.floor_area_m2 === "number" && attrs.floor_area_m2 > 0) {
    out.floor_area = String(Math.round(attrs.floor_area_m2));
  }

  // Wet area count (aggregate from the extraction; positive only)
  if (typeof attrs.wet_area_count === "number" && attrs.wet_area_count > 0) {
    out.wet_area_count = String(attrs.wet_area_count);
  }

  // Attached dwelling (party wall present)
  if (attrs.has_party_wall === true) {
    out.attached_dwelling = "true";
  }

  // Roof material
  const roof = normaliseRoofMaterial(attrs.roof_material);
  if (roof) {
    out.roof_material = roof;
  }

  // Wall cladding
  const cladding = normaliseWallCladding(attrs.wall_cladding);
  if (cladding) {
    out.wall_cladding = cladding;
  }

  // Stairs (the extracted flag, or implied by more than one storey)
  if (
    attrs.has_stairs === true ||
    (typeof attrs.storeys === "number" && attrs.storeys > 1)
  ) {
    out.has_stairs = "true";
  }

  // Balcony / deck
  if (attrs.has_balcony_deck === true) {
    out.has_balcony_deck = "true";
  }

  // Swimming pool
  if (attrs.has_swimming_pool === true) {
    out.has_swimming_pool = "true";
  }

  // Habitable ceiling height (sanity-bounded, same window as buildDesignPrefill)
  const ch = attrs.ceiling_height_habitable_m;
  if (typeof ch === "number" && ch >= 2.1 && ch <= 4) {
    out.ceiling_height_habitable = String(ch);
  }

  return out;
}
