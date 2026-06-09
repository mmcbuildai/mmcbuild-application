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
import { PDFDocument } from "pdf-lib";
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
import {
  ANTHROPIC_PDF_MAX_BYTES,
  planTooLargeMessage,
} from "@/lib/plans/file-kind";
import type { SpatialLayout, RoofForm } from "./types";

/**
 * Cap the classifier at the first N pages of the source PDF. Floor plans,
 * elevations, sections, and schedules live near the front of any
 * architectural set; pages beyond ~15 are typically construction details
 * which the per-type extractors don't use. Without this cap the classifier
 * spends ~30-40s on a 35-page set, blowing the Vercel edge connection
 * close window.
 */
const CLASSIFIER_PAGE_CAP = 15;

/**
 * Extract a single page from a multi-page PDF and return it as its own
 * base64-encoded PDF document. Used so per-page extractors only carry
 * the page they need (typically 200-500 KB vs 9-12 MB for the full set).
 *
 * Reuses a parsed source document across all calls in a run.
 */
async function singlePagePdfBase64(
  sourceDoc: PDFDocument,
  pageNumber: number,
): Promise<string | null> {
  const totalPages = sourceDoc.getPageCount();
  if (pageNumber < 1 || pageNumber > totalPages) return null;

  // pdf-lib can throw on malformed page objects (CAD-exported PDFs sometimes
  // ship pages with non-standard resource refs). Surfaces in production as
  // the minified "Expected instance of b, but got instance of undefined"
  // assertion. Treat as a soft failure so the orchestrator can skip the page
  // and continue with whatever else is extractable.
  try {
    const out = await PDFDocument.create();
    const [copied] = await out.copyPages(sourceDoc, [pageNumber - 1]);
    out.addPage(copied);
    const bytes = await out.save();
    return Buffer.from(bytes).toString("base64");
  } catch (err) {
    console.error(
      `[singlePagePdfBase64] failed to extract page ${pageNumber}:`,
      err,
    );
    return null;
  }
}

/**
 * Build a base64-encoded PDF containing only the first `count` pages of
 * the source. Returns the original base64 if the source already has
 * <= count pages.
 */
async function firstNPagesPdfBase64(
  sourceDoc: PDFDocument,
  originalBase64: string,
  count: number,
): Promise<string> {
  const totalPages = sourceDoc.getPageCount();
  if (totalPages <= count) return originalBase64;

  // Same defensive shape as singlePagePdfBase64: if pdf-lib throws on a
  // malformed page object during copyPages, fall back to the full PDF so the
  // classifier still gets something to look at rather than bubbling the
  // minified type-check error up to the UI.
  try {
    const out = await PDFDocument.create();
    const indices = Array.from({ length: count }, (_, i) => i);
    const copiedPages = await out.copyPages(sourceDoc, indices);
    for (const p of copiedPages) out.addPage(p);
    const bytes = await out.save();
    return Buffer.from(bytes).toString("base64");
  } catch (err) {
    console.error(
      `[firstNPagesPdfBase64] failed to split first ${count} pages, falling back to full PDF:`,
      err,
    );
    return originalBase64;
  }
}

export type DecomposerDiagnostic = {
  status:
    | "skipped-not-needed"
    | "skipped-gate-off"
    | "ran-success"
    | "ran-failed";
  drawingsDetected?: number;
  attempts?: Array<{
    candidate: { type: string; confidence: number; title?: string };
    outcome:
      | { kind: "rejected"; detectedAs: string }
      | { kind: "extracted"; walls: number; rooms: number; confidence: number }
      | { kind: "error"; message: string };
  }>;
  error?: string;
};

