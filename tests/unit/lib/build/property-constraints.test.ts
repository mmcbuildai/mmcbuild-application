import { describe, it, expect } from "vitest";
import type { PropertyProfile } from "@caistech/property-services-sdk";
import { buildDesignConstraints } from "@/lib/build/property-constraints";

function makeProfile(overrides: Partial<PropertyProfile> = {}): PropertyProfile {
  return {
    address: {
      full: "1 Test St", streetNumber: "1", streetName: "Test St",
      suburb: "Suburb", state: "NSW", postcode: "2000", lat: -33.8, lng: 151.2,
    },
    lot: null,
    zoning: null,
    environment: {
      windRegion: null, windSpeed: null, climateZone: null, climateZoneNumber: null,
      climateDescription: null, bal: null, balInOverlay: false,
    },
    terrain: null,
    overlays: [],
    subdivision: null,
    summary: "",
    metadata: {
      sourceApis: [], lgaCode: null, lgaName: null, lgaCoverage: "none",
      cached: false, derivedAt: "2026-07-09T00:00:00Z", expiresAt: "2026-08-09T00:00:00Z",
    },
    ...overrides,
  };
}

function zoning(z: Partial<NonNullable<PropertyProfile["zoning"]>>): PropertyProfile["zoning"] {
  return {
    code: "R2", name: "R2 Low Density Residential", description: null,
    minimumLotSize: null, maximumHeight: null, maximumHeightStoreys: null,
    setbacks: null, permittedUses: [], subdivisionPermitted: false, modularProvisions: null,
    ...z,
  };
}

describe("buildDesignConstraints", () => {
  it("returns empty string when there is no profile", () => {
    expect(buildDesignConstraints(null)).toBe("");
    expect(buildDesignConstraints(undefined)).toBe("");
  });

  it("returns empty string when the profile carries no constraining fields", () => {
    expect(buildDesignConstraints(makeProfile())).toBe("");
  });

  it("emits the height envelope so the optimiser cannot raise the building", () => {
    const out = buildDesignConstraints(
      makeProfile({ zoning: zoning({ maximumHeight: 9, maximumHeightStoreys: 2 }) }),
    );
    expect(out).toContain("AUTHORITATIVE SITE CONSTRAINTS");
    expect(out).toContain("Maximum building height 9 m");
    expect(out).toContain("2 storeys");
  });

  it("emits the required setbacks", () => {
    const out = buildDesignConstraints(
      makeProfile({ zoning: zoning({ setbacks: { front: 6, side: 0.9, rear: 3, notes: null } }) }),
    );
    expect(out).toContain("front 6 m");
    expect(out).toContain("side 0.9 m");
  });

  it("requires AS 3959 compliance for a bushfire site", () => {
    const out = buildDesignConstraints(
      makeProfile({ environment: { ...makeProfile().environment, bal: "BAL-29" } }),
    );
    expect(out).toContain("BAL-29");
    expect(out).toContain("AS 3959");
  });

  it("does not emit a bushfire line for BAL-LOW / N/A", () => {
    expect(buildDesignConstraints(makeProfile({ environment: { ...makeProfile().environment, bal: "BAL-LOW" } }))).toBe("");
    expect(buildDesignConstraints(makeProfile({ environment: { ...makeProfile().environment, bal: "N/A" } }))).toBe("");
  });

  it("emits flood and heritage overlay guidance", () => {
    const out = buildDesignConstraints(
      makeProfile({
        overlays: [
          { type: "flood", name: "Flood", requirements: [], requiresReport: true },
          { type: "heritage", name: "Heritage", requirements: [], requiresReport: false },
        ],
      }),
    );
    expect(out).toContain("Flood overlay");
    expect(out).toContain("Heritage overlay");
  });

  it("emits terrain guidance favouring slope-tolerant systems", () => {
    const out = buildDesignConstraints(
      makeProfile({ terrain: { elevationM: null, slopePercent: 18, fallMeters: null, buildability: "moderate", source: "t" } }),
    );
    expect(out).toContain("slope ~18%");
    expect(out).toContain("screw piles");
  });

  it("includes local modular provisions when present", () => {
    const out = buildDesignConstraints(
      makeProfile({ zoning: zoning({ modularProvisions: "Manufactured homes permitted with consent" }) }),
    );
    expect(out).toContain("Manufactured homes permitted with consent");
  });
});
