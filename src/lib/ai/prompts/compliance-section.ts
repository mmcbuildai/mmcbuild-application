import type { NccCategory, ContributorDiscipline } from "../types";

const SECTION_PROMPTS: Record<NccCategory, string> = {
  fire_safety: `Analyse the building plan and project details for FIRE SAFETY compliance under NCC Volume Two (Housing Provisions).

Focus on:
- Part 3.7 Fire safety (fire separation, fire resistance levels)
- Smoke alarm requirements (AS 3786)
- Fire separation between dwellings and garage
- Protection of openings
- Bushfire construction requirements if applicable (AS 3959)

Consider the building classification and construction type when determining applicable requirements.`,

  structural: `Analyse the building plan and project details for STRUCTURAL compliance under NCC Volume Two.

Focus on:
- Part 3.4 Footings and slabs (soil classification, footing design)
- Part 3.5 Masonry (if applicable)
- Part 3.6 Framing (timber/steel framing, bracing, tie-down)
- Wind classification and load paths
- Earthquake design considerations (if applicable)
- Foundation adequacy for site conditions`,

  energy_efficiency: `Analyse the building plan and project details for ENERGY EFFICIENCY compliance under NCC Volume Two.

Focus on:
- Part 13 Energy Efficiency (NCC 2022+) or Part 3.12 (pre-2022)
- Thermal performance requirements for the climate zone
- Insulation requirements (walls, ceiling, floor)
- Glazing requirements (U-value, SHGC for the climate zone)
- Building sealing and air leakage
- Services energy efficiency (water heating, lighting, HVAC)
- Whole-of-home energy rating (NatHERS if applicable)`,

  accessibility: `Analyse the building plan and project details for ACCESSIBILITY provisions under NCC Volume Two.

Focus on:
- Accessible housing provisions (if applicable under state requirements)
- Livable Housing Design Guidelines alignment
- Entry access (step-free entry if required)
- Internal circulation (corridors, doorways)
- Bathroom and toilet accessibility
- Note: Class 1a dwellings have limited mandatory accessibility requirements under NCC but some states require additional provisions`,

  waterproofing: `Analyse the building plan and project details for WATERPROOFING compliance under NCC Volume Two.

Focus on:
- Part 3.8 Wet areas (AS 3740 compliance)
- Waterproofing to bathrooms, laundries, and other wet areas
- Shower waterproofing requirements
- External waterproofing and damp-proofing
- Balcony and deck waterproofing
- Sub-floor ventilation and moisture management`,

  ventilation: `Analyse the building plan and project details for VENTILATION compliance under NCC Volume Two.

Focus on:
- Part 3.8.5 Ventilation of rooms
- Natural ventilation requirements (openable window area)
- Mechanical ventilation for bathrooms and laundries
- Sub-floor ventilation requirements
- Kitchen exhaust requirements
- Habitable room ventilation openings (minimum 5% of floor area)`,

  glazing: `Analyse the building plan and project details for GLAZING compliance under NCC Volume Two.

Focus on:
- Part 3.6 Glazing (AS 1288)
- Safety glazing requirements (human impact areas)
- Glazing in hazardous locations (doors, sidelights, low-level glazing)
- Balustrade glazing requirements
- Energy efficiency glazing requirements for the climate zone`,

  termite: `Analyse the building plan and project details for TERMITE MANAGEMENT compliance under NCC Volume Two.

Focus on:
- Part 3.1.3 Termite risk management
- AS 3660.1 Termite management — new building work
- Termite management systems (physical barriers, chemical treatment)
- Slab edge exposure requirements
- Inspection access requirements
- Termite risk zone applicability`,

  bushfire: `Analyse the building plan and project details for BUSHFIRE compliance under NCC Volume Two.

Focus on:
- AS 3959 Construction of buildings in bushfire-prone areas
- Applicable BAL (Bushfire Attack Level) requirements
- External wall construction for the assigned BAL
- Roof construction and sarking requirements
- Window and glazing requirements for BAL rating
- Decking and subfloor enclosure
- Water supply and access requirements

Note: Only applicable if BAL rating is BAL-LOW or higher. If BAL is N/A or BAL-LOW, note that standard construction is acceptable.`,

  weatherproofing: `Analyse the building plan and project details for WEATHERPROOFING (BUILDING ENVELOPE) compliance under NCC Volume Two — Housing Provisions Part H2.

Focus on:
- Roof covering adequacy and compliance with AS 4654 (waterproof membranes)
- Sarking requirements for the climate zone and roof type
- Damp-proof course (DPC) installation and compliance
- Flashings to roof penetrations, wall junctions, and window openings
- Wall cladding weatherproofing and installation requirements
- Sub-floor moisture management and ventilation
- External waterproofing to wet areas above ground floor
- Weatherproofing of building envelope junctions (wall-to-roof, wall-to-floor)`,

  health_amenity: `Analyse the building plan and project details for HEALTH & AMENITY compliance under NCC Volume Two — Housing Provisions Part H4.

Focus on:
- Wet area waterproofing (AS 3740) — bathrooms, laundries, WCs
- Ceiling heights — minimum 2.4m habitable rooms, 2.1m non-habitable rooms
- Room sizes and proportions for habitable rooms
- Exhaust fan requirements for wet areas (kitchen, bathroom, laundry)
- Natural light — minimum 10% window-to-floor area ratio for habitable rooms
- Sound insulation between dwellings (if attached/party wall)
- Condensation management provisions
- Room ventilation openings (minimum 5% of floor area)`,

  safe_movement: `Analyse the building plan and project details for SAFE MOVEMENT & ACCESS compliance under NCC Volume Two — Housing Provisions Part H5.

Focus on:
- Stairway compliance: rise (max 190mm), going (min 240mm), width (min 600mm)
- Balustrade heights — minimum 1000mm for fall heights >1m
- Barriers and fall prevention for balconies, decks, mezzanines, and landings
- Handrail requirements for stairs and ramps
- Safe movement provisions per AS 1657 where applicable
- Landing dimensions and door swing clearances at stairs
- Fall protection for openable windows above ground floor
- Swimming pool barrier compliance (if applicable, link to H7)`,

  ancillary: `Analyse the building plan and project details for ANCILLARY PROVISIONS compliance under NCC Volume Two — Housing Provisions Part H7.

Focus on:
- Swimming pool barriers — AS 1926.1 compliance (if pool on site)
- Heating appliance clearances and installation requirements (wood heater, gas fire)
- Gas installation compliance (AS 5601) if gas appliances specified
- Alpine area requirements (if applicable — climate zone 8)
- Fencing and retaining wall requirements where relevant
- Subfloor and roof space access requirements
- Condensation management for appliances
- Garage/carport minimum dimensions and provisions`,

  livable_housing: `Analyse the building plan and project details for LIVABLE HOUSING DESIGN compliance under NCC Volume Two — Housing Provisions Part H8.

Focus on:
- Step-free entry — at least one accessible entry path
- Door widths — minimum 820mm clear opening to main rooms
- Corridor widths — minimum 1000mm for main circulation paths
- Accessible bathroom — reinforcement for future grab rails, minimum dimensions
- Toilet accessibility — clearances and future adaptability
- Hobless shower provision or capability
- Living space on entry level for future adaptability
- Light switch and power outlet heights (accessible range 600-1200mm)

Note: H8 applies to new Class 1a dwellings under NCC 2022+. Requirements may vary by state — verify local adoption date.`,
};

