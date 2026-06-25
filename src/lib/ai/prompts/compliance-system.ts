export const COMPLIANCE_SYSTEM_PROMPT = `You are an expert Australian building compliance analyst specialising in the National Construction Code (NCC) for residential construction (Volume Two — Housing Provisions, and Volume One where applicable).

Your role is to review building plan extracts and project details, then assess compliance against relevant NCC provisions. You must:

1. **Identify applicable NCC sections** based on building classification, construction type, and project details.
2. **Assess compliance** for each relevant provision, citing specific NCC clause numbers (e.g., "H1P1", "3.7.1.1", "Part 3.12").
3. **Assign severity** to each finding:
   - "compliant" — meets NCC requirements based on available information
   - "advisory" — potential concern; requires further review or clarification
   - "non_compliant" — appears to not meet NCC requirements based on available information
   - "critical" — significant non-compliance that may affect safety or structural integrity
4. **Provide confidence scores** (0.0 to 1.0) reflecting how certain you are about each finding given the available information.
5. **Include specific NCC citations** with clause numbers and brief descriptions.
6. **Reference page numbers** from the uploaded plan where relevant.

IMPORTANT DISCLAIMERS:
- This is an AI-generated advisory report only. It does NOT constitute formal compliance certification.
- All findings must be verified by a qualified building surveyor or certifier.
- The analysis is based on the information provided and may not capture all compliance requirements.
- Australian NCC requirements may vary by state/territory — local variations should be confirmed.

Always respond with valid JSON matching the requested schema. Do not include any text outside the JSON response.`;

/**
 * The NCC volume that governs a building, from its classification. This is the
 * single most useful "mechanical" narrowing in the whole run (Karen, 2026-06-20):
 * the energy-efficiency analysis was burning time + tokens checking Section J of
 * Volume One (commercial) on a residential plan, then reconciling that it didn't
 * apply, until it timed out. Telling the model the volume UP FRONT removes that
 * wasted pass on every category.
 *
 *   Class 1 (houses) + Class 10 (sheds/structures) → Volume Two (Housing Provisions)
 *   Class 2–9 (apartments, boarding/hotel, commercial) → Volume One
 *   Unknown/blank → default to Volume Two (this tool is built for residential)
 *
 * Pure + exported for unit testing.
 */
export function nccVolumeDirective(buildingClass: string): string {
  const match = buildingClass.toLowerCase().match(/class\s*(\d+)/);
  const classNum = match ? parseInt(match[1], 10) : null;
  const isVolumeTwo = classNum === 1 || classNum === 10 || classNum === null;

  if (isVolumeTwo) {
    return `APPLICABLE NCC VOLUME — READ FIRST:
This is a ${buildingClass || "Class 1a"} building, governed by NCC Volume Two (Housing Provisions). Assess compliance ONLY against Volume Two. Do NOT apply, retrieve, or spend analysis on Volume One provisions (e.g. Section J and other commercial parts) — they do not apply to this building, and considering them wastes effort and produces incorrect "wrong volume applied" findings.
`;
  }

  return `APPLICABLE NCC VOLUME — READ FIRST:
This is a ${buildingClass} building, governed by NCC Volume One (NOT Volume Two). IMPORTANT: MMC Comply's checks are tuned for NCC Volume Two (residential, Class 1/10). Apply Volume One provisions where you can, but raise an ADVISORY finding stating that a full NCC Volume One assessment by a registered building surveyor is required, and do NOT present Volume Two Housing-Provisions results as authoritative for this building.
`;
}

export const COMPLIANCE_USER_CONTEXT_TEMPLATE = (data: Record<string, string | number | boolean>) => {
  const v = (key: string, fallback = "Not specified") => {
    const val = data[key];
    if (val === undefined || val === null || val === "") return fallback;
    return String(val);
  };

  return `${nccVolumeDirective(v("building_class", "Class 1a"))}
PROJECT DETAILS:

CLASSIFICATION & GENERAL:
- Building Classification: ${v("building_class", "Class 1a")}
- Construction Type: ${v("construction_type", "Type C")}

H1 — STRUCTURE & FOOTINGS:
- Number of Storeys: ${v("storeys", "1")}
- Total Floor Area: ${v("floor_area")} m²
- Upper-storey Floor Area: ${v("upper_floor_area")} m²
- Overall Building Height (to ridge): ${v("building_height")} m
- Soil Classification (AS 2870): ${v("soil_classification")}
- Footing Type: ${v("footing_type")}
- Wind Classification (AS 4055): ${v("wind_classification")}
- Terrain Category: ${v("terrain_category")}

H2 — WEATHERPROOFING:
- Roof Material: ${v("roof_material")}
- Wall Cladding: ${v("wall_cladding")}
- Damp-Proof Course: ${v("dpc_type")}
- Sarking: ${v("sarking", "false")}
- Sub-floor Ventilation: ${v("subfloor_ventilation", "false")}

H3 — FIRE SAFETY:
- Distance to Boundary: ${v("distance_to_boundary")} m
- Attached Dwelling: ${v("attached_dwelling", "false")}
- Garage Location: ${v("garage_location")}
- Smoke Alarm Type: ${v("smoke_alarm_type")}
- Party Wall FRL: ${v("party_wall_frl")}

H4 — HEALTH & AMENITY:
- Wet Area Count: ${v("wet_area_count")}
- Ceiling Height (Habitable): ${v("ceiling_height_habitable")} m
- Ceiling Height (Non-habitable): ${v("ceiling_height_non_habitable")} m
- Exhaust Fans: ${v("exhaust_fans", "true")}
- Natural Ventilation Method: ${v("natural_ventilation_method")}

H6 — ENERGY EFFICIENCY:
- Energy Pathway: ${v("energy_pathway")}
- Ceiling Insulation R-value: ${v("insulation_ceiling_r")}
- Wall Insulation R-value: ${v("insulation_wall_r")}
- Floor Insulation R-value: ${v("insulation_floor_r")}
- Glazing Type: ${v("glazing_type")}
- Hot Water System: ${v("hot_water_system")}
- Solar PV: ${v("has_solar_pv", "false")}
- NatHERS Rating: ${v("nathers_rating")}

SITE, CLIMATE & BUSHFIRE:
- Climate Zone: ${v("climate_zone", "6")}
- Bushfire Attack Level (BAL): ${v("bal_rating", "N/A")}
- Site Conditions: ${v("site_conditions")}
- Swimming Pool: ${v("has_swimming_pool", "false")}
- Heating Appliance: ${v("has_heating_appliance", "false")}
- Heating Type: ${v("heating_type")}

H5/H8 — ACCESS & LIVABLE HOUSING:
- Has Stairs: ${v("has_stairs", "false")}
- Has Balcony/Deck: ${v("has_balcony_deck", "false")}
- Max Fall Height: ${v("max_fall_height")} m
- Step-free Entry: ${v("has_step_free_entry", "false")}
- Accessible Bathroom: ${v("accessible_bathroom", "false")}
- Min Door Width: ${v("min_door_width")} mm
- Min Corridor Width: ${v("min_corridor_width")} mm`;
};
