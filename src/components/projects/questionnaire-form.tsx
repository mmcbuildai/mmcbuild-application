"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { saveQuestionnaire, activateProject } from "@/app/(dashboard)/projects/actions";
import { toast } from "sonner";

interface SiteIntelPrefill {
  climate_zone?: number | null;
  bal_rating?: string | null;
  wind_region?: string | null;
}

interface QuestionnaireFormProps {
  projectId: string;
  existingResponses?: Record<string, unknown> | null;
  siteIntel?: SiteIntelPrefill | null;
  /**
   * Values derived from the project's extracted design (SpatialLayout). Used to
   * pre-populate a FRESH questionnaire only; existing responses always win.
   * Pre-filled fields stay freely editable and are badged "Extracted from your
   * design" (mirrors the address-driven climate/bal/wind prefill).
   */
  designPrefill?: Record<string, string> | null;
  /**
   * Draft projects show a single "Save & Activate" on the final step (the
   * questionnaire is the last wizard tab); the separate WizardNav activate
   * button is suppressed for drafts so there is only one action (SCRUM-268).
   * Non-draft (editing an active project) just saves the responses.
   */
  isDraft?: boolean;
}

const BUILDING_TYPOLOGIES = [
  "Single residential",
  "Duplex",
  "Townhouse",
  "Apartment",
  "Co-living / Boarding house",
  "Hotel",
  "Mixed use",
  "Commercial",
];
const BUILDING_CLASSES = ["Class 1a", "Class 1b", "Class 2", "Class 3", "Class 10a", "Class 10b"];
const CONSTRUCTION_TYPES = ["Type A", "Type B", "Type C"];
const CLIMATE_ZONES = [1, 2, 3, 4, 5, 6, 7, 8];
const BAL_RATINGS = ["N/A", "BAL-LOW", "BAL-12.5", "BAL-19", "BAL-29", "BAL-40", "BAL-FZ"];

const SOIL_CLASSIFICATIONS = ["A", "S", "M", "M-D", "H1", "H2", "E", "P"];
const FOOTING_TYPES = ["Strip footing", "Pad footing", "Raft slab", "Waffle slab", "Stiffened raft", "Stumps/Piers", "Screw piles"];
const WIND_CLASSIFICATIONS = ["N1", "N2", "N3", "N4", "N5", "N6", "C1", "C2", "C3", "C4"];
const TERRAIN_CATEGORIES = ["TC1", "TC2", "TC2.5", "TC3"];

const ROOF_MATERIALS = ["Concrete tile", "Terracotta tile", "Metal (Colorbond)", "Metal (Zincalume)", "Slate", "Asphalt shingle"];
const WALL_CLADDINGS = ["Brick veneer", "Double brick", "Fibre cement", "Timber weatherboard", "Metal cladding", "Rendered foam", "Autoclaved aerated concrete"];
const DPC_TYPES = ["Polyethylene membrane", "Bituminous membrane", "Chemical DPC", "Not specified"];

const GARAGE_LOCATIONS = ["Attached", "Detached", "Integrated/under main roof", "Basement car park", "N/A"];
const SMOKE_ALARM_TYPES = ["Photoelectric (hardwired interconnected)", "Photoelectric (battery)", "Ionisation", "Combined photo/ion"];

const ENERGY_PATHWAYS = ["DTS (Deemed-to-Satisfy)", "NatHERS", "JV3 (Verification)"];
const GLAZING_TYPES = ["Single clear", "Single tinted", "Double glazed (clear)", "Double glazed (low-e)", "Triple glazed"];
const HOT_WATER_SYSTEMS = ["Electric storage", "Electric heat pump", "Gas storage", "Gas instantaneous", "Solar electric boost", "Solar gas boost"];
const VENTILATION_METHODS = ["Openable windows", "Openable windows + ceiling fans", "Mechanical ventilation", "Mixed mode"];
const HEATING_TYPES = ["Ducted gas", "Ducted reverse cycle", "Split system", "Hydronic", "Wood heater (open flue)", "Wood heater (closed flue)", "Electric panel"];

// Typologies that warrant the Access & Livable Housing step
const RESIDENTIAL_TYPOLOGIES = new Set([
  "Single residential",
  "Duplex",
  "Townhouse",
  "Apartment",
  "Mixed use",
]);
// Typologies that can have a party wall (multi-dwelling residential)
const PARTY_WALL_TYPOLOGIES = new Set([
  "Duplex",
  "Townhouse",
  "Apartment",
  "Mixed use",
]);
// Typologies where attachment to another dwelling is DEFINITIONAL (a duplex /
// townhouse is, by definition, attached) — so the "attached dwelling" answer is
// derivable rather than asked. Apartment / Mixed use can be a standalone block,
// so they stay a manual question.
const ATTACHED_TYPOLOGIES = new Set(["Duplex", "Townhouse"]);