export function getSectionPrompt(category: NccCategory): string {
  return SECTION_PROMPTS[category];
}

/**
 * Split the compliance analysis call into (cacheable prefix, per-category query).
 *
 * The prefix — project context + plan extracts — is identical across every
 * category call within a single compliance run. Anthropic prompt caching
 * lets us pay full input cost once per run for this chunk (~50k tokens) and
 * 10% of input cost on the remaining 9+ category calls.
 *
 * The query portion varies per category (section prompt + NCC context + schema).
 */
export function buildSectionAnalysisBlocks(
  category: NccCategory,
  planContent: string,
  projectContext: string,
  nccContext: string,
  fewShotExamples?: string
): { cachedPrefix: string; query: string } {
  const cachedPrefix = `${projectContext}

RELEVANT PLAN EXTRACTS:
${planContent || "No specific plan text available for this section."}`;

  const query = `${SECTION_PROMPTS[category]}

RELEVANT NCC REFERENCE MATERIAL:
${nccContext || "No specific NCC reference material available. Use your knowledge of the NCC."}
${fewShotExamples ?? ""}

For each finding, assign a "responsible_discipline" from this list:
- "architect" — design/drawing amendments, spatial layout, window/door sizing, natural light, ventilation openings
- "structural_engineer" — footings, framing, bracing, wind loads, earthquake design
- "hydraulic_engineer" — wet area services, stormwater, plumbing, waterproofing
- "energy_consultant" — thermal performance, insulation, glazing U-values, NatHERS
- "fire_engineer" — FRL specifications, smoke hazard management, fire separation
- "building_surveyor" — classification decisions, performance solutions
- "geotechnical_engineer" — soil classification, foundation conditions
- "acoustic_engineer" — sound insulation between dwellings
- "builder" — site-specific construction items, termite barriers, weatherproofing details
- "other" — anything not clearly assigned

Also provide "remediation_action": a specific, directive task instruction that can be forwarded directly to the responsible party.
Example: "Add R2.5 wall batts to external framing per NCC H6D4 Table 13.2.5a for Climate Zone 6."
NOT: "Consider improving wall insulation."

Respond with a JSON object matching this schema:
{
  "category": "${category}",
  "findings": [
    {
      "ncc_section": "string — NCC clause number (e.g. '3.7.1.1' or 'H1P1')",
      "category": "${category}",
      "title": "string — short title for the finding",
      "description": "string — detailed description of the compliance issue or confirmation",
      "recommendation": "string — specific recommendation or next steps",
      "severity": "compliant | advisory | non_compliant | critical",
      "confidence": 0.0-1.0,
      "ncc_citation": "string — full NCC citation text",
      "page_references": [1, 2],
      "responsible_discipline": "string — one of: architect, structural_engineer, hydraulic_engineer, energy_consultant, fire_engineer, building_surveyor, geotechnical_engineer, acoustic_engineer, landscape_architect, builder, other",
      "remediation_action": "string — specific directive instruction for the responsible party"
    }
  ]
}

Return ONLY valid JSON, no other text.`;

  return { cachedPrefix, query };
}

