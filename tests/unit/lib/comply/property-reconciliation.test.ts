import { describe, it, expect } from "vitest";
import type { PropertyProfile } from "@caistech/property-services-sdk";
import {
  reconcileAuthoritative,
  buildAuthoritativeContext,
  normaliseBal,
} from "@/lib/comply/property-reconciliation";

/** Minimal valid PropertyProfile with everything null/empty; override per test. */
function makeProfile(overrides: Partial<PropertyProfile> = {}): PropertyProfile {
  return {
    address: {
      full: "1 Test St, Suburb NSW 2000",
      streetNumber: "1",
      streetName: "Test St",
      suburb: "Suburb",
      state: "NSW",
      postcode: "2000",
      lat: -33.8,
      lng: 151.2,
    },
    lot: null,
    zoning: null,
    environment: {
      windRegion: null,
      windSpeed: null,
      climateZone: null,
      climateZoneNumber: null,
      climateDescription: null,
      bal: null,
      balInOverlay: false,
    },
    terrain: null,
    overlays: [],
    subdivision: null,
    summary: "",
    metadata: {
      sourceApis: [],
      lgaCode: null,
      lgaName: null,
      lgaCoverage: "none",
      cached: false,
      derivedAt: "2026-07-09T00:00:00Z",
      expiresAt: "2026-08-09T00:00:00Z",
    },
    ...overrides,
  };
}

function zoning(z: Partial<PropertyProfile["zoning"]>): PropertyProfile["zoning"] {
  return {
    code: "R2",
    name: "R2 Low Density Residential",
    description: null,
    minimumLotSize: null,
    maximumHeight: null,
    maximumHeightStoreys: null,
    setbacks: null,
    permittedUses: [],
    subdivisionPermitted: false,
    modularProvisions: null,
    ...(z as object),
  } as PropertyProfile["zoning"];
}

