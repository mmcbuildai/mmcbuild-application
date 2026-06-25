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

// --- Categorical questionnaire vocabularies (must match questionnaire-form.tsx) ---
// The on-upload extraction is instructed to return EXACTLY one of these option
// strings per field; we accept only an exact (case-insensitive) match plus a few
// explicit short-code aliases, and OMIT otherwise — never coerce an ambiguous
// value onto a compliance field. (Building class especially is hard-gated, so a
// wrong auto-fill is worse than none.)
const BUILDING_TYPOLOGIES = [
  "Single residential", "Duplex", "Townhouse", "Apartment",
  "Co-living / Boarding house", "Hotel", "Mixed use", "Commercial",
] as const;
const BUILDING_CLASSES = ["Class 1a", "Class 1b", "Class 2", "Class 3", "Class 10a", "Class 10b"] as const;
const CONSTRUCTION_TYPES = ["Type A", "Type B", "Type C"] as const;
const SOIL_CLASSIFICATIONS = ["A", "S", "M", "M-D", "H1", "H2", "E", "P"] as const;
const FOOTING_TYPES = ["Strip footing", "Pad footing", "Raft slab", "Waffle slab", "Stiffened raft", "Stumps/Piers", "Screw piles"] as const;
const WIND_CLASSIFICATIONS = ["N1", "N2", "N3", "N4", "N5", "N6", "C1", "C2", "C3", "C4"] as const;
const TERRAIN_CATEGORIES = ["TC1", "TC2", "TC2.5", "TC3"] as const;
const DPC_TYPES = ["Polyethylene membrane", "Bituminous membrane", "Chemical DPC", "Not specified"] as const;
const GARAGE_LOCATIONS = ["Attached", "Detached", "Integrated/under main roof", "Basement car park", "N/A"] as const;
const SMOKE_ALARM_TYPES = ["Photoelectric (hardwired interconnected)", "Photoelectric (battery)", "Ionisation", "Combined photo/ion"] as const;
const ENERGY_PATHWAYS = ["DTS (Deemed-to-Satisfy)", "NatHERS", "JV3 (Verification)"] as const;
const GLAZING_TYPES = ["Single clear", "Single tinted", "Double glazed (clear)", "Double glazed (low-e)", "Triple glazed"] as const;
const HOT_WATER_SYSTEMS = ["Electric storage", "Electric heat pump", "Gas storage", "Gas instantaneous", "Solar electric boost", "Solar gas boost"] as const;
const VENTILATION_METHODS = ["Openable windows", "Openable windows + ceiling fans", "Mechanical ventilation", "Mixed mode"] as const;
const HEATING_TYPES = ["Ducted gas", "Ducted reverse cycle", "Split system", "Hydronic", "Wood heater (open flue)", "Wood heater (closed flue)", "Electric panel"] as const;

/**
 * Accept ONLY an exact (case-insensitive) match against the canonical option
 * list, or an explicit alias — otherwise omit. Conservative on purpose: a
 * fuzzy "contains" match on short codes (A, M, H, Type A) is too easy to get
 * wrong on a compliance field.
 */
export function pickExactOption(
  raw: string | undefined,
  options: readonly string[],
  aliases: Record<string, string> = {},
): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (aliases[v]) return aliases[v];
  for (const o of options) if (o.toLowerCase() === v) return o;
  return null;
}

const BUILDING_CLASS_ALIASES: Record<string, string> = {
  "1a": "Class 1a", "1b": "Class 1b", "2": "Class 2",
  "3": "Class 3", "10a": "Class 10a", "10b": "Class 10b",
};
const CONSTRUCTION_TYPE_ALIASES: Record<string, string> = { a: "Type A", b: "Type B", c: "Type C" };