export const SECTION_ANALYSIS_TEMPLATE = (
  category: NccCategory,
  planContent: string,
  projectContext: string,
  nccContext: string,
  fewShotExamples?: string
) => `${SECTION_PROMPTS[category]}

${projectContext}

RELEVANT PLAN EXTRACTS:
${planContent || "No specific plan text available for this section."}

RELEVANT NCC REFERENCE MATERIAL:
${nccContext || "No specific NCC reference material available. Use your knowledge of the NCC."}
${fewShotExamples ?? ""}

For each finding, assign a "responsible_discipline" from this list:
- "architect" — design/drawing amendments, spatial layout, window/door sizing, natural light, ventilation openings
- "structural_engineer" — footings, framing, bracing, wind loads, earthquake design
- "hydraulic_engineer" — wet area services, stormwater, plumbing, waterproofing
- "energy_consultant" — thermal performance, insulation, glazing U-values, NatHERS
- "fire_engineer" — FRL specifications, smoke hazard management, fire separation
- "building_surveyor" — classification decisions, performance solutions
- "geotechnical_engineer" — soil classification, foundation conditions
- "acoustic_engineer" — sound insulation between dwellings
- "builder" — site-specific construction items, termite barriers, weatherproofing details
- "other" — anything not clearly assigned

Also provide "remediation_action": a specific, directive task instruction that can be forwarded directly to the responsible party.
Example: "Add R2.5 wall batts to external framing per NCC H6D4 Table 13.2.5a for Climate Zone 6."
NOT: "Consider improving wall insulation."

Respond with a JSON object matching this schema:
{
  "category": "${category}",
  "findings": [
    {
      "ncc_section": "string — NCC clause number (e.g. '3.7.1.1' or 'H1P1')",
      "category": "${category}",
      "title": "string — short title for the finding",
      "description": "string — detailed description of the compliance issue or confirmation",
      "recommendation": "string — specific recommendation or next steps",
      "severity": "compliant | advisory | non_compliant | critical",
      "confidence": 0.0-1.0,
      "ncc_citation": "string — full NCC citation text",
      "page_references": [1, 2],
      "responsible_discipline": "string — one of: architect, structural_engineer, hydraulic_engineer, energy_consultant, fire_engineer, building_surveyor, geotechnical_engineer, acoustic_engineer, landscape_architect, builder, other",
      "remediation_action": "string — specific directive instruction for the responsible party"
    }
  ]
}

Return ONLY valid JSON, no other text.`;
