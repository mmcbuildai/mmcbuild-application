import { describe, it, expect } from "vitest";
import type { PropertyProfile } from "@caistech/property-services-sdk";
import {
  buildComplianceContext,
  checkSuggestionCompliance,
  type SuggestionComplianceContext,
} from "@/lib/build/suggestion-compliance";

function ctx(over: Partial<SuggestionComplianceContext> = {}): SuggestionComplianceContext {
  return {
    bal: null,
    climateZone: null,
    buildingClass: null,
    constructionType: null,
    attachedDwelling: false,
    ...over,
  };
}

function profileWith(env: Partial<PropertyProfile["environment"]>): PropertyProfile {
  return {
    address: { full: "", streetNumber: "", streetName: "", suburb: "", state: "", postcode: "", lat: 0, lng: 0 },
    lot: null,
    zoning: null,
    environment: {
      windRegion: null, windSpeed: null, climateZone: null, climateZoneNumber: null,
      climateDescription: null, bal: null, balInOverlay: false, ...env,
    },
    terrain: null,
    overlays: [],
    subdivision: null,
    summary: "",
    metadata: { sourceApis: [], lgaCode: null, lgaName: null, lgaCoverage: "none", cached: false, derivedAt: "", expiresAt: "" },
  };
}

describe("buildComplianceContext", () => {
  it("prefers the authoritative profile BAL over the questionnaire", () => {
    const c = buildComplianceContext(
      { bal_rating: "BAL-12.5" },
      profileWith({ bal: "BAL-40" }),
    );
    expect(c.bal).toBe("40");
  });

  it("falls back to the questionnaire BAL when no profile", () => {
    expect(buildComplianceContext({ bal_rating: "BAL-29" }, null).bal).toBe("29");
  });

  it("takes the climate zone from the profile, else the questionnaire", () => {
    expect(buildComplianceContext({ climate_zone: "5" }, profileWith({ climateZoneNumber: 6 })).climateZone).toBe(6);
    expect(buildComplianceContext({ climate_zone: "5" }, null).climateZone).toBe(5);
  });

  it("parses attached_dwelling from string or boolean", () => {
    expect(buildComplianceContext({ attached_dwelling: "true" }, null).attachedDwelling).toBe(true);
    expect(buildComplianceContext({ attached_dwelling: true }, null).attachedDwelling).toBe(true);
    expect(buildComplianceContext({ attached_dwelling: "false" }, null).attachedDwelling).toBe(false);
    expect(buildComplianceContext(null, null).attachedDwelling).toBe(false);
  });
});

describe("checkSuggestionCompliance — bushfire (BAL)", () => {
  it("warns on a combustible external system at BAL-40", () => {
    const f = checkSuggestionCompliance({ technologyCategory: "sip_panels", context: ctx({ bal: "40" }) });
    expect(f?.severity).toBe("warning");
    expect(f?.nccClause).toContain("AS 3959");
    expect(f?.title).toContain("BAL-40");
  });

  it("warns at BAL-FZ (flame zone)", () => {
    expect(checkSuggestionCompliance({ technologyCategory: "clt_mass_timber", context: ctx({ bal: "FZ" }) })?.severity).toBe("warning");
  });

  it("cautions (not warns) at BAL-29", () => {
    expect(checkSuggestionCompliance({ technologyCategory: "prefabricated_wall_panels", context: ctx({ bal: "29" }) })?.severity).toBe("caution");
  });

  it("does not flag at BAL-12.5", () => {
    expect(checkSuggestionCompliance({ technologyCategory: "sip_panels", context: ctx({ bal: "12.5" }) })).toBeNull();
  });

  it("does NOT flag non-combustible systems (steel, precast) even at BAL-FZ", () => {
    expect(checkSuggestionCompliance({ technologyCategory: "steel_framing", context: ctx({ bal: "FZ" }) })).toBeNull();
    expect(checkSuggestionCompliance({ technologyCategory: "precast_concrete", context: ctx({ bal: "40" }) })).toBeNull();
  });
});

describe("checkSuggestionCompliance — construction type + party wall", () => {
  it("warns when a combustible system is used in Type A construction", () => {
    const f = checkSuggestionCompliance({ technologyCategory: "clt_mass_timber", context: ctx({ constructionType: "Type A" }) });
    expect(f?.severity).toBe("warning");
    expect(f?.title).toContain("Type A");
  });

  it("cautions on a lightweight party wall for an attached dwelling", () => {
    const f = checkSuggestionCompliance({ technologyCategory: "steel_framing", context: ctx({ attachedDwelling: true }) });
    expect(f?.severity).toBe("caution");
    expect(f?.detail).toContain("party");
  });

  it("does not raise a party-wall flag for a detached dwelling", () => {
    expect(checkSuggestionCompliance({ technologyCategory: "sip_panels", context: ctx({ attachedDwelling: false }) })).toBeNull();
  });
});

describe("checkSuggestionCompliance — severity + empty", () => {
  it("returns the highest-severity flag when several apply", () => {
    // BAL-40 (warning) + attached dwelling (caution) → warning wins.
    const f = checkSuggestionCompliance({
      technologyCategory: "sip_panels",
      context: ctx({ bal: "40", attachedDwelling: true }),
    });
    expect(f?.severity).toBe("warning");
    expect(f?.nccClause).toContain("AS 3959");
  });

  it("returns null when nothing is at risk", () => {
    expect(checkSuggestionCompliance({ technologyCategory: "modular_pods", context: ctx() })).toBeNull();
    expect(checkSuggestionCompliance({ technologyCategory: "sip_panels", context: ctx() })).toBeNull();
  });

  it("only emits the two allowed severities", () => {
    const cases = [
      checkSuggestionCompliance({ technologyCategory: "sip_panels", context: ctx({ bal: "FZ" }) }),
      checkSuggestionCompliance({ technologyCategory: "sip_panels", context: ctx({ bal: "19" }) }),
      checkSuggestionCompliance({ technologyCategory: "clt_mass_timber", context: ctx({ constructionType: "Type B" }) }),
      checkSuggestionCompliance({ technologyCategory: "steel_framing", context: ctx({ attachedDwelling: true }) }),
    ].filter(Boolean);
    expect(cases.length).toBe(4);
    for (const f of cases) expect(["warning", "caution"]).toContain(f!.severity);
  });
});