/** Bounded number → string, or null when absent / out of a sane physical range. */
function boundedNumber(
  raw: number | undefined | null,
  min: number,
  max: number,
  round = false,
): string | null {
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  if (raw < min || raw > max) return null;
  return String(round ? Math.round(raw) : raw);
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
  // --- Geometry / counts (AGGREGATES, never a raw room list) -----------------
  // A full rooms[] array on a multi-page architectural set overran the model
  // output cap → `output_too_large` (every real plan failed, 2026-06-22).
  // Everything here is a scalar/flag, so the extraction can never blow the cap —
  // which is why the expanded set below (title-block, schedule + note fields)
  // is also all scalars.
  storeys?: number;
  floor_area_m2?: number;
  wet_area_count?: number;
  has_stairs?: boolean;
  has_balcony_deck?: boolean;
  has_swimming_pool?: boolean;
  has_party_wall?: boolean;
  roof_material?: string;
  wall_cladding?: string;
  ceiling_height_habitable_m?: number;

  // --- Classification (title block) ------------------------------------------
  building_typology?: string;
  building_class?: string;
  construction_type?: string;

  // --- Structure & footings (H1) ---------------------------------------------
  soil_classification?: string;
  footing_type?: string;
  wind_classification?: string;
  terrain_category?: string;

  // --- Weatherproofing (H2) --------------------------------------------------
  dpc_type?: string;
  has_sarking?: boolean;
  has_subfloor_ventilation?: boolean;
  distance_to_boundary_m?: number;

  // --- Fire safety (H3) ------------------------------------------------------
  party_wall_frl?: string;
  garage_location?: string;
  smoke_alarm_type?: string;

  // --- Health & amenity (H4) -------------------------------------------------
  ceiling_height_non_habitable_m?: number;
  has_exhaust_fans?: boolean;
  natural_ventilation_method?: string;

  // --- Energy efficiency (H6) ------------------------------------------------
  energy_pathway?: string;
  insulation_ceiling_r?: number;
  insulation_wall_r?: number;
  insulation_floor_r?: number;
  glazing_type?: string;
  hot_water_system?: string;
  has_solar_pv?: boolean;
  nathers_rating?: number;

  // --- Heating appliance -----------------------------------------------------
  has_heating_appliance?: boolean;
  heating_type?: string;

  // --- Access & livable housing (H5/H8) --------------------------------------
  max_fall_height_m?: number;
  has_step_free_entry?: boolean;
  accessible_bathroom?: boolean;
  min_door_width_mm?: number;
  min_corridor_width_mm?: number;
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

  // --- Classification (title block) ---
  const typology = pickExactOption(attrs.building_typology, BUILDING_TYPOLOGIES);
  if (typology) out.building_typology = typology;
  const bclass = pickExactOption(attrs.building_class, BUILDING_CLASSES, BUILDING_CLASS_ALIASES);
  if (bclass) out.building_class = bclass;
  const ctype = pickExactOption(attrs.construction_type, CONSTRUCTION_TYPES, CONSTRUCTION_TYPE_ALIASES);
  if (ctype) out.construction_type = ctype;

  // --- Structure & footings (H1) ---
  const soil = pickExactOption(attrs.soil_classification, SOIL_CLASSIFICATIONS);
  if (soil) out.soil_classification = soil;
  const footing = pickExactOption(attrs.footing_type, FOOTING_TYPES);
  if (footing) out.footing_type = footing;
  const windClass = pickExactOption(attrs.wind_classification, WIND_CLASSIFICATIONS);
  if (windClass) out.wind_classification = windClass;
  const terrain = pickExactOption(attrs.terrain_category, TERRAIN_CATEGORIES);
  if (terrain) out.terrain_category = terrain;

  // --- Weatherproofing (H2) ---
  const dpc = pickExactOption(attrs.dpc_type, DPC_TYPES);
  if (dpc) out.dpc_type = dpc;
  if (attrs.has_sarking === true) out.sarking = "true";
  if (attrs.has_subfloor_ventilation === true) out.subfloor_ventilation = "true";
  const boundary = boundedNumber(attrs.distance_to_boundary_m, 0, 50);
  if (boundary !== null) out.distance_to_boundary = boundary;

  // --- Fire safety (H3) ---
  if (typeof attrs.party_wall_frl === "string" && /\d/.test(attrs.party_wall_frl)) {
    out.party_wall_frl = attrs.party_wall_frl.trim();
  }
  const garage = pickExactOption(attrs.garage_location, GARAGE_LOCATIONS);
  if (garage) out.garage_location = garage;
  const smoke = pickExactOption(attrs.smoke_alarm_type, SMOKE_ALARM_TYPES);
  if (smoke) out.smoke_alarm_type = smoke;

  // --- Health & amenity (H4) ---
  const chNon = boundedNumber(attrs.ceiling_height_non_habitable_m, 1.8, 4);
  if (chNon !== null) out.ceiling_height_non_habitable = chNon;
  if (attrs.has_exhaust_fans === true) out.exhaust_fans = "true";
  const vent = pickExactOption(attrs.natural_ventilation_method, VENTILATION_METHODS);
  if (vent) out.natural_ventilation_method = vent;

  // --- Energy efficiency (H6) ---
  const pathway = pickExactOption(attrs.energy_pathway, ENERGY_PATHWAYS);
  if (pathway) out.energy_pathway = pathway;
  const rC = boundedNumber(attrs.insulation_ceiling_r, 0, 10);
  if (rC !== null) out.insulation_ceiling_r = rC;
  const rW = boundedNumber(attrs.insulation_wall_r, 0, 10);
  if (rW !== null) out.insulation_wall_r = rW;
  const rF = boundedNumber(attrs.insulation_floor_r, 0, 10);
  if (rF !== null) out.insulation_floor_r = rF;
  const glazing = pickExactOption(attrs.glazing_type, GLAZING_TYPES);
  if (glazing) out.glazing_type = glazing;
  const hotWater = pickExactOption(attrs.hot_water_system, HOT_WATER_SYSTEMS);
  if (hotWater) out.hot_water_system = hotWater;
  if (attrs.has_solar_pv === true) out.has_solar_pv = "true";
  const nathers = boundedNumber(attrs.nathers_rating, 0, 10);
  if (nathers !== null) out.nathers_rating = nathers;

  // --- Heating appliance ---
  if (attrs.has_heating_appliance === true) out.has_heating_appliance = "true";
  const heating = pickExactOption(attrs.heating_type, HEATING_TYPES);
  if (heating) out.heating_type = heating;

  // --- Access & livable housing (H5/H8) ---
  const fall = boundedNumber(attrs.max_fall_height_m, 0, 50);
  if (fall !== null) out.max_fall_height = fall;
  if (attrs.has_step_free_entry === true) out.has_step_free_entry = "true";
  if (attrs.accessible_bathroom === true) out.accessible_bathroom = "true";
  const doorW = boundedNumber(attrs.min_door_width_mm, 600, 2000, true);
  if (doorW !== null) out.min_door_width = doorW;
  const corridorW = boundedNumber(attrs.min_corridor_width_mm, 600, 3000, true);
  if (corridorW !== null) out.min_corridor_width = corridorW;

  return out;
}

/**
 * Pure decision for the questionnaire hold-back gate: should we wait-and-poll
 * for an in-flight design extraction before rendering the form?
 *
 * `pending` is true ONLY when the prefill is currently empty AND an extraction
 * that would plausibly still yield attributes is in flight — a vision-capable
 * plan (pdf/image) whose `design_attributes` hasn't been written yet, with no
 * `design_checks.spatial_layout` landed either. In every other case it is false
 * so the gate renders the form immediately and never traps the user.
 *
 * Factored out of `getDesignPrefillState` so the gate logic is unit-testable
 * without a database.
 */
export function isPrefillPending(args: {
  prefill: Record<string, string>;
  hasPendingVisionPlan: boolean;
  hasSpatialLayout: boolean;
}): boolean {
  if (Object.keys(args.prefill).length > 0) return false;
  if (!args.hasPendingVisionPlan) return false;
  if (args.hasSpatialLayout) return false;
  return true;
}
