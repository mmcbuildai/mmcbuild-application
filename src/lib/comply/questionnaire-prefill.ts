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

const WET_AREA_RE = /bath|ensuite|laundry|\bwc\b|powder|toilet/i;
const STAIR_RE = /stair/i;
const BALCONY_DECK_RE = /balcony|deck/i;
const POOL_RE = /\bpool\b/i;

/** A room's best descriptive string for keyword matching. */
function roomLabel(room: Room): string {
  return `${room.type ?? ""} ${room.name ?? ""}`;
}

function anyRoomMatches(rooms: Room[], re: RegExp): boolean {
  return rooms.some((r) => re.test(roomLabel(r)));
}

/** Normalise an extracted roof material string to a questionnaire option. */
function normaliseRoofMaterial(raw: string | undefined): RoofMaterial | null {
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
function normaliseWallCladding(raw: string | undefined): WallCladding | null {
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
