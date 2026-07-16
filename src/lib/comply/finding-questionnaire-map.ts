/**
 * Maps a compliance finding back to the project-questionnaire answer it most
 * likely depends on (SCRUM-188). Many "fails" are not plan defects — they're a
 * wrong/missing questionnaire answer (climate zone, BAL, soil class, building
 * class) that the engine then mis-applies. When a finding's category maps here,
 * the report shows an inline deep-link to the specific questionnaire step so the
 * user can correct the answer and re-run, instead of hunting through the plans.
 *
 * This is an intentionally conservative, human-framed heuristic ("may depend
 * on"), not an authoritative rule→field binding — hence a small static lookup
 * rather than a schema change.
 */

export interface QuestionnaireFieldRef {
  /** Questionnaire response key. */
  field: string;
  /** Human-readable label shown to the user. */
  label: string;
  /** Zero-based index into the questionnaire STEPS array the field lives on. */
  step: number;
}

/**
 * Questionnaire field → stepper index. Steps mirror the STEPS array in
 * `components/projects/questionnaire-form.tsx`:
 *   1 = Building Classification · 2 = Structure & Footings (H1) ·
 *   7 = Site, Climate & Bushfire.
 */
export const QUESTIONNAIRE_FIELD_STEP: Record<string, number> = {
  building_class: 1,
  building_typology: 1,
  soil_classification: 2,
  wind_classification: 2,
  climate_zone: 7,
  bal_rating: 7,
};

/** NCC finding category → the questionnaire field it most likely depends on. */
const CATEGORY_TO_FIELD: Record<string, QuestionnaireFieldRef> = {
  bushfire: {
    field: "bal_rating",
    label: "Bushfire Attack Level (BAL)",
    step: QUESTIONNAIRE_FIELD_STEP.bal_rating,
  },
  energy_efficiency: {
    field: "climate_zone",
    label: "Climate zone",
    step: QUESTIONNAIRE_FIELD_STEP.climate_zone,
  },
  structural: {
    field: "soil_classification",
    label: "Soil classification",
    step: QUESTIONNAIRE_FIELD_STEP.soil_classification,
  },
  fire_safety: {
    field: "building_class",
    label: "Building classification",
    step: QUESTIONNAIRE_FIELD_STEP.building_class,
  },
  accessibility: {
    field: "building_class",
    label: "Building classification",
    step: QUESTIONNAIRE_FIELD_STEP.building_class,
  },
};

/** Returns the questionnaire field a finding category depends on, or null. */
export function questionnaireFieldForCategory(
  category: string | null | undefined,
): QuestionnaireFieldRef | null {
  if (!category) return null;
  return CATEGORY_TO_FIELD[category] ?? null;
}

/** Resolves the questionnaire step to open for a deep-linked field. */
export function stepForQuestionnaireField(
  field: string | null | undefined,
): number {
  if (!field) return 0;
  return QUESTIONNAIRE_FIELD_STEP[field] ?? 0;
}
