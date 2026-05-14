/**
 * Full-house extractor — orchestrates v2-v4 extraction across all
 * page types in an architectural plan set.
 *
 * Pipeline:
 *   1. classifyAllPagesNative — single Sonnet call labels every page
 *   2. Fan out per-page-type extractors in parallel:
 *        - floor plan (existing extractFloorPlanFromPdf)
 *        - elevations (roof form / pitch / cladding)
 *        - section (storey heights)
 *        - schedule (default materials)
 *   3. Merge results into one SpatialLayout
 */

import "server-only";
import {
  classifyAllPagesNative,
  type PageTypeClassification,
} from "./page-classifier";
import {
  extractFloorPlanFromPdf,
  extractElevation,
  extractSection,
  extractSchedule,
  type ElevationExtraction,
  type SectionExtraction,
  type ScheduleExtraction,
} from "./extractor";
import type { SpatialLayout, RoofForm } from "./types";

export type FullHouseExtraction = {
  layout: SpatialLayout | null;
  classifications: PageTypeClassification[];
  floorPlanPage: number | null;
  elevationsExtracted: ElevationExtraction[];
  sectionExtracted: SectionExtraction | null;
  scheduleExtracted: ScheduleExtraction | null;
  totalPages: number | null;
  error?: string;
};

const ELEVATION_TYPES = new Set([
  "elevation_n",
  "elevation_s",
  "elevation_e",
  "elevation_w",
  "elevation_other",
]);

export async function extractFullHouse(
  pdfBase64: string,
): Promise<FullHouseExtraction> {
  // 1. Classify all pages
  const classifications = await classifyAllPagesNative(pdfBase64);
  if (classifications.length === 0) {
    return {
      layout: null,
      classifications: [],
      floorPlanPage: null,
      elevationsExtracted: [],
      sectionExtracted: null,
      scheduleExtracted: null,
      totalPages: null,
      error: "Page classification failed",
    };
  }

  // 2. Find pages by type
  const floorPlanPage =
    classifications.find((c) => c.type === "floor_plan_ground")?.pageNumber ??
    classifications.find((c) => c.type === "floor_plan_upper")?.pageNumber ??
    null;

  const elevationPages = classifications.filter((c) =>
    ELEVATION_TYPES.has(c.type),
  );
  const sectionPage =
    classifications.find((c) => c.type === "section")?.pageNumber ?? null;
  const schedulePage =
    classifications.find((c) => c.type === "schedule")?.pageNumber ?? null;

  // 3. Fan out extractions in parallel
  const floorPlanPromise = floorPlanPage
    ? extractFloorPlanFromPdf(pdfBase64, { pageHint: floorPlanPage })
    : Promise.resolve(null);
  const elevationPromises = elevationPages.map((p) =>
    extractElevation(pdfBase64, p.pageNumber),
  );
  const sectionPromise = sectionPage
    ? extractSection(pdfBase64, sectionPage)
    : Promise.resolve(null);
  const schedulePromise = schedulePage
    ? extractSchedule(pdfBase64, schedulePage)
    : Promise.resolve(null);

  const [floorPlanResult, elevationResults, sectionResult, scheduleResult] =
    await Promise.all([
      floorPlanPromise,
      Promise.all(elevationPromises),
      sectionPromise,
      schedulePromise,
    ]);

  const elevationsValid = elevationResults.filter(
    (e): e is ElevationExtraction => e != null && e.confidence > 0,
  );

  if (!floorPlanResult || !floorPlanResult.layout) {
    return {
      layout: null,
      classifications,
      floorPlanPage,
      elevationsExtracted: elevationsValid,
      sectionExtracted: sectionResult,
      scheduleExtracted: scheduleResult,
      totalPages: floorPlanResult?.totalPages ?? classifications.length,
      error: floorPlanResult?.error ?? "No floor plan extracted",
    };
  }

  // 4. Merge into one SpatialLayout
  const layout: SpatialLayout = { ...floorPlanResult.layout };

  // Roof — pick highest-confidence elevation that has roof.form
  const elevationsWithRoof = elevationsValid.filter((e) => e.roof?.form);
  if (elevationsWithRoof.length > 0) {
    const best = [...elevationsWithRoof].sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    layout.roof = {
      form: (best.roof?.form ?? "gable") as RoofForm,
      pitch_deg: best.roof?.pitch_deg ?? 22.5,
      eave_overhang_m: best.roof?.eave_overhang_m ?? 0.5,
      ridge_height_m: best.roof?.ridge_height_m,
      material: best.roof?.material,
      colour: best.roof?.colour,
    };
  }

  // Wall height — average across elevations that reported one
  const heights = elevationsValid
    .map((e) => e.external_wall_height_m)
    .filter((h): h is number => typeof h === "number" && h > 0);
  if (heights.length > 0) {
    layout.wall_height = heights.reduce((s, h) => s + h, 0) / heights.length;
  }

  // Materials — schedule wins; fall back to dominant cladding across elevations
  if (scheduleResult?.materials) {
    layout.materials = scheduleResult.materials;
  } else if (elevationsValid.length > 0) {
    const claddingCounts = new Map<string, number>();
    for (const e of elevationsValid) {
      if (e.cladding) {
        claddingCounts.set(e.cladding, (claddingCounts.get(e.cladding) ?? 0) + 1);
      }
    }
    const dominant = [...claddingCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    layout.materials = {
      wall_default: dominant?.[0],
      wall_colour: elevationsValid.find((e) => e.cladding_colour)
        ?.cladding_colour,
      roof_material: layout.roof?.material,
      roof_colour: layout.roof?.colour,
      window_frame: elevationsValid.find((e) => e.window_frame)?.window_frame,
    };
  }

  // Storey details — from section if available; override wall_height with
  // ground floor measurement (more accurate than elevation estimate)
  if (sectionResult && sectionResult.storeys.length > 0) {
    layout.storey_details = sectionResult.storeys;
    const ground = sectionResult.storeys.find((s) => s.level === 0);
    if (ground?.floor_to_ceiling_m) {
      layout.wall_height = ground.floor_to_ceiling_m;
    }
  }

  // Average confidence across all extractions
  const confidences = [
    floorPlanResult.layout.confidence,
    ...elevationsValid.map((e) => e.confidence),
    sectionResult?.confidence ?? 0,
    scheduleResult?.confidence ?? 0,
  ].filter((c) => c > 0);
  if (confidences.length > 0) {
    layout.confidence =
      confidences.reduce((s, c) => s + c, 0) / confidences.length;
  }

  return {
    layout,
    classifications,
    floorPlanPage,
    elevationsExtracted: elevationsValid,
    sectionExtracted: sectionResult,
    scheduleExtracted: scheduleResult,
    totalPages: floorPlanResult.totalPages ?? classifications.length,
  };
}
