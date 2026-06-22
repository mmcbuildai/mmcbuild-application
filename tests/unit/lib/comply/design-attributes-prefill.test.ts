import { describe, it, expect } from "vitest";
import {
  buildDesignPrefillFromAttributes,
  type DesignAttributes,
} from "@/lib/comply/questionnaire-prefill";

describe("buildDesignPrefillFromAttributes", () => {
  it("maps a full aggregate attribute object to the questionnaire keys", () => {
    const attrs: DesignAttributes = {
      storeys: 2,
      floor_area_m2: 184.6,
      wet_area_count: 3,
      has_stairs: true,
      has_balcony_deck: true,
      has_swimming_pool: false,
      has_party_wall: true,
      roof_material: "Colorbond metal",
      wall_cladding: "brick veneer",
      ceiling_height_habitable_m: 2.7,
    };

    const out = buildDesignPrefillFromAttributes(attrs);

    expect(out).toEqual({
      storeys: "2",
      floor_area: "185", // rounded from 184.6
      wet_area_count: "3",
      attached_dwelling: "true",
      roof_material: "Metal (Colorbond)",
      wall_cladding: "Brick veneer",
      has_stairs: "true",
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
    expect(buildDesignPrefillFromAttributes({ has_party_wall: true })).toEqual({
      attached_dwelling: "true",
    });
    expect(buildDesignPrefillFromAttributes({ has_party_wall: false })).toEqual({});
    expect(buildDesignPrefillFromAttributes({})).toEqual({});
  });

  it("derives has_stairs from storeys > 1 even without the flag", () => {
    const out = buildDesignPrefillFromAttributes({ storeys: 2 });
    expect(out.storeys).toBe("2");
    expect(out.has_stairs).toBe("true");
  });

  it("derives has_stairs from the flag on a single storey", () => {
    const out = buildDesignPrefillFromAttributes({ storeys: 1, has_stairs: true });
    expect(out.has_stairs).toBe("true");
  });

  it("does not set has_stairs for a single-storey plan with no stair flag", () => {
    const out = buildDesignPrefillFromAttributes({ storeys: 1, has_stairs: false });
    expect(out.has_stairs).toBeUndefined();
  });

  it("uses wet_area_count directly and omits when zero/absent", () => {
    expect(buildDesignPrefillFromAttributes({ wet_area_count: 2 })).toEqual({
      wet_area_count: "2",
    });
    expect(buildDesignPrefillFromAttributes({ wet_area_count: 0 })).toEqual({});
    expect(buildDesignPrefillFromAttributes({})).toEqual({});
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

  it("derives has_swimming_pool / has_balcony_deck from their flags", () => {
    expect(
      buildDesignPrefillFromAttributes({ has_swimming_pool: true }),
    ).toEqual({ has_swimming_pool: "true" });
    expect(
      buildDesignPrefillFromAttributes({ has_balcony_deck: true }),
    ).toEqual({ has_balcony_deck: "true" });
    expect(
      buildDesignPrefillFromAttributes({ has_swimming_pool: false, has_balcony_deck: false }),
    ).toEqual({});
  });
});