describe("reconcileAuthoritative", () => {
  it("returns no findings when there is no profile (degraded/normal case)", () => {
    expect(reconcileAuthoritative({ profile: null, attrs: {}, questionnaire: {} })).toEqual([]);
    expect(reconcileAuthoritative({ profile: undefined, attrs: null, questionnaire: null })).toEqual([]);
  });

  it("flags a building height that exceeds the zone maximum as non_compliant", () => {
    const profile = makeProfile({ zoning: zoning({ maximumHeight: 9 }) });
    const findings = reconcileAuthoritative({
      profile,
      attrs: { building_height_m: 11.5 },
      questionnaire: {},
    });
    const height = findings.find((f) => f.title.includes("height"));
    expect(height?.severity).toBe("non_compliant");
    expect(height?.category).toBe("structural");
    expect(height?.responsible_discipline).toBe("building_surveyor");
    expect(height?.description).toContain("11.5");
    expect(height?.description).toContain("9");
  });

  it("marks a height within the zone maximum as compliant (positive confirmation)", () => {
    const profile = makeProfile({ zoning: zoning({ maximumHeight: 9 }) });
    const findings = reconcileAuthoritative({
      profile,
      attrs: { building_height_m: 8.2 },
      questionnaire: {},
    });
    expect(findings.find((f) => f.title.includes("height"))?.severity).toBe("compliant");
  });

  it("does not flag a height within measurement tolerance of the limit", () => {
    const profile = makeProfile({ zoning: zoning({ maximumHeight: 9 }) });
    const findings = reconcileAuthoritative({
      profile,
      attrs: { building_height_m: 9.2 }, // within 0.3m tolerance
      questionnaire: {},
    });
    expect(findings.find((f) => f.title.includes("height"))?.severity).toBe("compliant");
  });

  it("advises confirming height when the register has a max but the plan has none", () => {
    const profile = makeProfile({ zoning: zoning({ maximumHeight: 9 }) });
    const findings = reconcileAuthoritative({ profile, attrs: {}, questionnaire: {} });
    const height = findings.find((f) => f.title.includes("height"));
    expect(height?.severity).toBe("advisory");
  });

  it("flags a storey count over the zone maximum as non_compliant", () => {
    const profile = makeProfile({ zoning: zoning({ maximumHeightStoreys: 2 }) });
    const findings = reconcileAuthoritative({
      profile,
      attrs: { storeys: 3 },
      questionnaire: {},
    });
    expect(findings.find((f) => f.title.includes("storey"))?.severity).toBe("non_compliant");
  });

  it("flags a boundary setback below the smallest required as non_compliant", () => {
    const profile = makeProfile({
      zoning: zoning({ setbacks: { front: 6, side: 0.9, rear: 3, notes: null } }),
    });
    const findings = reconcileAuthoritative({
      profile,
      attrs: { distance_to_boundary_m: 0.4 }, // below the 0.9m minimum
      questionnaire: {},
    });
    const setback = findings.find((f) => f.title.includes("setback"));
    expect(setback?.severity).toBe("non_compliant");
    expect(setback?.description).toContain("0.9");
  });

  it("advises per-boundary confirmation (never a false pass) when the smallest distance clears the minimum", () => {
    const profile = makeProfile({
      zoning: zoning({ setbacks: { front: 6, side: 0.9, rear: 3, notes: null } }),
    });
    const findings = reconcileAuthoritative({
      profile,
      attrs: { distance_to_boundary_m: 2 },
      questionnaire: {},
    });
    const setback = findings.find((f) => f.title.includes("setback"));
    expect(setback?.severity).toBe("advisory");
  });

  it("flags a design BAL below the site's authoritative BAL as non_compliant", () => {
    const profile = makeProfile({
      environment: { ...makeProfile().environment, bal: "BAL-29" },
    });
    const findings = reconcileAuthoritative({
      profile,
      attrs: {},
      questionnaire: { bal_rating: "BAL-12.5" },
    });
    const bal = findings.find((f) => f.category === "bushfire");
    expect(bal?.severity).toBe("non_compliant");
    expect(bal?.responsible_discipline).toBe("fire_engineer");
  });

  it("advises specifying BAL when the site is bushfire-prone but the plan states none", () => {
    const profile = makeProfile({
      environment: { ...makeProfile().environment, bal: "BAL-40" },
    });
    const findings = reconcileAuthoritative({ profile, attrs: {}, questionnaire: {} });
    const bal = findings.find((f) => f.category === "bushfire");
    expect(bal?.severity).toBe("advisory");
    expect(bal?.title).toContain("40");
  });

  it("marks an adequate BAL as compliant", () => {
    const profile = makeProfile({
      environment: { ...makeProfile().environment, bal: "BAL-19" },
    });
    const findings = reconcileAuthoritative({
      profile,
      attrs: {},
      questionnaire: { bal_rating: "BAL-29" },
    });
    expect(findings.find((f) => f.category === "bushfire")?.severity).toBe("compliant");
  });

  it("raises an advisory for each planning overlay the site carries", () => {
    const profile = makeProfile({
      overlays: [
        { type: "flood", name: "Flood Planning", requirements: ["Min floor level RL 5.2"], requiresReport: true },
        { type: "heritage", name: "Heritage Conservation Area", requirements: [], requiresReport: false },
      ],
    });
    const findings = reconcileAuthoritative({ profile, attrs: {}, questionnaire: {} });
    const flood = findings.find((f) => f.title.includes("Flood"));
    expect(flood?.severity).toBe("advisory");
    expect(flood?.category).toBe("waterproofing");
    expect(flood?.responsible_discipline).toBe("hydraulic_engineer");
    expect(flood?.description).toContain("Min floor level RL 5.2");
    const heritage = findings.find((f) => f.title.includes("Heritage"));
    expect(heritage?.responsible_discipline).toBe("building_surveyor");
  });

  it("raises a terrain constructability advisory on a steep site", () => {
    const profile = makeProfile({
      terrain: { elevationM: null, slopePercent: 22, fallMeters: null, buildability: "moderate", source: "test" },
    });
    const findings = reconcileAuthoritative({ profile, attrs: {}, questionnaire: {} });
    const terrain = findings.find((f) => f.title.includes("terrain"));
    expect(terrain?.severity).toBe("advisory");
    expect(terrain?.responsible_discipline).toBe("geotechnical_engineer");
    expect(terrain?.description).toContain("22");
  });

  it("flags an undersized lot against the zone minimum", () => {
    const profile = makeProfile({
      lot: { lotSize: 380, lotNumber: null, planNumber: null, parcelId: null },
      zoning: zoning({ minimumLotSize: 450 }),
    });
    const findings = reconcileAuthoritative({ profile, attrs: {}, questionnaire: {} });
    const lot = findings.find((f) => f.title.includes("lot is smaller"));
    expect(lot?.severity).toBe("advisory");
  });

  it("only emits severities the DB enum accepts", () => {
    const profile = makeProfile({
      zoning: zoning({ maximumHeight: 9, maximumHeightStoreys: 2, setbacks: { front: 6, side: 0.9, rear: 3, notes: null }, minimumLotSize: 450 }),
      environment: { ...makeProfile().environment, bal: "BAL-29" },
      terrain: { elevationM: null, slopePercent: 20, fallMeters: null, buildability: "poor", source: "t" },
      lot: { lotSize: 300, lotNumber: null, planNumber: null, parcelId: null },
      overlays: [{ type: "flood", name: "Flood", requirements: [], requiresReport: false }],
    });
    const findings = reconcileAuthoritative({
      profile,
      attrs: { building_height_m: 12, storeys: 4, distance_to_boundary_m: 0.3 },
      questionnaire: { bal_rating: "BAL-12.5" },
    });
    const allowed = new Set(["compliant", "advisory", "non_compliant", "critical"]);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(allowed.has(f.severity)).toBe(true);
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("normaliseBal", () => {
  it("normalises the common BAL string forms", () => {
    expect(normaliseBal("BAL-29")).toBe("29");
    expect(normaliseBal("BAL 40")).toBe("40");
    expect(normaliseBal("29")).toBe("29");
    expect(normaliseBal("bal-fz")).toBe("FZ");
    expect(normaliseBal("BAL-LOW")).toBe("LOW");
    expect(normaliseBal("BAL-12.5")).toBe("12.5");
  });
  it("returns null for absent / N/A values", () => {
    expect(normaliseBal(null)).toBeNull();
    expect(normaliseBal(undefined)).toBeNull();
    expect(normaliseBal("N/A")).toBeNull();
    expect(normaliseBal("")).toBeNull();
  });
});

describe("buildAuthoritativeContext", () => {
  it("returns empty string when there is no profile", () => {
    expect(buildAuthoritativeContext(null)).toBe("");
    expect(buildAuthoritativeContext(undefined)).toBe("");
  });

  it("includes the zoning envelope, BAL, overlays and terrain when present", () => {
    const profile = makeProfile({
      zoning: zoning({ maximumHeight: 9, maximumHeightStoreys: 2, setbacks: { front: 6, side: 0.9, rear: 3, notes: null }, minimumLotSize: 450 }),
      environment: { ...makeProfile().environment, bal: "BAL-29", windRegion: "A2", climateZoneNumber: 6 },
      overlays: [{ type: "flood", name: "Flood Planning", requirements: [], requiresReport: true }],
      terrain: { elevationM: null, slopePercent: 12, fallMeters: null, buildability: "moderate", source: "t" },
    });
    const ctx = buildAuthoritativeContext(profile);
    expect(ctx).toContain("AUTHORITATIVE SITE DATA");
    expect(ctx).toContain("9 m");
    expect(ctx).toContain("front 6 m");
    expect(ctx).toContain("BAL-29");
    expect(ctx).toContain("Flood Planning");
    expect(ctx).toContain("slope 12%");
  });

  it("returns empty string when the profile carries no usable fields", () => {
    expect(buildAuthoritativeContext(makeProfile())).toBe("");
  });
});
