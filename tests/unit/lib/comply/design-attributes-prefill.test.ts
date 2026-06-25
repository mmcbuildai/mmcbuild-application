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

describe("buildDesignPrefillFromAttributes — expanded questionnaire fields", () => {
  it("maps building class from the printed title-block value (short code + verbatim)", () => {
    expect(buildDesignPrefillFromAttributes({ building_class: "1a" }).building_class).toBe(
      "Class 1a",
    );
    expect(buildDesignPrefillFromAttributes({ building_class: "Class 1a" }).building_class).toBe(
      "Class 1a",
    );
    expect(buildDesignPrefillFromAttributes({ building_class: "class 10b" }).building_class).toBe(
      "Class 10b",
    );
  });

  it("omits an unrecognised building class rather than guessing", () => {
    expect(
      buildDesignPrefillFromAttributes({ building_class: "Class 99" }).building_class,
    ).toBeUndefined();
  });

  it("maps construction type by code and verbatim", () => {
    expect(buildDesignPrefillFromAttributes({ construction_type: "A" }).construction_type).toBe(
      "Type A",
    );
    expect(
      buildDesignPrefillFromAttributes({ construction_type: "Type C" }).construction_type,
    ).toBe("Type C");
  });

  it("maps structure & footing categoricals exactly (and the M-D soil edge case)", () => {
    const out = buildDesignPrefillFromAttributes({
      building_typology: "Townhouse",
      soil_classification: "M-D",
      footing_type: "Waffle slab",
      wind_classification: "N2",
      terrain_category: "TC2.5",
    });
    expect(out).toMatchObject({
      building_typology: "Townhouse",
      soil_classification: "M-D",
      footing_type: "Waffle slab",
      wind_classification: "N2",
      terrain_category: "TC2.5",
    });
  });

  it("omits a categorical that is not in the canonical list", () => {
    expect(
      buildDesignPrefillFromAttributes({ footing_type: "magic floating slab" }).footing_type,
    ).toBeUndefined();
    expect(
      buildDesignPrefillFromAttributes({ glazing_type: "quadruple glazed" }).glazing_type,
    ).toBeUndefined();
  });

  it("emits boolean spec flags only when true", () => {
    const trueOut = buildDesignPrefillFromAttributes({
      has_sarking: true,
      has_subfloor_ventilation: true,
      has_exhaust_fans: true,
      has_solar_pv: true,
      has_heating_appliance: true,
      has_step_free_entry: true,
      accessible_bathroom: true,
    });
    expect(trueOut).toMatchObject({
      sarking: "true",
      subfloor_ventilation: "true",
      exhaust_fans: "true",
      has_solar_pv: "true",
      has_heating_appliance: "true",
      has_step_free_entry: "true",
      accessible_bathroom: "true",
    });
    expect(
      buildDesignPrefillFromAttributes({ has_sarking: false, has_solar_pv: false }),
    ).toEqual({});
  });

  it("passes a fire-resistance level through when it carries digits", () => {
    expect(
      buildDesignPrefillFromAttributes({ party_wall_frl: "60/60/60" }).party_wall_frl,
    ).toBe("60/60/60");
    expect(
      buildDesignPrefillFromAttributes({ party_wall_frl: "not specified" }).party_wall_frl,
    ).toBeUndefined();
  });

  it("bounds numbers and rounds door/corridor widths to mm integers", () => {
    const out = buildDesignPrefillFromAttributes({
      distance_to_boundary_m: 0.9,
      insulation_ceiling_r: 4.1,
      nathers_rating: 7,
      min_door_width_mm: 820.4,
      min_corridor_width_mm: 1000,
      ceiling_height_non_habitable_m: 2.4,
    });
    expect(out).toMatchObject({
      distance_to_boundary: "0.9",
      insulation_ceiling_r: "4.1",
      nathers_rating: "7",
      min_door_width: "820",
      min_corridor_width: "1000",
      ceiling_height_non_habitable: "2.4",
    });
  });

  it("rejects out-of-range numbers (impossible R-value, NatHERS > 10, sub-600mm door)", () => {
    expect(
      buildDesignPrefillFromAttributes({ insulation_wall_r: 99 }).insulation_wall_r,
    ).toBeUndefined();
    expect(
      buildDesignPrefillFromAttributes({ nathers_rating: 12 }).nathers_rating,
    ).toBeUndefined();
    expect(
      buildDesignPrefillFromAttributes({ min_door_width_mm: 100 }).min_door_width,
    ).toBeUndefined();
  });

  it("maps the energy/services categoricals", () => {
    const out = buildDesignPrefillFromAttributes({
      energy_pathway: "NatHERS",
      glazing_type: "Double glazed (low-e)",
      hot_water_system: "Electric heat pump",
      natural_ventilation_method: "Openable windows",
      heating_type: "Split system",
      garage_location: "Attached",
      smoke_alarm_type: "Photoelectric (hardwired interconnected)",
      dpc_type: "Chemical DPC",
    });
    expect(out).toMatchObject({
      energy_pathway: "NatHERS",
      glazing_type: "Double glazed (low-e)",
      hot_water_system: "Electric heat pump",
      natural_ventilation_method: "Openable windows",
      heating_type: "Split system",
      garage_location: "Attached",
      smoke_alarm_type: "Photoelectric (hardwired interconnected)",
      dpc_type: "Chemical DPC",
    });
  });
});