/**
 * Apply the fields the questionnaire can derive rather than ask, so the saved
 * responses (which compliance reads) always carry the implied value. Each rule
 * is a one-way implication that is never wrong, so it only ever SETS a value —
 * it never clears a user's answer:
 *   - storeys > 1            ⇒ has_stairs (a multi-storey dwelling has stairs)
 *   - attached typology      ⇒ attached_dwelling (duplex/townhouse are attached)
 *   - a chosen heating_type  ⇒ has_heating_appliance (and none ⇒ false, since
 *                              the standalone "has appliance" checkbox is gone)
 */
function applyDerivedResponses(
  r: Record<string, string>,
): Record<string, string> {
  const out = { ...r };
  if (Number(out.storeys) > 1) out.has_stairs = "true";
  if (ATTACHED_TYPOLOGIES.has(out.building_typology)) {
    out.attached_dwelling = "true";
  }
  out.has_heating_appliance = out.heating_type ? "true" : "false";
  // Construction Type (A/B/C) is a Volume One (Class 2–9) concept — never carry
  // a stale value on a Class 1/10 building where the field is hidden.
  if (out.building_class && out.building_class.startsWith("Class 1")) {
    out.construction_type = "";
  }
  return out;
}

const DESIGN_STAGES = [
  "Concept / brief",
  "Schematic design",
  "Design development",
  "Documentation (DA-ready)",
  "Construction Certificate ready",
  "Submitted (post-DA)",
  "Submitted (post-CC)",
];

const PROJECT_GOALS = [
  "Explore MMC options early",
  "Validate compliance pathway",
  "Compare cost vs. traditional",
  "Brief the client",
  "Submission-ready evidence pack",
  "Educate myself on MMC",
];

const SUBMISSION_TIMELINES = [
  "No fixed date",
  "Within 4 weeks",
  "1–3 months",
  "3–6 months",
  "Already submitted",
];

const STEPS = [
  "Project Status",
  "Building Classification",
  "Structure & Footings (H1)",
  "Weatherproofing (H2)",
  "Fire Safety (H3)",
  "Health & Amenity (H4)",
  "Energy Efficiency (H6)",
  "Site, Climate & Bushfire",
  "Access & Livable Housing (H5/H8)",
];

/** Field provenance — drives the prefill badges. */
type FieldSource = "extracted" | "manual";

/**
 * Badge shown next to a field label indicating where its value came from.
 * - "extracted": the value was pre-filled from the uploaded design (green).
 * - "manual" (only when the field is still empty): a prompt to fill it in.
 */
function SourceBadge({ source, empty }: { source?: FieldSource; empty: boolean }) {
  if (source === "extracted") {
    return (
      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
        Extracted from your design
      </span>
    );
  }
  if (source === "manual" && empty) {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        Fill in yourself
      </span>
    );
  }
  return null;
}