export type FullHouseExtraction = {
  layout: SpatialLayout | null;
  classifications: PageTypeClassification[];
  floorPlanPage: number | null;
  elevationsExtracted: ElevationExtraction[];
  sectionExtracted: SectionExtraction | null;
  scheduleExtracted: ScheduleExtraction | null;
  totalPages: number | null;
  decomposer?: DecomposerDiagnostic;
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
  options?: { floorPlanPageOverride?: number },
): Promise<FullHouseExtraction> {
  const t0 = Date.now();
  // base64 inflates the raw bytes by ~4/3; recover the true file size so the
  // guard and the user-facing message both report the real MB.
  const decodedBytes = Math.floor((pdfBase64.length * 3) / 4);
  console.log(
    `[extractFullHouse] start — pdf base64 length ${pdfBase64.length} chars (~${Math.round(decodedBytes / 1024 / 1024)} MB)`,
  );

  // Size guard. A file over Anthropic's 32 MB document ceiling can't be
  // processed: it strains the worker (rasterising a render-heavy set) and the
  // browser (the base64 round-trip), and the vision calls would be rejected.
  // Fail fast with an actionable message instead of spinning for minutes and
  // crashing the tab — the failure mode the Gladesville 36 MB plan hit.
  if (decodedBytes > ANTHROPIC_PDF_MAX_BYTES) {
    console.error(
      `[extractFullHouse] rejected — ${Math.round(decodedBytes / 1024 / 1024)} MB exceeds ${ANTHROPIC_PDF_MAX_BYTES / 1024 / 1024} MB limit`,
    );
    return {
      layout: null,
      classifications: [],
      floorPlanPage: null,
      elevationsExtracted: [],
      sectionExtracted: null,
      scheduleExtracted: null,
      totalPages: null,
      error: planTooLargeMessage(decodedBytes),
    };
  }

  // 1. Parse source PDF once with pdf-lib. Used to (a) cap the classifier
  // input at the first CLASSIFIER_PAGE_CAP pages and (b) split per-page
  // PDFs for extractors after classification.
  let sourceDoc: PDFDocument;
  try {
    const pdfBytes = Buffer.from(pdfBase64, "base64");
    sourceDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  } catch (err) {
    console.error("[extractFullHouse] failed to parse source PDF:", err);
    return {
      layout: null,
      classifications: [],
      floorPlanPage: null,
      elevationsExtracted: [],
      sectionExtracted: null,
      scheduleExtracted: null,
      totalPages: null,
      error: `pdf-lib could not parse the source PDF: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const sourcePageCount = sourceDoc.getPageCount();
  console.log(`[extractFullHouse] source has ${sourcePageCount} pages`);

  // 2. Classify pages — capped at the first CLASSIFIER_PAGE_CAP.
  const classifierPdfBase64 = await firstNPagesPdfBase64(
    sourceDoc,
    pdfBase64,
    CLASSIFIER_PAGE_CAP,
  );
  const classifications = await classifyAllPagesNative(classifierPdfBase64);
  console.log(
    `[extractFullHouse] classifier returned ${classifications.length} pages at +${Date.now() - t0}ms`,
  );
  if (classifications.length === 0) {
    return {
      layout: null,
      classifications: [],
      floorPlanPage: null,
      elevationsExtracted: [],
      sectionExtracted: null,
      scheduleExtracted: null,
      totalPages: sourcePageCount,
      error: "Page classification failed",
    };
  }

  // 3. Find pages by type. Manual override wins, then preferred classes,
  // then a smart fallback so a misclassification doesn't kill the run.
  //
  // Fallback rationale: the classifier is Haiku and gets brittle calls
  // wrong (e.g. labelling an architectural floor plan as "cover" because
  // of a heavy title block, or "details" because of dimension stacks).
  // Rather than bailing with "No floor plan extracted", pick a plausible
  // candidate and let the higher-stakes Sonnet floor plan extractor have
  // a go. If that ALSO fails to extract anything useful, the orchestrator
  // returns the same error but at least we tried.
  const classifiedFloorPlanPage =
    classifications.find((c) => c.type === "floor_plan_ground")?.pageNumber ??
    classifications.find((c) => c.type === "floor_plan_upper")?.pageNumber ??
    null;

  // Pages that COULD plausibly contain extractable floor-plan geometry,
  // even if the classifier labelled them as something else. Excludes
  // cover/site_plan/schedule/other — those are unambiguously not floor
  // plans. Sorted by classifier confidence so the most confident
  // candidate goes first.
  const fallbackCandidates = classifications
    .filter(
      (c) =>
        c.type === "details" ||
        c.type === "section" ||
        c.type === "roof_plan" ||
        ELEVATION_TYPES.has(c.type) ||
        c.type === "cover", // include cover as last resort — covers can be misread floor plans
    )
    .sort((a, b) => b.confidence - a.confidence);

  // Single-page PDFs (typical for DWG → CloudConvert output): always
  // try that page as the floor plan regardless of class.
  const singlePageFallback =
    classifications.length === 1 ? classifications[0].pageNumber : null;

  const floorPlanPage =
    options?.floorPlanPageOverride ??
    classifiedFloorPlanPage ??
    singlePageFallback ??
    fallbackCandidates[0]?.pageNumber ??
    null;

  if (floorPlanPage && !classifiedFloorPlanPage && !options?.floorPlanPageOverride) {
    console.log(
      `[extractFullHouse] classifier found no floor plan — falling back to page ${floorPlanPage} as best candidate`,
    );
  }

  const elevationPages = classifications.filter((c) =>
    ELEVATION_TYPES.has(c.type),
  );
  const sectionPage =
    classifications.find((c) => c.type === "section")?.pageNumber ?? null;
  const schedulePage =
    classifications.find((c) => c.type === "schedule")?.pageNumber ?? null;

  // 4. Split out per-page PDFs for each extraction using the already
  // parsed sourceDoc.
  const splitT = Date.now();
  const [floorPlanPageBase64, sectionPageBase64, schedulePageBase64, ...elevationPageBase64s] =
    await Promise.all([
      floorPlanPage ? singlePagePdfBase64(sourceDoc, floorPlanPage) : Promise.resolve(null),
      sectionPage ? singlePagePdfBase64(sourceDoc, sectionPage) : Promise.resolve(null),
      schedulePage ? singlePagePdfBase64(sourceDoc, schedulePage) : Promise.resolve(null),
      ...elevationPages.map((p) => singlePagePdfBase64(sourceDoc, p.pageNumber)),
    ]);
  console.log(
    `[extractFullHouse] split ${1 + elevationPages.length + (sectionPage ? 1 : 0) + (schedulePage ? 1 : 0)} pages in ${Date.now() - splitT}ms`,
  );

  // 4. Fan out extractions in parallel — allSettled so a single failure
  // (Anthropic rate limit, transient network) doesn't kill the whole run.
  // Each extractor now receives a single-page PDF; we pass pageHint: 1
  // and post-mutate the response to record the original page number.
  const floorPlanPromise = floorPlanPage && floorPlanPageBase64
    ? extractFloorPlanFromPdf(floorPlanPageBase64, { pageHint: 1 }).then(
        (res) => ({
          ...res,
          // Restore the original page number (the extractor saw a single-page
          // PDF so it returned 1; we want the page from the source doc).
          detectedPage: floorPlanPage,
          totalPages: sourcePageCount,
        }),
      )
    : Promise.resolve(null);
  const elevationPromises = elevationPages.map((p, i) => {
    const slice = elevationPageBase64s[i];
    if (!slice) return Promise.resolve(null);
    return extractElevation(slice, 1).then((res) =>
      res ? { ...res, pageNumber: p.pageNumber } : res,
    );
  });
  const sectionPromise = sectionPage && sectionPageBase64
    ? extractSection(sectionPageBase64, 1).then((res) =>
        res ? { ...res, pageNumber: sectionPage } : res,
      )
    : Promise.resolve(null);
  const schedulePromise = schedulePage && schedulePageBase64
    ? extractSchedule(schedulePageBase64, 1).then((res) =>
        res ? { ...res, pageNumber: schedulePage } : res,
      )
    : Promise.resolve(null);

  const settled = await Promise.allSettled([
    floorPlanPromise,
    Promise.allSettled(elevationPromises),
    sectionPromise,
    schedulePromise,
  ]);

  const floorPlanResult =
    settled[0].status === "fulfilled" ? settled[0].value : null;
  if (settled[0].status === "rejected") {
    console.error("[extractFullHouse] floor plan rejected:", settled[0].reason);
  }

  const elevationResults: (ElevationExtraction | null)[] =
    settled[1].status === "fulfilled"
      ? settled[1].value.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          console.error(
            `[extractFullHouse] elevation page ${elevationPages[i]?.pageNumber} rejected:`,
            r.reason,
          );
          return null;
        })
      : [];

  const sectionResult =
    settled[2].status === "fulfilled" ? settled[2].value : null;
  if (settled[2].status === "rejected") {
    console.error("[extractFullHouse] section rejected:", settled[2].reason);
  }

  const scheduleResult =
    settled[3].status === "fulfilled" ? settled[3].value : null;
  if (settled[3].status === "rejected") {
    console.error("[extractFullHouse] schedule rejected:", settled[3].reason);
  }

  const elevationsValid = elevationResults.filter(
    (e): e is ElevationExtraction => e != null && e.confidence > 0,
  );

  console.log(
    `[extractFullHouse] extractions complete at +${Date.now() - t0}ms — floorPlan=${floorPlanResult?.layout ? "ok" : "fail"}, elevations=${elevationsValid.length}/${elevationPages.length}, section=${sectionResult ? "ok" : "none"}, schedule=${scheduleResult ? "ok" : "none"}`,
  );

  // Tier 2 fallback — for CAD doc-set DWGs where CloudConvert dumps multiple
  // paper-space layouts as tiles in one model-space canvas. The existing
  // classifier sees one busy page and can't match floor_plan_ground; this
  // pass uses Claude vision to find each drawing tile, then iterates
  // floor-plan candidates with a verify-then-extract prompt.
  // On by default — set ENABLE_SHEET_DECOMPOSITION=false to disable. Only runs
  // when the standard extractor failed, so it adds zero cost to plans that
  // extract cleanly; for model-space DWG dumps it's the path that recovers them.
  let floorPlanLayout = floorPlanResult?.layout ?? null;
  let sheetDecompositionUsed = false;
  let decomposer: DecomposerDiagnostic | undefined;
  // Trigger condition: no layout at all OR an empty layout (zero walls AND
  // zero rooms — the "data but no image" symptom Karen reported, where the
  // extractor returned a layout shape but couldn't actually find geometry).
  const standardExtractorFailed =
    !floorPlanResult ||
    !floorPlanResult.layout ||
    ((floorPlanResult.layout.walls?.length || 0) === 0 &&
      (floorPlanResult.layout.rooms?.length || 0) === 0);
  if (!standardExtractorFailed) {
    decomposer = { status: "skipped-not-needed" };
  } else if (process.env.ENABLE_SHEET_DECOMPOSITION?.trim() === "false") {
    decomposer = { status: "skipped-gate-off" };
  } else {
    console.log(
      `[extractFullHouse] standard extractor returned no layout — invoking sheet decomposer fallback`,
    );
    const { decomposeSheetAndExtractFloorPlan } = await import(
      "./sheet-decomposer"
    );
    const pdfBytes = Buffer.from(pdfBase64, "base64");
    const decompResult = await decomposeSheetAndExtractFloorPlan(pdfBytes);
    console.log(
      `[extractFullHouse] sheet decomposer: drawings=${decompResult.drawingsDetected}, attempts=${decompResult.attempts.length}, layout=${decompResult.layout ? "ok" : "fail"}`,
    );
    decomposer = {
      status: decompResult.layout ? "ran-success" : "ran-failed",
      drawingsDetected: decompResult.drawingsDetected,
      attempts: decompResult.attempts.map((a) => ({
        candidate: {
          type: a.candidate.type,
          confidence: a.candidate.confidence,
          title: a.candidate.title,
        },
        outcome: a.outcome,
      })),
      error: decompResult.error,
    };
    if (decompResult.layout) {
      floorPlanLayout = decompResult.layout;
      sheetDecompositionUsed = true;
    }
  }

  if (!floorPlanLayout) {
    return {
      layout: null,
      classifications,
      floorPlanPage,
      elevationsExtracted: elevationsValid,
      sectionExtracted: sectionResult,
      scheduleExtracted: scheduleResult,
      totalPages: floorPlanResult?.totalPages ?? sourcePageCount,
      decomposer,
      error: floorPlanResult?.error ?? "No floor plan extracted",
    };
  }

  // 4. Merge into one SpatialLayout — uses floorPlanLayout which may have come
  // from either the standard extractor or the sheet decomposer fallback.
  const layout: SpatialLayout = { ...floorPlanLayout };
  if (sheetDecompositionUsed && !layout.notes) {
    layout.notes = "Extracted via sheet decomposer (multi-drawing CAD sheet fallback).";
  } else if (sheetDecompositionUsed && layout.notes) {
    layout.notes = `[sheet-decomposer] ${layout.notes}`;
  }

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

  // Default roof when no elevation/roof-plan gave us a form — e.g. the sheet
  // decomposer path extracts from a floor-plan tile only, so it never sees an
  // elevation. A roofless 3D model reads as broken; a conservative gable
  // matches the DXF-direct path's default so every successful extraction
  // renders a complete house (floor plan + walls + roof).
  if (!layout.roof) {
    layout.roof = { form: "gable", pitch_deg: 22.5, eave_overhang_m: 0.5 };
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
    floorPlanLayout.confidence,
    ...elevationsValid.map((e) => e.confidence),
    sectionResult?.confidence ?? 0,
    scheduleResult?.confidence ?? 0,
  ].filter((c): c is number => typeof c === "number" && c > 0);
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
    totalPages: floorPlanResult?.totalPages ?? sourcePageCount,
    decomposer,
  };
}
