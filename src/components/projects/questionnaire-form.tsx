"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { saveQuestionnaire } from "@/app/(dashboard)/projects/actions";
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
}

const BUILDING_TYPOLOGIES = [
  "Single residential",
  "Duplex",
  "Townhouse",
  "Apartment",
  "Hotel",
  "Mixed use",
  "Commercial",
];
const BUILDING_CLASSES = ["Class 1a", "Class 1b", "Class 10a", "Class 10b"];
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

const GARAGE_LOCATIONS = ["Attached", "Detached", "Integrated/under main roof", "N/A"];
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

function SelectField({
  label,
  value,
  onChange,
  options,
  autoTag,
  placeholder = "Select if known",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[] | readonly number[];
  autoTag?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {autoTag && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            Auto-derived
          </span>
        )}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  helper?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
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
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  helper?: string;
}) {
  return (
    <div>
      <label className="inline-flex w-fit cursor-pointer select-none items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-sm">{label}</span>
      </label>
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
}: QuestionnaireFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaults = (existingResponses ?? {}) as Record<string, string>;

  const autoClimate =
    !existingResponses && siteIntel?.climate_zone
      ? String(siteIntel.climate_zone)
      : null;
  const autoBal =
    !existingResponses && siteIntel?.bal_rating ? siteIntel.bal_rating : null;
  const autoWind =
    !existingResponses && siteIntel?.wind_region ? siteIntel.wind_region : null;

  const [responses, setResponses] = useState<Record<string, string>>({
    design_stage: defaults.design_stage ?? "",
    project_goals: defaults.project_goals ?? "",
    submission_timeline: defaults.submission_timeline ?? "",
    building_typology: defaults.building_typology ?? "",
    building_class: defaults.building_class ?? "",
    construction_type: defaults.construction_type ?? "",
    storeys: defaults.storeys ?? "",
    floor_area: defaults.floor_area ?? "",
    soil_classification: defaults.soil_classification ?? "",
    footing_type: defaults.footing_type ?? "",
    wind_classification: defaults.wind_classification ?? autoWind ?? "",
    terrain_category: defaults.terrain_category ?? "",
    roof_material: defaults.roof_material ?? "",
    wall_cladding: defaults.wall_cladding ?? "",
    dpc_type: defaults.dpc_type ?? "",
    sarking: defaults.sarking ?? "false",
    subfloor_ventilation: defaults.subfloor_ventilation ?? "false",
    distance_to_boundary: defaults.distance_to_boundary ?? "",
    attached_dwelling: defaults.attached_dwelling ?? "false",
    garage_location: defaults.garage_location ?? "",
    smoke_alarm_type: defaults.smoke_alarm_type ?? "",
    party_wall_frl: defaults.party_wall_frl ?? "",
    wet_area_count: defaults.wet_area_count ?? "",
    ceiling_height_habitable: defaults.ceiling_height_habitable ?? "",
    ceiling_height_non_habitable: defaults.ceiling_height_non_habitable ?? "",
    exhaust_fans: defaults.exhaust_fans ?? "false",
    natural_ventilation_method: defaults.natural_ventilation_method ?? "",
    energy_pathway: defaults.energy_pathway ?? "",
    insulation_ceiling_r: defaults.insulation_ceiling_r ?? "",
    insulation_wall_r: defaults.insulation_wall_r ?? "",
    insulation_floor_r: defaults.insulation_floor_r ?? "",
    glazing_type: defaults.glazing_type ?? "",
    hot_water_system: defaults.hot_water_system ?? "",
    has_solar_pv: defaults.has_solar_pv ?? "false",
    nathers_rating: defaults.nathers_rating ?? "",
    climate_zone: defaults.climate_zone ?? autoClimate ?? "",
    bal_rating: defaults.bal_rating ?? autoBal ?? "",
    site_conditions: defaults.site_conditions ?? "",
    has_swimming_pool: defaults.has_swimming_pool ?? "false",
    has_heating_appliance: defaults.has_heating_appliance ?? "false",
    heating_type: defaults.heating_type ?? "",
    has_stairs: defaults.has_stairs ?? "false",
    has_balcony_deck: defaults.has_balcony_deck ?? "false",
    max_fall_height: defaults.max_fall_height ?? "",
    has_step_free_entry: defaults.has_step_free_entry ?? "false",
    accessible_bathroom: defaults.accessible_bathroom ?? "false",
    min_door_width: defaults.min_door_width ?? "",
    min_corridor_width: defaults.min_corridor_width ?? "",
  });

  const update = (key: string, value: string) =>
    setResponses((prev) => ({ ...prev, [key]: value }));

  const typology = responses.building_typology;
  const showAccessibilityStep = !typology || RESIDENTIAL_TYPOLOGIES.has(typology);
  const canHavePartyWall = !typology || PARTY_WALL_TYPOLOGIES.has(typology);

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
    const result = await saveQuestionnaire(projectId, responses);
    setSaving(false);

    if (result.error) {
      setError(result.error);
    } else {
      toast.success("Project created! Head to MMC Comply to run your first assessment.");
      router.push("/dashboard");
    }
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
              />
              <SelectField
                label="Building Classification (NCC)"
                value={responses.building_class}
                onChange={(v) => update("building_class", v)}
                options={BUILDING_CLASSES}
              />
              <SelectField
                label="Construction Type"
                value={responses.construction_type}
                onChange={(v) => update("construction_type", v)}
                options={CONSTRUCTION_TYPES}
              />
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
              />
              <TextField
                label="Total Floor Area (m²)"
                type="number"
                min={1}
                value={responses.floor_area}
                onChange={(v) => update("floor_area", v)}
              />
              <SelectField
                label="Soil Classification (AS 2870)"
                value={responses.soil_classification}
                onChange={(v) => update("soil_classification", v)}
                options={SOIL_CLASSIFICATIONS}
                placeholder="To be confirmed"
              />
              <SelectField
                label="Expected Footing Type"
                value={responses.footing_type}
                onChange={(v) => update("footing_type", v)}
                options={FOOTING_TYPES}
                placeholder="Select if known — MMC product selection may change this"
              />
              <LockedAutoField
                label="Wind Classification (AS 4055)"
                value={responses.wind_classification}
                autoValue={autoWind}
                options={WIND_CLASSIFICATIONS}
                onChange={(v) => update("wind_classification", v)}
              />
              <SelectField
                label="Terrain Category"
                value={responses.terrain_category}
                onChange={(v) => update("terrain_category", v)}
                options={TERRAIN_CATEGORIES}
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
              />
              <SelectField
                label="Wall Cladding"
                value={responses.wall_cladding}
                onChange={(v) => update("wall_cladding", v)}
                options={WALL_CLADDINGS}
              />
              <SelectField
                label="Damp-Proof Course / Waterproofing Membrane"
                value={responses.dpc_type}
                onChange={(v) => update("dpc_type", v)}
                options={DPC_TYPES}
              />
              <CheckboxField
                label="Roof sarking installed (optional)"
                checked={responses.sarking === "true"}
                onChange={(v) => update("sarking", String(v))}
              />
              <CheckboxField
                label="Sub-floor ventilation (optional)"
                checked={responses.subfloor_ventilation === "true"}
                onChange={(v) => update("subfloor_ventilation", String(v))}
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
              />
              {canHavePartyWall && (
                <CheckboxField
                  label="Attached dwelling (party wall)"
                  checked={responses.attached_dwelling === "true"}
                  onChange={(v) => update("attached_dwelling", String(v))}
                />
              )}
              <SelectField
                label="Garage Location"
                value={responses.garage_location}
                onChange={(v) => update("garage_location", v)}
                options={GARAGE_LOCATIONS}
              />
              <SelectField
                label="Smoke Alarm Type"
                value={responses.smoke_alarm_type}
                onChange={(v) => update("smoke_alarm_type", v)}
                options={SMOKE_ALARM_TYPES}
              />
              {canHavePartyWall && responses.attached_dwelling === "true" && (
                <TextField
                  label="Party Wall FRL (e.g., 60/60/60)"
                  placeholder="e.g., 60/60/60"
                  value={responses.party_wall_frl}
                  onChange={(v) => update("party_wall_frl", v)}
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
              />
              <TextField
                label="Ceiling Height — Habitable Rooms (m)"
                type="number"
                min={2.1}
                max={4}
                placeholder="2.4"
                value={responses.ceiling_height_habitable}
                onChange={(v) => update("ceiling_height_habitable", v)}
              />
              <TextField
                label="Ceiling Height — Non-habitable Rooms (m)"
                type="number"
                min={2.1}
                max={4}
                placeholder="2.1"
                value={responses.ceiling_height_non_habitable}
                onChange={(v) => update("ceiling_height_non_habitable", v)}
              />
              <CheckboxField
                label="Exhaust fans to all wet areas"
                checked={responses.exhaust_fans === "true"}
                onChange={(v) => update("exhaust_fans", String(v))}
              />
              <SelectField
                label="Natural Ventilation Method"
                value={responses.natural_ventilation_method}
                onChange={(v) => update("natural_ventilation_method", v)}
                options={VENTILATION_METHODS}
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
              />
              <TextField
                label="Ceiling Insulation R-value"
                type="number"
                min={0}
                placeholder="e.g., 6.0"
                value={responses.insulation_ceiling_r}
                onChange={(v) => update("insulation_ceiling_r", v)}
              />
              <TextField
                label="Wall Insulation R-value"
                type="number"
                min={0}
                placeholder="e.g., 2.5"
                value={responses.insulation_wall_r}
                onChange={(v) => update("insulation_wall_r", v)}
              />
              <TextField
                label="Floor Insulation R-value"
                type="number"
                min={0}
                placeholder="e.g., 1.0 (0 if slab on ground)"
                value={responses.insulation_floor_r}
                onChange={(v) => update("insulation_floor_r", v)}
              />
              <SelectField
                label="Glazing Type"
                value={responses.glazing_type}
                onChange={(v) => update("glazing_type", v)}
                options={GLAZING_TYPES}
              />
              <SelectField
                label="Hot Water System"
                value={responses.hot_water_system}
                onChange={(v) => update("hot_water_system", v)}
                options={HOT_WATER_SYSTEMS}
              />
              <CheckboxField
                label="Solar PV installed"
                checked={responses.has_solar_pv === "true"}
                onChange={(v) => update("has_solar_pv", String(v))}
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
              />
              <CheckboxField
                label="Swimming pool on site"
                checked={responses.has_swimming_pool === "true"}
                onChange={(v) => update("has_swimming_pool", String(v))}
              />
              <CheckboxField
                label="Heating appliance (wood heater, gas fire, etc.)"
                checked={responses.has_heating_appliance === "true"}
                onChange={(v) => update("has_heating_appliance", String(v))}
              />
              {responses.has_heating_appliance === "true" && (
                <SelectField
                  label="Heating Type"
                  value={responses.heating_type}
                  onChange={(v) => update("heating_type", v)}
                  options={HEATING_TYPES}
                />
              )}
            </>
          )}

          {step === 8 && showAccessibilityStep && (
            <>
              <CheckboxField
                label="Has stairs"
                checked={responses.has_stairs === "true"}
                onChange={(v) => update("has_stairs", String(v))}
              />
              <CheckboxField
                label="Has balcony or deck"
                checked={responses.has_balcony_deck === "true"}
                onChange={(v) => update("has_balcony_deck", String(v))}
              />
              {responses.has_balcony_deck === "true" && (
                <TextField
                  label="Maximum Fall Height (m)"
                  type="number"
                  min={0}
                  placeholder="e.g., 1.0"
                  value={responses.max_fall_height}
                  onChange={(v) => update("max_fall_height", v)}
                />
              )}
              <CheckboxField
                label="Step-free entry provided"
                checked={responses.has_step_free_entry === "true"}
                onChange={(v) => update("has_step_free_entry", String(v))}
              />
              <CheckboxField
                label="Accessible bathroom (Livable Housing)"
                checked={responses.accessible_bathroom === "true"}
                onChange={(v) => update("accessible_bathroom", String(v))}
              />
              <TextField
                label="Minimum Door Width (mm)"
                type="number"
                min={0}
                placeholder="820"
                value={responses.min_door_width}
                onChange={(v) => update("min_door_width", v)}
              />
              <TextField
                label="Minimum Corridor Width (mm)"
                type="number"
                min={0}
                placeholder="1000"
                value={responses.min_corridor_width}
                onChange={(v) => update("min_corridor_width", v)}
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
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save & Continue
          </Button>
        )}
      </div>
    </div>
  );
}
