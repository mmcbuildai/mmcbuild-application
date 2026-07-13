import { describe, it, expect } from "vitest";
import {
  isFeaturedTier,
  supplierTierLabel,
  groupFeaturedByCategory,
  distinctCategories,
  FEATURED_TIER,
  type FeaturedProduct,
} from "@/lib/direct/featured-suppliers";

// SCRUM-171: only the Growth Partner tier surfaces products in Build, and each
// category shows at most 3.
function product(
  id: string,
  category: string,
): FeaturedProduct {
  return {
    product_id: id,
    professional_id: `pro-${id}`,
    company_name: "Acme",
    technology_category: category,
    name: `Product ${id}`,
    summary: null,
    sku: null,
    price_estimate: null,
    lead_time_days: null,
  };
}

describe("supplier tier gate", () => {
  it("only growth_partner is the featured tier", () => {
    expect(FEATURED_TIER).toBe("growth_partner");
    expect(isFeaturedTier("growth_partner")).toBe(true);
    expect(isFeaturedTier("verified")).toBe(false);
    expect(isFeaturedTier("free")).toBe(false);
    expect(isFeaturedTier(null)).toBe(false);
    expect(isFeaturedTier(undefined)).toBe(false);
  });

  it("labels tiers, defaulting unknown to Free", () => {
    expect(supplierTierLabel("growth_partner")).toBe("Growth Partner");
    expect(supplierTierLabel("verified")).toBe("Verified Supplier");
    expect(supplierTierLabel("free")).toBe("Free");
    expect(supplierTierLabel("nonsense")).toBe("Free");
    expect(supplierTierLabel(null)).toBe("Free");
  });
});

describe("groupFeaturedByCategory", () => {
  it("groups by category", () => {
    const grouped = groupFeaturedByCategory([
      product("1", "sip_panels"),
      product("2", "modular_pods"),
      product("3", "sip_panels"),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(["modular_pods", "sip_panels"]);
    expect(grouped.sip_panels.map((p) => p.product_id)).toEqual(["1", "3"]);
    expect(grouped.modular_pods.map((p) => p.product_id)).toEqual(["2"]);
  });

  it("caps each category at 3 (default), preserving order", () => {
    const grouped = groupFeaturedByCategory(
      ["a", "b", "c", "d", "e"].map((id) => product(id, "steel_framing")),
    );
    expect(grouped.steel_framing.map((p) => p.product_id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("honours a custom cap", () => {
    const grouped = groupFeaturedByCategory(
      ["a", "b", "c"].map((id) => product(id, "clt_mass_timber")),
      1,
    );
    expect(grouped.clt_mass_timber).toHaveLength(1);
  });

  it("returns an empty object for no products", () => {
    expect(groupFeaturedByCategory([])).toEqual({});
  });
});

describe("distinctCategories", () => {
  it("dedupes the categories present in a suggestion set", () => {
    expect(
      distinctCategories([
        { technology_category: "sip_panels" },
        { technology_category: "modular_pods" },
        { technology_category: "sip_panels" },
      ]),
    ).toEqual(["sip_panels", "modular_pods"]);
    expect(distinctCategories([])).toEqual([]);
  });

  it("drops null/undefined categories (defensive — no pointless query)", () => {
    expect(
      distinctCategories([
        { technology_category: "sip_panels" },
        { technology_category: null },
        {},
      ]),
    ).toEqual(["sip_panels"]);
  });
});
