/**
 * SCRUM-317 — AS 4055 wind-class options narrowed by the site's wind region.
 *
 * The class itself is NOT derivable from the address (it needs the site design
 * gust speed, i.e. terrain/shielding/topography multipliers property-services
 * does not return — caistech/property-services#57). The FAMILY is: regions A/B
 * are non-cyclonic, C/D are cyclonic. These cover that boundary, because an
 * N class offered on a cyclonic site is a real compliance error, not a UI nit.
 */

import { describe, it, expect } from "vitest";
import {
  windClassFamilyForRegion,
  windClassOptionsForRegion,
  windClassHelperText,
  ALL_WIND_CLASSIFICATIONS,
} from "@/lib/comply/wind-class";

describe("windClassFamilyForRegion", () => {
  it.each(["A", "A1", "A2", "A3", "A4", "B"])(
    "treats region %s as non-cyclonic",
    (region) => {
      expect(windClassFamilyForRegion(region)).toBe("non-cyclonic");
    },
  );

  it.each(["C", "D"])("treats region %s as cyclonic", (region) => {
    expect(windClassFamilyForRegion(region)).toBe("cyclonic");
  });

  it("is case- and whitespace-tolerant on the region string", () => {
    expect(windClassFamilyForRegion(" c ")).toBe("cyclonic");
    expect(windClassFamilyForRegion("a2")).toBe("non-cyclonic");
  });

  it.each([null, undefined, "", "Z", "unknown"])(
    "returns null for unusable region %s",
    (region) => {
      expect(windClassFamilyForRegion(region as string | null)).toBeNull();
    },
  );
});

describe("windClassOptionsForRegion", () => {
  it("offers only N classes in a non-cyclonic region", () => {
    expect(windClassOptionsForRegion("A2")).toEqual([
      "N1",
      "N2",
      "N3",
      "N4",
      "N5",
      "N6",
    ]);
  });

  it("offers only cyclonic classes in region C", () => {
    expect(windClassOptionsForRegion("C")).toEqual(["C1", "C2", "C3", "C4"]);
  });

  it("never offers an N class on a cyclonic site", () => {
    const options = windClassOptionsForRegion("D");
    expect(options.some((o) => o.startsWith("N"))).toBe(false);
  });

  it("falls back to the full list when the region is unknown", () => {
    // Degrade, don't fake: with no region we must not narrow the choice.
    expect(windClassOptionsForRegion(null)).toEqual([
      ...ALL_WIND_CLASSIFICATIONS,
    ]);
  });

  it("retains a saved answer that falls outside the family", () => {
    // A previously saved N2 on a site later derived as region C must stay
    // visible — silently dropping it would look like the app discarded the
    // user's input and would submit empty on the next save.
    const options = windClassOptionsForRegion("C", "N2");
    expect(options).toContain("N2");
    expect(options).toEqual(["C1", "C2", "C3", "C4", "N2"]);
  });

  it("does not duplicate a saved answer already in the family", () => {
    expect(windClassOptionsForRegion("C", "C2")).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
    ]);
  });

  it("ignores an empty saved answer", () => {
    expect(windClassOptionsForRegion("C", "")).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
    ]);
  });
});

describe("windClassHelperText", () => {
  it("names the region and the applicable family when known", () => {
    const text = windClassHelperText("C");
    expect(text).toContain("region C");
    expect(text).toContain("cyclonic");
  });

  it("still tells the user the class depends on their site assessment", () => {
    // The honest half: we narrowed the family, we did NOT determine the class.
    expect(windClassHelperText("A2")).toMatch(/terrain, shielding and topography/);
    expect(windClassHelperText(null)).toMatch(/terrain, shielding and topography/);
  });

  it("makes no region claim when the region is unknown", () => {
    expect(windClassHelperText(null)).not.toContain("region");
  });
});
