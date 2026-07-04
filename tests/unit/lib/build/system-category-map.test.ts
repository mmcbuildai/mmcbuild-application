import { describe, it, expect } from "vitest";
import {
  categoriesForSelectedSystems,
  filterSuggestionsBySystems,
} from "@/lib/build/system-category-map";

type S = { technology_category: string };

const ALL: S[] = [
  { technology_category: "sip_panels" },
  { technology_category: "prefabricated_wall_panels" },
  { technology_category: "modular_pods" },
  { technology_category: "precast_concrete" },
  { technology_category: "prefab_roof_trusses" },
  { technology_category: "steel_framing" },
];

describe("categoriesForSelectedSystems", () => {
  it("returns null when nothing is selected", () => {
    expect(categoriesForSelectedSystems(null)).toBeNull();
    expect(categoriesForSelectedSystems([])).toBeNull();
  });

  it("maps SIPs to sip_panels + prefabricated_wall_panels", () => {
    const cats = categoriesForSelectedSystems(["sips"]);
    expect(cats).not.toBeNull();
    expect([...cats!].sort()).toEqual(["prefabricated_wall_panels", "sip_panels"]);
  });

  it("unions categories across multiple selected systems", () => {
    const cats = categoriesForSelectedSystems(["volumetric_modular", "concrete_printing"]);
    expect([...cats!].sort()).toEqual(["modular_pods", "precast_concrete"]);
  });

  it("returns null for an unmappable selection", () => {
    expect(categoriesForSelectedSystems(["not_a_system"])).toBeNull();
  });
});

describe("filterSuggestionsBySystems", () => {
  it("returns everything unchanged when nothing is selected", () => {
    expect(filterSuggestionsBySystems(ALL, null)).toEqual(ALL);
    expect(filterSuggestionsBySystems(ALL, [])).toEqual(ALL);
  });

  it("narrows to only the selected system's categories (the Karen bug)", () => {
    const out = filterSuggestionsBySystems(ALL, ["sips"]);
    expect(out.map((s) => s.technology_category).sort()).toEqual([
      "prefabricated_wall_panels",
      "sip_panels",
    ]);
    // The un-selected categories (modular pods, precast, roof trusses, steel) are dropped.
    expect(out.some((s) => s.technology_category === "prefab_roof_trusses")).toBe(false);
  });

  it("falls back to everything when the filter would empty the report", () => {
    const onlyTrusses: S[] = [{ technology_category: "prefab_roof_trusses" }];
    // "sips" maps to sip/wall-panels — none present — so returning [] would be a
    // broken-looking empty report; the guard returns the original set instead.
    expect(filterSuggestionsBySystems(onlyTrusses, ["sips"])).toEqual(onlyTrusses);
  });

  it("does not filter on an unmappable selection", () => {
    expect(filterSuggestionsBySystems(ALL, ["not_a_system"])).toEqual(ALL);
  });
});
