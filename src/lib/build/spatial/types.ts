/**
 * Spatial data types for 3D plan representation.
 * These types define the structured output from AI vision extraction.
 */

export interface Point2D {
  x: number; // metres from origin
  y: number; // metres from origin
}

export interface Wall {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number; // metres (e.g. 0.09 for 90mm stud)
  type: "external" | "internal" | "party";
  material?: string; // e.g. "timber_frame", "brick_veneer", "sip_panel"
  /** Optional per-wall height override (m). Falls back to SpatialLayout.wall_height. */
  height_m?: number;
  /** Optional exterior cladding override (e.g. "brick_veneer", "weatherboard", "render", "hebel"). */
  cladding?: string;
  /** Optional exterior colour hex (#RRGGBB) override. */
  exterior_colour?: string;
  /** Optional storey index (0 = ground). Defaults to 0 if not set. */
  storey?: number;
}

export interface Room {
  id: string;
  name: string;
  polygon: Point2D[]; // closed polygon defining room boundary
  area_m2: number;
  floor_level: number; // 0 = ground, 1 = first floor, etc.
  type?: string; // e.g. "living", "bedroom", "bathroom", "kitchen", "garage"
}

export interface Opening {
  id: string;
  type: "door" | "window" | "bifold" | "sliding_door" | "garage_door";
  position: Point2D; // centre point on wall
  width: number; // metres
  height: number; // metres
  wall_id?: string; // which wall this opening is in
  sill_height?: number; // metres from floor (windows)
}

export type RoofForm = "gable" | "hip" | "skillion" | "flat" | "mansard" | "complex";

export interface Roof {
  /** Overall roof form. "complex" means combined hip + gable etc. */
  form: RoofForm;
  /** Pitch in degrees. 0 for flat, typical 22-30 for hip/gable, 5-15 for skillion. */
  pitch_deg: number;
  /** Eave overhang from wall face in metres (typical 0.45-0.6m for Australian residential). */
  eave_overhang_m: number;
  /** Optional height of ridge above wall top in metres (computed from pitch + footprint if absent). */
  ridge_height_m?: number;
  /** Optional ridge / hip line coordinates for complex roofs. */
  ridge_lines?: Array<{ start: Point2D; end: Point2D }>;
  /** e.g. "colorbond", "tile", "metal_deck", "membrane" */
  material?: string;
  /** Hex colour #RRGGBB */
  colour?: string;
}

export interface Storey {
  id: string;
  /** Storey index — 0 = ground floor, 1 = first floor, etc. */
  level: number;
  /** Floor-to-ceiling height in metres. */
  floor_to_ceiling_m: number;
  /** Height of THIS storey's slab/floor above the storey below (metres). Defaults to 0 for ground. */
  floor_height_m?: number;
  /** Ceiling profile. */
  ceiling_type?: "flat" | "raked" | "vaulted";
}

export interface Materials {
  /** Default exterior wall cladding when wall.cladding is absent. */
  wall_default?: string;
  /** Default exterior wall colour hex. */
  wall_colour?: string;
  roof_material?: string;
  roof_colour?: string;
  /** Window frame material — "timber", "aluminium", "upvc". */
  window_frame?: string;
  window_colour?: string;
}

export interface SpatialLayout {
  /** Extracted rooms with boundaries */
  rooms: Room[];
  /** Walls with start/end coordinates */
  walls: Wall[];
  /** Doors, windows, and other openings */
  openings: Opening[];
  /** Overall bounding box */
  bounds: {
    min: Point2D;
    max: Point2D;
    width: number; // metres
    depth: number; // metres
  };
  /** Number of storeys detected */
  storeys: number;
  /** Default wall height in metres */
  wall_height: number;
  /** Extraction confidence (0-1) */
  confidence: number;
  /** Any notes from the AI about extraction quality */
  notes?: string;
  /** Optional roof geometry extracted from elevations / roof plan. */
  roof?: Roof;
  /** Optional per-storey detail (heights, ceiling types). When absent, all walls assumed storey 0. */
  storey_details?: Storey[];
  /** Optional material defaults from schedule of finishes. */
  materials?: Materials;
}

export interface SuggestionOverlay {
  id: string;
  /** Which walls/rooms are affected */
  affected_wall_ids: string[];
  affected_room_ids: string[];
  /** Display properties */
  colour: string; // hex colour for the overlay
  /** Overlay opacity 0–1 (SCRUM-169: varies by the user's decision). */
  opacity?: number;
  label: string;
  description: string;
  /** From the existing suggestion data */
  technology_category: string;
  estimated_cost_savings: number | null;
  estimated_time_savings: number | null;
}