function SelectField({
  label,
  value,
  onChange,
  options,
  autoTag,
  source,
  required,
  helper,
  placeholder = "Select if known",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[] | readonly number[];
  autoTag?: boolean;
  source?: FieldSource;
  required?: boolean;
  helper?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Label>
          {label}
          {required && <span className="text-red-600"> *</span>}
        </Label>
        {required && !value && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
            Required to run Comply
          </span>
        )}
        {autoTag && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            Auto-derived
          </span>
        )}
        <SourceBadge source={source} empty={!value} />
      </div>
      <select
        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {String(o)}
          </option>
        ))}
      </select>
      {helper && (
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

function LockedAutoField({
  label,
  value,
  autoValue,
  options,
  onChange,
}: {
  label: string;
  value: string;
  autoValue: string | null;
  options: readonly string[] | readonly number[];
  onChange: (v: string) => void;
}) {
  const isAutoMatch = autoValue !== null && value === autoValue;
  const [overriding, setOverriding] = useState(false);

  if (isAutoMatch && !overriding) {
    return (
      <div>
        <Label>{label}</Label>
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{value}</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              From address lookup
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOverriding(true)}
            className="shrink-0 text-xs text-primary hover:underline"
          >
            Override
          </button>
        </div>
      </div>
    );
  }

  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  helper,
  source,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  helper?: string;
  source?: FieldSource;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        <SourceBadge source={source} empty={!value} />
      </div>
      <Input
        type={type}
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {helper && (
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
  helper,
  source,
  autoTag,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  helper?: string;
  source?: FieldSource;
  autoTag?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex w-fit select-none items-center gap-2 ${
            disabled ? "cursor-default" : "cursor-pointer"
          }`}
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-sm">{label}</span>
        </label>
        {autoTag && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            Auto-derived
          </span>
        )}
        <SourceBadge source={source} empty={!checked} />
      </div>
      {helper && (
        <p className="ml-6 mt-0.5 text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

export function QuestionnaireForm({
  projectId,
  existingResponses,
  siteIntel,
  designPrefill,
  isDraft = false,
}: QuestionnaireFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaults = (existingResponses ?? {}) as Record<string, string>;

  // Design-extracted prefill applies ONLY to a fresh, never-saved questionnaire
  // (same guard as autoClimate/autoBal/autoWind). On any saved questionnaire the
  // user's own answers win and no field is badged "extracted".
  const prefill = (!existingResponses ? designPrefill : null) ?? {};
  const extractedKeys = new Set(Object.keys(prefill));

  const autoClimate =
    !existingResponses && siteIntel?.climate_zone
      ? String(siteIntel.climate_zone)
      : null;
  const autoBal =
    !existingResponses && siteIntel?.bal_rating ? siteIntel.bal_rating : null;
  const autoWind =
    !existingResponses && siteIntel?.wind_region ? siteIntel.wind_region : null;

  const [responses, setResponses] = useState<Record<string, string>>({
    // design_stage / project_goals / submission_timeline are user-intent fields,
    // not on the drawing — never design-prefilled.
    design_stage: defaults.design_stage ?? "",
    project_goals: defaults.project_goals ?? "",
    submission_timeline: defaults.submission_timeline ?? "",
    building_typology: defaults.building_typology ?? prefill.building_typology ?? "",
    building_class: defaults.building_class ?? prefill.building_class ?? "",
    construction_type: defaults.construction_type ?? prefill.construction_type ?? "",
    storeys: defaults.storeys ?? prefill.storeys ?? "",
    floor_area: defaults.floor_area ?? prefill.floor_area ?? "",
    upper_floor_area: defaults.upper_floor_area ?? prefill.upper_floor_area ?? "",
    building_height: defaults.building_height ?? prefill.building_height ?? "",
    soil_classification: defaults.soil_classification ?? prefill.soil_classification ?? "",
    footing_type: defaults.footing_type ?? prefill.footing_type ?? "",
    wind_classification: defaults.wind_classification ?? prefill.wind_classification ?? "",
    terrain_category: defaults.terrain_category ?? prefill.terrain_category ?? "",
    roof_material: defaults.roof_material ?? prefill.roof_material ?? "",
    wall_cladding: defaults.wall_cladding ?? prefill.wall_cladding ?? "",
    dpc_type: defaults.dpc_type ?? prefill.dpc_type ?? "",
    sarking: defaults.sarking ?? prefill.sarking ?? "false",
    subfloor_ventilation: defaults.subfloor_ventilation ?? prefill.subfloor_ventilation ?? "false",
    distance_to_boundary: defaults.distance_to_boundary ?? prefill.distance_to_boundary ?? "",
    attached_dwelling: defaults.attached_dwelling ?? prefill.attached_dwelling ?? "false",
    garage_location: defaults.garage_location ?? prefill.garage_location ?? "",
    smoke_alarm_type: defaults.smoke_alarm_type ?? prefill.smoke_alarm_type ?? "",
    party_wall_frl: defaults.party_wall_frl ?? prefill.party_wall_frl ?? "",
    wet_area_count: defaults.wet_area_count ?? prefill.wet_area_count ?? "",
    ceiling_height_habitable:
      defaults.ceiling_height_habitable ?? prefill.ceiling_height_habitable ?? "",
    ceiling_height_non_habitable:
      defaults.ceiling_height_non_habitable ?? prefill.ceiling_height_non_habitable ?? "",
    exhaust_fans: defaults.exhaust_fans ?? prefill.exhaust_fans ?? "false",
    natural_ventilation_method:
      defaults.natural_ventilation_method ?? prefill.natural_ventilation_method ?? "",
    energy_pathway: defaults.energy_pathway ?? prefill.energy_pathway ?? "",
    insulation_ceiling_r: defaults.insulation_ceiling_r ?? prefill.insulation_ceiling_r ?? "",
    insulation_wall_r: defaults.insulation_wall_r ?? prefill.insulation_wall_r ?? "",
    insulation_floor_r: defaults.insulation_floor_r ?? prefill.insulation_floor_r ?? "",
    glazing_type: defaults.glazing_type ?? prefill.glazing_type ?? "",
    hot_water_system: defaults.hot_water_system ?? prefill.hot_water_system ?? "",
    has_solar_pv: defaults.has_solar_pv ?? prefill.has_solar_pv ?? "false",
    nathers_rating: defaults.nathers_rating ?? prefill.nathers_rating ?? "",
    // climate_zone + bal_rating stay address-derived (site intel) — authoritative.
    climate_zone: defaults.climate_zone ?? autoClimate ?? "",
    bal_rating: defaults.bal_rating ?? autoBal ?? "",
    site_conditions: defaults.site_conditions ?? "",
    has_swimming_pool: defaults.has_swimming_pool ?? prefill.has_swimming_pool ?? "false",
    has_heating_appliance: defaults.has_heating_appliance ?? prefill.has_heating_appliance ?? "false",
    heating_type: defaults.heating_type ?? prefill.heating_type ?? "",
    has_stairs: defaults.has_stairs ?? prefill.has_stairs ?? "false",
    has_balcony_deck: defaults.has_balcony_deck ?? prefill.has_balcony_deck ?? "false",
    max_fall_height: defaults.max_fall_height ?? prefill.max_fall_height ?? "",
    has_step_free_entry: defaults.has_step_free_entry ?? prefill.has_step_free_entry ?? "false",
    accessible_bathroom: defaults.accessible_bathroom ?? prefill.accessible_bathroom ?? "false",
    min_door_width: defaults.min_door_width ?? prefill.min_door_width ?? "",
    min_corridor_width: defaults.min_corridor_width ?? prefill.min_corridor_width ?? "",
  });

  // Fields the user has actually edited — never overwritten by a late prefill.
  const touchedRef = useRef<Set<string>>(new Set());
  const update = (key: string, value: string) => {
    touchedRef.current.add(key);
    setResponses((prev) => ({ ...prev, [key]: value }));
  };

  // Apply a prefill that ARRIVES AFTER mount (the design extraction finished
  // while the form was already showing — the gate keeps polling and updates
  // designPrefill). Only fills fields the user hasn't touched and that are still
  // empty/default, so it never clobbers an answer. Belt-and-braces against the
  // race that left fields blank when extraction outran the hold-back gate.
  useEffect(() => {
    if (existingResponses) return; // saved questionnaires never auto-prefill
    const keys = Object.keys(designPrefill ?? {});
    if (keys.length === 0) return;
    setResponses((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of keys) {
        if (touchedRef.current.has(k)) continue;
        const incoming = (designPrefill as Record<string, string>)[k];
        const current = prev[k];
        const isEmptyOrDefault =
          current === undefined || current === "" || current === "false";
        if (incoming && incoming !== current && isEmptyOrDefault) {
          next[k] = incoming;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [designPrefill, existingResponses]);

  const typology = responses.building_typology;
  const showAccessibilityStep = !typology || RESIDENTIAL_TYPOLOGIES.has(typology);
  const canHavePartyWall = !typology || PARTY_WALL_TYPOLOGIES.has(typology);

  // Fields the form derives rather than asks (mirrors applyDerivedResponses,
  // which writes the same values into the saved responses on submit).
  const storeysNum = Number(responses.storeys);
  const stairsAutoDerived = Number.isFinite(storeysNum) && storeysNum > 1;
  const attachedAutoDerived = ATTACHED_TYPOLOGIES.has(typology);

  // Construction Type (A/B/C) is an NCC Volume One concept — it applies to
  // Class 2–9 only. For Class 1 (houses) / Class 10 (sheds/structures), which
  // are assessed under Volume Two, it doesn't apply, so the field is hidden.
  // Shown while the class is unknown so it's never silently dropped.
  const buildingClass = responses.building_class;
  const constructionTypeApplies =
    !buildingClass || !buildingClass.startsWith("Class 1");

  // Honesty guard on the extracted floor area: when the building is multi-storey
  // but the extraction captured no upper-floor area, the classifier likely read
  // only the ground-floor plan — so the "floor area" is the ground floor alone,
  // NOT the total. Flag it rather than silently present a half-GFA as the total.
  const floorAreaGroundOnly =
    extractedKeys.has("floor_area") &&
    Number(responses.storeys) > 1 &&
    !responses.upper_floor_area;

  // Step 8 (Access & Livable Housing) is hidden for hotel/commercial typologies.
  // We collapse the visible step list so navigation skips it cleanly.
  const visibleSteps = STEPS.map((label, i) => ({ label, originalIndex: i })).filter(
    (s) => s.originalIndex !== 8 || showAccessibilityStep,
  );
  const currentVisibleIdx = visibleSteps.findIndex((s) => s.originalIndex === step);
  const safeVisibleIdx = currentVisibleIdx === -1 ? 0 : currentVisibleIdx;
  const isLastVisible = safeVisibleIdx === visibleSteps.length - 1;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await saveQuestionnaire(projectId, applyDerivedResponses(responses));
    setSaving(false);

    if (result.error) {
      setError(result.error);
    } else {
      toast.success("Project created! Head to MMC Comply to run your first assessment.");
      router.push(`/projects/${projectId}`);
    }
  };

  const handleSaveAndActivate = async () => {
    setSaving(true);
    setError(null);
    const saveResult = await saveQuestionnaire(projectId, applyDerivedResponses(responses));
    if (saveResult.error) {
      setError(saveResult.error);
      setSaving(false);
      return;
    }
    const activateResult = await activateProject(projectId);
    setSaving(false);
    if (activateResult.error) {
      // Responses are saved; the project just isn't ready to activate yet
      // (e.g. no processed plan). Surface the blocker, keep the answers.
      toast.success("Questionnaire saved.");
      setError(activateResult.error);
      return;
    }
    toast.success("Project activated. You're all set.");
    router.push(`/projects/${projectId}`);
  };

  function goToStep(originalIndex: number) {
    setStep(originalIndex);
  }

  function handleNext() {
    if (isLastVisible) return;
    const next = visibleSteps[safeVisibleIdx + 1];
    if (next) goToStep(next.originalIndex);
  }

  function handlePrev() {
    if (safeVisibleIdx === 0) return;
    const prev = visibleSteps[safeVisibleIdx - 1];
    if (prev) goToStep(prev.originalIndex);
  }

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex gap-1 overflow-x-auto">
        {visibleSteps.map((s, i) => (
          <button
            key={s.label}
            className={`min-w-[80px] flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors ${
              i === safeVisibleIdx
                ? "bg-primary text-primary-foreground"
                : i < safeVisibleIdx
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
            onClick={() => goToStep(s.originalIndex)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div>
                <Label>What stage are your designs at?</Label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={responses.design_stage}
                  onChange={(e) => update("design_stage", e.target.value)}
                >
                  <option value="">Select stage</option>
                  {DESIGN_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  MMC analysis pays off most at concept and schematic stages —
                  before drawings lock and before council submission.
                </p>
              </div>

              <div>
                <Label>What do you want to get out of this project?</Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Select all that apply.
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {PROJECT_GOALS.map((g) => {
                    const current = (responses.project_goals ?? "")
                      .split("|")
                      .filter(Boolean);
                    const checked = current.includes(g);
                    return (
                      <label
                        key={g}
                        className="inline-flex cursor-pointer select-none items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...current, g]
                              : current.filter((x) => x !== g);
                            update("project_goals", next.join("|"));
                          }}
                        />
                        <span className="text-sm">{g}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <SelectField
                label="Submission timeline"
                value={responses.submission_timeline}
                onChange={(v) => update("submission_timeline", v)}
                options={SUBMISSION_TIMELINES}
                placeholder="When are you targeting council submission?"
                source={extractedKeys.has("submission_timeline") ? "extracted" : "manual"}
              />
            </>
          )}

          {step === 1 && (
            <>
              <SelectField
                label="Building Typology"
                value={responses.building_typology}
                onChange={(v) => update("building_typology", v)}
                options={BUILDING_TYPOLOGIES}
                placeholder="Select if known"
                source={extractedKeys.has("building_typology") ? "extracted" : "manual"}
              />
              <SelectField
                label="Building Classification (NCC)"
                value={responses.building_class}
                onChange={(v) => update("building_class", v)}
                options={BUILDING_CLASSES}
                source={extractedKeys.has("building_class") ? "extracted" : "manual"}
                required
                helper="Required — this decides which NCC volume your plan is assessed against: Class 1 or 10 (houses / structures) use Volume Two (Housing Provisions); Class 2–9 (apartments, boarding houses, commercial) use Volume One. A compliance check cannot run until this is set."
              />
              {constructionTypeApplies && (
                <SelectField
                  label="Construction Type"
                  value={responses.construction_type}
                  onChange={(v) => update("construction_type", v)}
                  options={CONSTRUCTION_TYPES}
                  source={extractedKeys.has("construction_type") ? "extracted" : "manual"}
                  helper="The NCC fire-resistance tier — Type A (most fire-resistant) → Type C (least), set by building class + rise in storeys. Only applies to Class 2–9 (NCC Volume One) buildings; it isn't used for Class 1 houses or Class 10 structures."
                />
              )}
            </>
          )}

          {step === 2 && (
            <>
              <TextField
                label="Number of Storeys"
                type="number"
                min={1}
                max={10}
                value={responses.storeys}
                onChange={(v) => update("storeys", v)}
                source={extractedKeys.has("storeys") ? "extracted" : "manual"}
              />
              <TextField
                label="Total Floor Area (m²)"
                type="number"
                min={1}
                value={responses.floor_area}
                onChange={(v) => update("floor_area", v)}
                source={extractedKeys.has("floor_area") ? "extracted" : "manual"}
                helper={
                  floorAreaGroundOnly
                    ? "⚠ This looks like the GROUND FLOOR only — the upper floor wasn't read from your plans. Update it to the total across all storeys."
                    : "Combined internal floor area across all storeys."
                }
              />
              {(Number(responses.storeys) > 1 ||
                extractedKeys.has("upper_floor_area")) && (
                <TextField
                  label="Upper-storey Floor Area (m²)"
                  type="number"
                  min={0}
                  placeholder="Combined area of floors above the ground floor"
                  value={responses.upper_floor_area}
                  onChange={(v) => update("upper_floor_area", v)}
                  source={extractedKeys.has("upper_floor_area") ? "extracted" : "manual"}
                />
              )}
              <TextField
                label="Overall Building Height — to ridge (m)"
                type="number"
                min={0}
                placeholder="e.g., 7.2"
                value={responses.building_height}
                onChange={(v) => update("building_height", v)}
                source={extractedKeys.has("building_height") ? "extracted" : "manual"}
                helper="Finished ground floor to roof ridge — drives rise-in-storeys and height-limit checks."
              />
              <SelectField
                label="Soil Classification (AS 2870)"
                value={responses.soil_classification}
                onChange={(v) => update("soil_classification", v)}
                options={SOIL_CLASSIFICATIONS}
                placeholder="To be confirmed"
                source={extractedKeys.has("soil_classification") ? "extracted" : "manual"}
              />
              <SelectField
                label="Expected Footing Type"
                value={responses.footing_type}
                onChange={(v) => update("footing_type", v)}
                options={FOOTING_TYPES}
                placeholder="Select if known — MMC product selection may change this"
                source={extractedKeys.has("footing_type") ? "extracted" : "manual"}
              />
              <SelectField
                label="Wind Classification (AS 4055)"
                value={responses.wind_classification}
                options={WIND_CLASSIFICATIONS}
                onChange={(v) => update("wind_classification", v)}
                source={
                  extractedKeys.has("wind_classification")
                    ? "extracted"
                    : "manual"
                }
                helper={
                  autoWind
                    ? `Site wind class (AS 4055) — assess from terrain, shielding and topography. It is NOT the same as the wind region. Your address's wind region (AS 1170.2) is ${autoWind} (regions A/B → N classes, C/D → cyclonic C classes).`
                    : "Site wind class (AS 4055) — assess from terrain, shielding and topography for the site."
                }
              />
              <SelectField
                label="Terrain Category"
                value={responses.terrain_category}
                onChange={(v) => update("terrain_category", v)}
                options={TERRAIN_CATEGORIES}
                source={extractedKeys.has("terrain_category") ? "extracted" : "manual"}
              />
            </>
          )}

          {step === 3 && (
            <>
              <SelectField
                label="Roof Material"
                value={responses.roof_material}
                onChange={(v) => update("roof_material", v)}
                options={ROOF_MATERIALS}
                source={extractedKeys.has("roof_material") ? "extracted" : "manual"}
              />
              <SelectField
                label="Wall Cladding"
                value={responses.wall_cladding}
                onChange={(v) => update("wall_cladding", v)}
                options={WALL_CLADDINGS}
                source={extractedKeys.has("wall_cladding") ? "extracted" : "manual"}
              />
              <SelectField
                label="Damp-Proof Course / Waterproofing Membrane"
                value={responses.dpc_type}
                onChange={(v) => update("dpc_type", v)}
                options={DPC_TYPES}
                source={extractedKeys.has("dpc_type") ? "extracted" : "manual"}
              />
              <CheckboxField
                label="Roof sarking installed (optional)"
                checked={responses.sarking === "true"}
                onChange={(v) => update("sarking", String(v))}
                source={extractedKeys.has("sarking") ? "extracted" : "manual"}
              />
              <CheckboxField
                label="Sub-floor ventilation (optional)"
                checked={responses.subfloor_ventilation === "true"}
                onChange={(v) => update("subfloor_ventilation", String(v))}
                source={extractedKeys.has("subfloor_ventilation") ? "extracted" : "manual"}
              />
            </>
          )}

          {step === 4 && (
            <>
              <TextField
                label="Distance to Boundary (m)"
                type="number"
                min={0}
                placeholder="e.g., 1.5"
                value={responses.distance_to_boundary}
                onChange={(v) => update("distance_to_boundary", v)}
                source={extractedKeys.has("distance_to_boundary") ? "extracted" : "manual"}
              />
              {canHavePartyWall && (
                <CheckboxField
                  label="Attached dwelling (party wall)"
                  checked={attachedAutoDerived || responses.attached_dwelling === "true"}
                  onChange={(v) => update("attached_dwelling", String(v))}
                  autoTag={attachedAutoDerived}
                  disabled={attachedAutoDerived}
                  helper={
                    attachedAutoDerived
                      ? `A ${typology.toLowerCase()} is attached to another dwelling by definition.`
                      : undefined
                  }
                  source={extractedKeys.has("attached_dwelling") ? "extracted" : "manual"}
                />
              )}
              <SelectField
                label="Garage Location"
                value={responses.garage_location}
                onChange={(v) => update("garage_location", v)}
                options={GARAGE_LOCATIONS}
                source={extractedKeys.has("garage_location") ? "extracted" : "manual"}
              />
              <SelectField
                label="Smoke Alarm Type"
                value={responses.smoke_alarm_type}
                onChange={(v) => update("smoke_alarm_type", v)}
                options={SMOKE_ALARM_TYPES}
                source={extractedKeys.has("smoke_alarm_type") ? "extracted" : "manual"}
              />
              {canHavePartyWall &&
                (attachedAutoDerived || responses.attached_dwelling === "true") && (
                <TextField
                  label="Party Wall FRL (e.g., 60/60/60)"
                  placeholder="e.g., 60/60/60"
                  value={responses.party_wall_frl}
                  onChange={(v) => update("party_wall_frl", v)}
                  source={extractedKeys.has("party_wall_frl") ? "extracted" : "manual"}
                />
              )}
            </>
          )}

          {step === 5 && (
            <>
              <TextField
                label="Number of Wet Areas"
                type="number"
                min={0}
                value={responses.wet_area_count}
                onChange={(v) => update("wet_area_count", v)}
                source={extractedKeys.has("wet_area_count") ? "extracted" : "manual"}
              />
              <TextField
                label="Ceiling Height — Habitable Rooms (m)"
                type="number"
                min={2.1}
                max={4}
                placeholder="2.4"
                value={responses.ceiling_height_habitable}
                onChange={(v) => update("ceiling_height_habitable", v)}
                source={extractedKeys.has("ceiling_height_habitable") ? "extracted" : "manual"}
              />
              <TextField
                label="Ceiling Height — Non-habitable Rooms (m)"
                type="number"
                min={2.1}
                max={4}
                placeholder="2.1"
                value={responses.ceiling_height_non_habitable}
                onChange={(v) => update("ceiling_height_non_habitable", v)}
                source={extractedKeys.has("ceiling_height_non_habitable") ? "extracted" : "manual"}
              />
              <CheckboxField
                label="Exhaust fans to all wet areas"
                checked={responses.exhaust_fans === "true"}
                onChange={(v) => update("exhaust_fans", String(v))}
                source={extractedKeys.has("exhaust_fans") ? "extracted" : "manual"}
              />
              <SelectField
                label="Natural Ventilation Method"
                value={responses.natural_ventilation_method}
                onChange={(v) => update("natural_ventilation_method", v)}
                options={VENTILATION_METHODS}
                source={extractedKeys.has("natural_ventilation_method") ? "extracted" : "manual"}
              />
            </>
          )}

          {step === 6 && (
            <>
              <SelectField
                label="Energy Compliance Pathway"
                value={responses.energy_pathway}
                onChange={(v) => update("energy_pathway", v)}
                options={ENERGY_PATHWAYS}
                source={extractedKeys.has("energy_pathway") ? "extracted" : "manual"}
              />
              <TextField
                label="Ceiling Insulation R-value"
                type="number"
                min={0}
                placeholder="e.g., 6.0"
                value={responses.insulation_ceiling_r}
                onChange={(v) => update("insulation_ceiling_r", v)}
                source={extractedKeys.has("insulation_ceiling_r") ? "extracted" : "manual"}
              />
              <TextField
                label="Wall Insulation R-value"
                type="number"
                min={0}
                placeholder="e.g., 2.5"
                value={responses.insulation_wall_r}
                onChange={(v) => update("insulation_wall_r", v)}
                source={extractedKeys.has("insulation_wall_r") ? "extracted" : "manual"}
              />
              <TextField
                label="Floor Insulation R-value"
                type="number"
                min={0}
                placeholder="e.g., 1.0 (0 if slab on ground)"
                value={responses.insulation_floor_r}
                onChange={(v) => update("insulation_floor_r", v)}
                source={extractedKeys.has("insulation_floor_r") ? "extracted" : "manual"}
              />
              <SelectField
                label="Glazing Type"
                value={responses.glazing_type}
                onChange={(v) => update("glazing_type", v)}
                options={GLAZING_TYPES}
                source={extractedKeys.has("glazing_type") ? "extracted" : "manual"}
              />
              <SelectField
                label="Hot Water System"
                value={responses.hot_water_system}
                onChange={(v) => update("hot_water_system", v)}
                options={HOT_WATER_SYSTEMS}
                source={extractedKeys.has("hot_water_system") ? "extracted" : "manual"}
              />
              <CheckboxField
                label="Solar PV installed"
                checked={responses.has_solar_pv === "true"}
                onChange={(v) => update("has_solar_pv", String(v))}
                source={extractedKeys.has("has_solar_pv") ? "extracted" : "manual"}
              />
              {responses.energy_pathway === "NatHERS" && (
                <TextField
                  label="NatHERS Star Rating"
                  type="number"
                  min={0}
                  max={10}
                  placeholder="e.g., 7.0"
                  value={responses.nathers_rating}
                  onChange={(v) => update("nathers_rating", v)}
                  source={extractedKeys.has("nathers_rating") ? "extracted" : "manual"}
                />
              )}
            </>
          )}

          {step === 7 && (
            <>
              <LockedAutoField
                label="Climate Zone"
                value={responses.climate_zone}
                autoValue={autoClimate}
                options={CLIMATE_ZONES}
                onChange={(v) => update("climate_zone", v)}
              />
              <LockedAutoField
                label="Bushfire Attack Level (BAL)"
                value={responses.bal_rating}
                autoValue={autoBal}
                options={BAL_RATINGS}
                onChange={(v) => update("bal_rating", v)}
              />
              <TextField
                label="Site Conditions"
                placeholder="e.g., flat site, no flood overlay, corner block"
                value={responses.site_conditions}
                onChange={(v) => update("site_conditions", v)}
                helper="Used to flag flood overlay, slope, and setback constraints during compliance and 3D layout."
                source={extractedKeys.has("site_conditions") ? "extracted" : "manual"}
              />
              <CheckboxField
                label="Swimming pool on site"
                checked={responses.has_swimming_pool === "true"}
                onChange={(v) => update("has_swimming_pool", String(v))}
                source={extractedKeys.has("has_swimming_pool") ? "extracted" : "manual"}
              />
              <SelectField
                label="Fixed Heating Appliance"
                value={responses.heating_type}
                onChange={(v) => update("heating_type", v)}
                options={HEATING_TYPES}
                placeholder="None / not specified"
                source={extractedKeys.has("heating_type") ? "extracted" : "manual"}
                helper="Pick the fixed heating appliance, if any. Leaving it as “None” records that the dwelling has no fixed heater — drives the H3 ancillary (flue/hearth) checks."
              />
            </>
          )}

          {step === 8 && showAccessibilityStep && (
            <>
              <CheckboxField
                label="Has stairs"
                checked={stairsAutoDerived || responses.has_stairs === "true"}
                onChange={(v) => update("has_stairs", String(v))}
                autoTag={stairsAutoDerived}
                disabled={stairsAutoDerived}
                helper={
                  stairsAutoDerived
                    ? "A building with more than one storey has internal stairs."
                    : undefined
                }
                source={extractedKeys.has("has_stairs") ? "extracted" : "manual"}
              />
              <CheckboxField
                label="Has balcony or deck"
                checked={responses.has_balcony_deck === "true"}
                onChange={(v) => update("has_balcony_deck", String(v))}
                source={extractedKeys.has("has_balcony_deck") ? "extracted" : "manual"}
              />
              {responses.has_balcony_deck === "true" && (
                <TextField
                  label="Maximum Fall Height (m)"
                  type="number"
                  min={0}
                  placeholder="e.g., 1.0"
                  value={responses.max_fall_height}
                  onChange={(v) => update("max_fall_height", v)}
                  source={extractedKeys.has("max_fall_height") ? "extracted" : "manual"}
                />
              )}
              <CheckboxField
                label="Step-free entry provided"
                checked={responses.has_step_free_entry === "true"}
                onChange={(v) => update("has_step_free_entry", String(v))}
                source={extractedKeys.has("has_step_free_entry") ? "extracted" : "manual"}
              />
              <CheckboxField
                label="Accessible bathroom (Livable Housing)"
                checked={responses.accessible_bathroom === "true"}
                onChange={(v) => update("accessible_bathroom", String(v))}
                source={extractedKeys.has("accessible_bathroom") ? "extracted" : "manual"}
              />
              <TextField
                label="Minimum Door Width (mm)"
                type="number"
                min={0}
                placeholder="820"
                value={responses.min_door_width}
                onChange={(v) => update("min_door_width", v)}
                source={extractedKeys.has("min_door_width") ? "extracted" : "manual"}
              />
              <TextField
                label="Minimum Corridor Width (mm)"
                type="number"
                min={0}
                placeholder="1000"
                value={responses.min_corridor_width}
                onChange={(v) => update("min_corridor_width", v)}
                source={extractedKeys.has("min_corridor_width") ? "extracted" : "manual"}
              />
            </>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={safeVisibleIdx === 0}
          onClick={handlePrev}
        >
          Previous
        </Button>

        {!isLastVisible ? (
          <Button onClick={handleNext}>Next</Button>
        ) : isDraft ? (
          <Button onClick={handleSaveAndActivate} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save & Activate
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        )}
      </div>
    </div>
  );
}
