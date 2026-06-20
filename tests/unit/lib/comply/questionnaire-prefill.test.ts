import { describe, it, expect } from "vitest";
import { buildDesignPrefill } from "@/lib/comply/questionnaire-prefill";
import type { SpatialLayout } from "@/lib/build/spatial/types";

/** Minimal SpatialLayout factory — only the fields the prefill reads matter. */
function makeLayout(overrides: Partial<SpatialLayout> = {}): SpatialLayout {
  return {
    rooms: [],
    walls: [],
    openings: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 }, width: 0, depth: 0 },
    storeys: 1,
    wall_height: 2.4,
    confidence: 0.9,
    ...overrides,
  };
}

describe("buildDesignPrefill", () => {
  it("maps a full layout correctly", () => {
    const layout = makeLayout({
      storeys: 2,
      rooms: [
        { id: "r1", name: "Living", polygon: [], area_m2: 30.4, floor_level: 0, type: "living" },
        { id: "r2", name: "Master Bedroom", polygon: [], area_m2: 15.2, floor_level: 1, type: "bedroom" },
        { id: "r3", name: "Ensuite", polygon: [], area_m2: 6.1, floor_level: 1, type: "bathroom" },
        { id: "r4", name: "Laundry", polygon: [], area_m2: 4.3, floor_level: 0, type: "service" },
        { id: "r5", name: "Rear Deck", polygon: [], area_m2: 12.0, floor_level: 0, type: "outdoor" },
        { id: "r6", name: "Swimming Pool", polygon: [], area_m2: 24.0, floor_level: 0, type: "outdoor" },
      ],
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.09, type: "external", cladding: "weatherboard" },
      ],
      roof: { form: "hip", pitch_deg: 25, eave_overhang_m: 0.5, material: "Colorbond steel" },
      materials: { wall_default: "brick_veneer" },
      storey_details: [
        { id: "s0", level: 0, floor_to_ceiling_m: 2.7 },
        { id: "s1", level: 1, floor_to_ceiling_m: 2.4 },
      ],
    });

    const result = buildDesignPrefill(layout);

    expect(result.storeys).toBe("2");
    // 30.4 + 15.2 + 6.1 + 4.3 + 12.0 + 24.0 = 92.0 → 92
    expect(result.floor_area).toBe("92");
    // Ensuite + Laundry = 2
    expect(result.wet_area_count).toBe("2");
    expect(result.roof_material).toBe("Metal (Colorbond)");
    // materials.wall_default wins over the wall's "weatherboard"
    expect(result.wall_cladding).toBe("Brick veneer");
    // storeys > 1
    expect(result.has_stairs).toBe("true");
    expect(result.has_balcony_deck).toBe("true");
    expect(result.has_swimming_pool).toBe("true");
    expect(result.ceiling_height_habitable).toBe("2.7");
    // no party wall
    expect(result.attached_dwelling).toBeUndefined();
  });

  it("returns {} for a null or empty layout", () => {
    expect(buildDesignPrefill(null)).toEqual({});
    expect(buildDesignPrefill(undefined)).toEqual({});

    const empty = makeLayout({ storeys: 0, rooms: [], walls: [] });
    const result = buildDesignPrefill(empty);
    // storeys 0 omitted, no rooms/walls → nothing confident
    expect(result.storeys).toBeUndefined();
    expect(result.floor_area).toBeUndefined();
    expect(result.wet_area_count).toBeUndefined();
    expect(result.has_stairs).toBeUndefined();
  });

  it("omits material keys when the extracted string does not match an option", () => {
    const layout = makeLayout({
      roof: { form: "gable", pitch_deg: 22, eave_overhang_m: 0.5, material: "unobtainium" },
      materials: { wall_default: "mystery-panel" },
    });

    const result = buildDesignPrefill(layout);
    expect(result.roof_material).toBeUndefined();
    expect(result.wall_cladding).toBeUndefined();
  });

  it("sets attached_dwelling true when a party wall is present", () => {
    const layout = makeLayout({
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.09, type: "external" },
        { id: "w2", start: { x: 5, y: 0 }, end: { x: 5, y: 5 }, thickness: 0.2, type: "party" },
      ],
    });

    const result = buildDesignPrefill(layout);
    expect(result.attached_dwelling).toBe("true");
  });
});
