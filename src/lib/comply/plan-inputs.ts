import type { DesignAttributes } from "@/lib/comply/questionnaire-prefill";

/**
 * A "what we read from your plans" checklist item (SCRUM-187). Derived entirely
 * from the design attributes the on-upload extraction already produces — no new
 * AI step — so we can honestly tell the user which inputs Build/Quote depend on
 * were detected, and which were not, BEFORE they're surprised by thin output.
 */
export interface PlanInput {
  label: string;
  present: boolean;
  /** What downstream analysis is limited when this input is missing. */
  limitedNote: string;
}

function has(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}

export function derivePlanInputs(attrs: DesignAttributes | null): PlanInput[] {
  const a = attrs ?? {};
  return [
    {
      label: "Floor plans (rooms & areas)",
      present: has(a.floor_area_m2) || has(a.storeys),
      limitedNote:
        "Build's 3D model and Quote's area take-offs rely on the floor plans.",
    },
    {
      label: "Elevations (building height)",
      present: has(a.building_height_m),
      limitedNote:
        "Without elevations, building-height and storey-based checks are limited.",
    },
    {
      label: "Schedule of finishes / materials",
      present:
        has(a.roof_material) || has(a.wall_cladding) || has(a.glazing_type),
      limitedNote:
        "Material and weatherproofing checks and Quote line items may be incomplete.",
    },
    {
      label: "Energy details (insulation / NatHERS)",
      present:
        has(a.nathers_rating) ||
        has(a.insulation_ceiling_r) ||
        has(a.energy_pathway),
      limitedNote:
        "Energy-efficiency (H6 / BASIX) findings may be limited.",
    },
  ];
}
