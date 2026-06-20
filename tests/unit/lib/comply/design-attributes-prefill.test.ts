import { describe, it, expect } from "vitest";
import {
  buildDesignPrefillFromAttributes,
  type DesignAttributes,
} from "@/lib/comply/questionnaire-prefill";

describe("buildDesignPrefillFromAttributes", () => {
  it("maps a full attribute object to the questionnaire keys", () => {
    const attrs: DesignAttributes = {
      storeys: 2,
      floor_area_m2: 184.6,
      rooms: [
        { name: "Living", type: "living" },
        { name: "Master Bedroom", type: "bedroom" },
        { name: "Ensuite", type: "ensuite" },
        { name: "Bathroom", type: "bathroom" },
        { name: "Laundry", type: "laundry" },
        { name: "Balcony", type: "balcony" },
        { name: "Stair", type: "stair" },
      ],
      has_party_wall: true,
      roof_material: "Colorbond metal",
      wall_cladding: "brick veneer",
      ceiling_height_habitable_m: 2.7,
    };

    const out = buildDesignPrefillFromAttributes(attrs);

    expect(out).toEqual({
      storeys: "2",
      floor_area: "185", // rounded from 184.6
      wet_area_count: "3", // ensuite + bathroom + laundry
      attached_dwelling: "true",
      roof_material: "Metal (Colorbond)",
      wall_cladding: "Brick veneer",
      has_stairs: "true", // storeys > 1 (and a stair room)
      has_balcony_deck: "true",
      ceiling_height_habitable: "2.7",
    });
  });

  it("returns {} for null or undefined input", () => {
    expect(buildDesignPrefillFromAttributes(null)).toEqual({});
    expect(buildDesignPrefillFromAttributes(undefined)).toEqual({});
  });

  it("returns {} for an empty attribute object", () => {
    expect(buildDesignPrefillFromAttributes({})).toEqual({});
  });

  it("omits material keys it cannot confidently normalise", () => {
    const out = buildDesignPrefillFromAttributes({
      roof_material: "thatched reed",
      wall_cladding: "unobtanium panels",
    });
    expect(out.roof_material).toBeUndefined();
    expect(out.wall_cladding).toBeUndefined();
    expect(out).toEqual({});
  });

  it("sets attached_dwelling only when has_party_wall is true", () => {
    expect(
      buildDesignPrefillFromAttributes({ has_party_wall: true }),
    ).toEqual({ attached_dwelling: "true" });
    expect(
      buildDesignPrefillFromAttributes({ has_party_wall: false }),
    ).toEqual({});
    expect(buildDesignPrefillFromAttributes({})).toEqual({});
  });

  it("derives has_stairs from storeys > 1 even with no stair-named room", () => {
    const out = buildDesignPrefillFromAttributes({
      storeys: 2,
      rooms: [{ name: "Bedroom", type: "bedroom" }],
    });
    expect(out.storeys).toBe("2");
    expect(out.has_stairs).toBe("true");
  });

  it("derives has_stairs from a stair-named room on a single storey", () => {
    const out = buildDesignPrefillFromAttributes({
      storeys: 1,
      rooms: [{ name: "Stairwell", type: "other" }],
    });
    expect(out.has_stairs).toBe("true");
  });

  it("does not set has_stairs for a single-storey plan with no stair room", () => {
    const out = buildDesignPrefillFromAttributes({
      storeys: 1,
      rooms: [{ name: "Kitchen", type: "kitchen" }],
    });
    expect(out.has_stairs).toBeUndefined();
  });

  it("counts wet areas by room name/type and omits when zero", () => {
    expect(
      buildDesignPrefillFromAttributes({
        rooms: [
          { name: "Powder Room", type: "powder" },
          { name: "WC", type: "wc" },
          { name: "Living", type: "living" },
        ],
      }),
    ).toEqual({ wet_area_count: "2" });

    expect(
      buildDesignPrefillFromAttributes({
        rooms: [{ name: "Living", type: "living" }],
      }),
    ).toEqual({});
  });

  it("omits floor_area when not positive and ceiling height when out of range", () => {
    expect(
      buildDesignPrefillFromAttributes({
        floor_area_m2: 0,
        ceiling_height_habitable_m: 1.9, // below the 2.1 floor
      }),
    ).toEqual({});

    expect(
      buildDesignPrefillFromAttributes({
        ceiling_height_habitable_m: 5, // above the 4 ceiling
      }),
    ).toEqual({});
  });

  it("derives has_swimming_pool from a pool-named room", () => {
    expect(
      buildDesignPrefillFromAttributes({
        rooms: [{ name: "Swimming Pool", type: "pool" }],
      }),
    ).toEqual({ has_swimming_pool: "true" });
  });
});
