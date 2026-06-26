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
  classifySinglePageNative,
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
  type PdfFloorPlanExtraction,
} from "./extractor";
import {
  ANTHROPIC_PDF_MAX_BYTES,
  MIN_READABLE_PLAN_BYTES,
  NO_READABLE_PLAN_MESSAGE,
  planTooLargeMessage,
} from "@/lib/plans/file-kind";
import { detectAiProviderUnavailable } from "@/lib/ai/provider-errors";
import type { SpatialLayout, RoofForm, Wall, Room, Point2D } from "./types";

/**
 * Backfill walls from room boundaries.
 *
 * The vision model reliably traces each room's `polygon` but under-populates the
 * separate `walls` array — observed layouts had e.g. 12 rooms but only 15 walls,
 * which is geometrically impossible (12 rooms need far more enclosing walls).
 * Since the COLLADA/.dae export renders WALLS, the 3D model came out as a shell
 * missing its internal partitions. Every room polygon edge IS a wall, so derive
 * the missing ones: an edge shared by two rooms is an internal partition; an
 * edge belonging to only one room is on the building perimeter (external).
 *
 * Deterministic and idempotent: deduped against edges the vision model already
 * extracted (so their richer material/type data is preserved) and against shared
 * room edges (so a party wall is emitted once). Safe to always run — a complete
 * extraction simply yields no additions.
 */
export function backfillWallsFromRooms(existing: Wall[], rooms: Room[]): Wall[] {
  if (rooms.length === 0) return existing;

  const TOL = 0.05; // metres — treat points within 5 cm as identical
  const ptKey = (p: Point2D) =>
    `${Math.round(p.x / TOL)},${Math.round(p.y / TOL)}`;
  const edgeKey = (a: Point2D, b: Point2D, storey: number) => {
    const ka = ptKey(a);
    const kb = ptKey(b);
    const [lo, hi] = ka <= kb ? [ka, kb] : [kb, ka];
    return `${storey}|${lo}|${hi}`;
  };
  const samePt = (a: Point2D, b: Point2D) =>
    Math.abs(a.x - b.x) < TOL && Math.abs(a.y - b.y) < TOL;

  // Edges already represented by an extracted wall — never duplicate them.
  const seen = new Set<string>();
  for (const w of existing) seen.add(edgeKey(w.start, w.end, w.storey ?? 0));

  // Count rooms sharing each polygon edge: shared (>=2) = internal partition,
  // unique (1) = building perimeter.
  const edges = new Map<
    string,
    { a: Point2D; b: Point2D; count: number; storey: number }
  >();
  for (const room of rooms) {
    const poly = room.polygon ?? [];
    if (poly.length < 3) continue;
    const storey = room.floor_level ?? 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (samePt(a, b)) continue;
      const key = edgeKey(a, b, storey);
      const e = edges.get(key);
      if (e) e.count++;
      else edges.set(key, { a, b, count: 1, storey });
    }
  }

  const defaultThickness =
    existing.find((w) => w.thickness > 0)?.thickness ?? 0.09;

  const derived: Wall[] = [];
  let idx = 0;
  for (const [key, e] of edges) {
    if (seen.has(key)) continue; // already an extracted wall
    derived.push({
      id: `derived_wall_${idx++}`,
      start: e.a,
      end: e.b,
      thickness: defaultThickness,
      type: e.count >= 2 ? "internal" : "external",
      storey: e.storey,
    });
  }

  return [...existing, ...derived];
}

export function boundsCentre(b: SpatialLayout["bounds"]): Point2D {
  return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
}

/**
 * Recompute the overall footprint bounds from every wall endpoint and room
 * vertex. Used after merging multiple storeys, whose individual bounds no
 * longer describe the union once upper floors have been translated.
 */
export function recomputeBounds(
  walls: Wall[],
  rooms: Room[],
): SpatialLayout["bounds"] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const acc = (p: Point2D) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const w of walls) {
    acc(w.start);
    acc(w.end);
  }
  for (const r of rooms) for (const p of r.polygon ?? []) acc(p);
  if (!Number.isFinite(minX)) {
    return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 }, width: 0, depth: 0 };
  }
  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    width: maxX - minX,
    depth: maxY - minY,
  };
}

/**
 * Stamp an independently-extracted floor onto a storey index and align it to
 * the ground floor.
 *
 * Each floor-plan PAGE is extracted in isolation (extractFloorPlanFromPdf),
 * so it comes back with its own (0,0) bottom-left origin AND `floor_level: 0`
 * regardless of which storey it really is. Merging those as-is would render
 * every floor at storey 0, stacked on the same spot. This:
 *   - re-tags every `wall.storey` + `room.floor_level` to `storey`
 *   - namespaces ids (`s{storey}_`) so upper-floor walls/rooms/openings never
 *     collide with the ground floor's ids (the backfill + wall_id links rely
 *     on unique ids)
 *   - translates the floor so its footprint centre matches the ground floor's
 *     centre. Absolute coordinates aren't preserved across pages, so exact
 *     registration is impossible; centre-alignment is the most forgiving
 *     default for the common set-back upper storey.
 */
export function prepareStorey(
  floor: SpatialLayout,
  storey: number,
  groundCentre: Point2D | null,
): SpatialLayout {
  let shift = (p: Point2D): Point2D => p;
  if (groundCentre) {
    const c = boundsCentre(floor.bounds);
    const dx = groundCentre.x - c.x;
    const dy = groundCentre.y - c.y;
    if (dx !== 0 || dy !== 0) shift = (p) => ({ x: p.x + dx, y: p.y + dy });
  }
  const tag = `s${storey}_`;
  return {
    ...floor,
    walls: (floor.walls ?? []).map((w) => ({
      ...w,
      id: tag + w.id,
      start: shift(w.start),
      end: shift(w.end),
      storey,
    })),
    rooms: (floor.rooms ?? []).map((r) => ({
      ...r,
      id: tag + r.id,
      polygon: (r.polygon ?? []).map(shift),
      floor_level: storey,
    })),
    openings: (floor.openings ?? []).map((o) => ({
      ...o,
      id: tag + o.id,
      position: shift(o.position),
      wall_id: o.wall_id ? tag + o.wall_id : o.wall_id,
    })),
  };
}

/**
 * Per-page classification scans the first N pages (one cheap call per page, run
 * in parallel). The old 15-page cap existed because the SINGLE whole-set call
 * grew slow/large past ~15 pages and blew the Vercel edge window — but this
 * extraction runs in Inngest (300s budget) and per-page calls are cheap +
 * parallel, so we can afford to look deeper. 30 covers the floor plans /
 * elevations / sections / schedules in any normal set's front matter.
 */
const CLASSIFIER_PAGE_CAP = 30;

/**
 * Deep cap for the SECOND pass: only used when the first pass found no floor
 * plan at all (e.g. a 70-page DA set whose plans sit past page 30). Bounds how
 * far we'll keep scanning so a pathological set can't run away.
 */
const CLASSIFIER_DEEP_CAP = 60;

/** Max concurrent per-page classify calls (rate-limit friendly). */
const CLASSIFY_CONCURRENCY = 8;

/**
 * Classify a contiguous range of pages [from, to], one focused call per page,
 * in concurrency-bounded batches. Re-throws a provider outage (so the caller
 * surfaces the real cause); a single page's non-outage failure degrades to
 * `other` without sinking the batch.
 */
async function classifyPagesRange(
  sourceDoc: PDFDocument,
  from: number,
  to: number,
): Promise<PageTypeClassification[]> {
  const pages: number[] = [];
  for (let p = from; p <= to; p++) pages.push(p);

  const out: PageTypeClassification[] = [];
  for (let i = 0; i < pages.length; i += CLASSIFY_CONCURRENCY) {
    const batch = pages.slice(i, i + CLASSIFY_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (pageNumber) => {
        const b64 = await singlePagePdfBase64(sourceDoc, pageNumber);
        if (!b64) {
          return { pageNumber, type: "other", confidence: 0 } as PageTypeClassification;
        }
        return classifySinglePageNative(b64, pageNumber);
      }),
    );
    out.push(...results);
  }
  return out;
}

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

  // Empty-input guard. Fail fast before page classification (the first AI call)
  // when no usable plan reached us — an empty upload, a failed conversion, or a
  // page-split that produced a near-zero-byte document. Sending the classifier a
  // blank PDF makes the model ask for the plan, which then surfaces downstream
  // as a misleading "no readable floor plan". This is the lower bound of the
  // same size scale as the 32 MB ceiling below.
  if (decodedBytes < MIN_READABLE_PLAN_BYTES) {
    console.error(
      `[extractFullHouse] rejected — ${decodedBytes} bytes is below the ${MIN_READABLE_PLAN_BYTES}-byte readable minimum`,
    );
    return {
      layout: null,
      classifications: [],
      floorPlanPage: null,
      elevationsExtracted: [],
      sectionExtracted: null,
      scheduleExtracted: null,
      totalPages: null,
      error: NO_READABLE_PLAN_MESSAGE,
    };
  }

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

  // 2. Classify pages — ONE focused call per page (parallel, title-block first),
  // which reliably distinguishes ground vs upper floor plans (the whole-set call
  // mislabelled upper floors as "other", halving the GFA). First pass over the
  // front matter; if it finds NO floor plan and the set is larger, a second
  // deeper pass — big DA sets put their plans past the front cap.
  let classifications: PageTypeClassification[];
  try {
    const firstTo = Math.min(sourcePageCount, CLASSIFIER_PAGE_CAP);
    classifications = await classifyPagesRange(sourceDoc, 1, firstTo);
    const hasFloorPlan = classifications.some(
      (c) => c.type === "floor_plan_ground" || c.type === "floor_plan_upper",
    );
    if (!hasFloorPlan && sourcePageCount > firstTo) {
      const deepTo = Math.min(sourcePageCount, CLASSIFIER_DEEP_CAP);
      console.log(
        `[extractFullHouse] no floor plan in first ${firstTo} pages — scanning ${firstTo + 1}-${deepTo}`,
      );
      const more = await classifyPagesRange(sourceDoc, firstTo + 1, deepTo);
      classifications = [...classifications, ...more];
    }
  } catch (err) {
    // A provider outage (billing exhausted / revoked key / rate limit) surfaces
    // here (the first AI calls in the chain). Report it honestly rather than
    // letting it masquerade as "no readable floor plan".
    const outage = detectAiProviderUnavailable(err);
    if (!outage) throw err;
    console.error(
      `[extractFullHouse] AI provider unavailable during classification: ${outage.message}`,
    );
    return {
      layout: null,
      classifications: [],
      floorPlanPage: null,
      elevationsExtracted: [],
      sectionExtracted: null,
      scheduleExtracted: null,
      totalPages: sourcePageCount,
      error: outage.userMessage,
    };
  }
  console.log(
    `[extractFullHouse] classified ${classifications.length} pages at +${Date.now() - t0}ms`,
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
  const groundFloorPage =
    classifications.find((c) => c.type === "floor_plan_ground")?.pageNumber ??
    null;
  // Every upper-storey floor plan, in page order (the classifier can't tell
  // first from second — both are "floor_plan_upper" — but architectural sets
  // run ground → first → second, so page order is the storey order).
  const upperFloorPages = classifications
    .filter((c) => c.type === "floor_plan_upper")
    .map((c) => c.pageNumber)
    .sort((a, b) => a - b);
  const classifiedFloorPlanPage = groundFloorPage ?? upperFloorPages[0] ?? null;

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
        c.type === "cover" || // covers can be misread floor plans
        c.type === "other", // last resort — a floor plan the classifier dropped here
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

  // Build the ordered list of floor-plan pages to extract, each tagged with
  // its storey index. A manual override forces a single ground-floor extraction
  // (the test-3d page picker). Otherwise storey 0 = ground (or the best single
  // fallback when the classifier found none) and each upper floor stacks above.
  type FloorPage = { pageNumber: number; storey: number };
  let floorPages: FloorPage[];
  if (options?.floorPlanPageOverride) {
    floorPages = [{ pageNumber: options.floorPlanPageOverride, storey: 0 }];
  } else {
    const ordered: number[] = [];
    if (groundFloorPage) ordered.push(groundFloorPage);
    for (const up of upperFloorPages) if (!ordered.includes(up)) ordered.push(up);
    if (ordered.length === 0 && floorPlanPage) ordered.push(floorPlanPage);
    floorPages = ordered.map((pageNumber, i) => ({ pageNumber, storey: i }));
  }
  console.log(
    `[extractFullHouse] floor pages: ${floorPages
      .map((f) => `p${f.pageNumber}→storey${f.storey}`)
      .join(", ") || "none"}`,
  );

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
  const floorPageBase64s = await Promise.all(
    floorPages.map((f) => singlePagePdfBase64(sourceDoc, f.pageNumber)),
  );
  const [sectionPageBase64, schedulePageBase64, ...elevationPageBase64s] =
    await Promise.all([
      sectionPage ? singlePagePdfBase64(sourceDoc, sectionPage) : Promise.resolve(null),
      schedulePage ? singlePagePdfBase64(sourceDoc, schedulePage) : Promise.resolve(null),
      ...elevationPages.map((p) => singlePagePdfBase64(sourceDoc, p.pageNumber)),
    ]);
  console.log(
    `[extractFullHouse] split ${floorPages.length + elevationPages.length + (sectionPage ? 1 : 0) + (schedulePage ? 1 : 0)} pages in ${Date.now() - splitT}ms`,
  );

  // 4. Fan out extractions in parallel — allSettled so a single failure
  // (Anthropic rate limit, transient network) doesn't kill the whole run.
  // Each extractor now receives a single-page PDF; we pass pageHint: 1
  // and post-mutate the response to record the original page number.
  // One extraction per floor page, in parallel. Each sees a single-page PDF
  // (so returns detectedPage 1); we restore the true source page + tag the
  // storey for the merge step.
  const floorPlanPromises = floorPages.map((fp, i) => {
    const slice = floorPageBase64s[i];
    if (!slice) return Promise.resolve(null);
    return extractFloorPlanFromPdf(slice, { pageHint: 1 }).then((res) => ({
      ...res,
      storey: fp.storey,
      detectedPage: fp.pageNumber,
      totalPages: sourcePageCount,
    }));
  });
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
    Promise.allSettled(floorPlanPromises),
    Promise.allSettled(elevationPromises),
    sectionPromise,
    schedulePromise,
  ]);

  // Floor results, in storey order. Each settled entry is itself a settled
  // result (allSettled-in-allSettled) so one floor failing never kills the run.
  type FloorResult = PdfFloorPlanExtraction & {
    storey: number;
    detectedPage: number;
    totalPages: number | null;
  };
  const floorResults: (FloorResult | null)[] =
    settled[0].status === "fulfilled"
      ? settled[0].value.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          console.error(
            `[extractFullHouse] floor page ${floorPages[i]?.pageNumber} (storey ${floorPages[i]?.storey}) rejected:`,
            r.reason,
          );
          return null;
        })
      : [];

  // The ground floor (storey 0) is the primary result — all downstream logic
  // (decomposer trigger, confidence, totalPages, error) keys off it, exactly
  // as the single-floor pipeline did. Upper floors are additive.
  const floorPlanResult = floorResults.find((r) => r?.storey === 0) ?? floorResults[0] ?? null;
  const upperFloorResults = floorResults.filter(
    (r): r is FloorResult => !!r && r.storey > 0 && !!r.layout,
  );

  // Provider-outage honesty: extractFloorPlanFromPdf catches its own errors and
  // returns them as `error` strings rather than throwing, so check the primary
  // floor's error for an outage signature before falling through to the
  // decomposer (which would mask "AI service down" as "no readable floor plan").
  if (floorPlanResult?.error) {
    const outage = detectAiProviderUnavailable(new Error(floorPlanResult.error));
    if (outage) {
      console.error(
        `[extractFullHouse] AI provider unavailable during floor-plan extraction: ${outage.message}`,
      );
      return {
        layout: null,
        classifications,
        floorPlanPage,
        elevationsExtracted: [],
        sectionExtracted: null,
        scheduleExtracted: null,
        totalPages: sourcePageCount,
        error: outage.userMessage,
      };
    }
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
  // This is storey 0 (ground); its walls/rooms keep their implicit storey 0.
  const layout: SpatialLayout = { ...floorPlanLayout };
  if (sheetDecompositionUsed && !layout.notes) {
    layout.notes = "Extracted via sheet decomposer (multi-drawing CAD sheet fallback).";
  } else if (sheetDecompositionUsed && layout.notes) {
    layout.notes = `[sheet-decomposer] ${layout.notes}`;
  }

  // Merge upper storeys onto the ground floor. Each upper floor was extracted in
  // isolation (its own (0,0) origin + floor_level 0), so prepareStorey re-tags
  // each to its real storey and centre-aligns it over the ground footprint.
  // Skipped when the sheet decomposer recovered the ground floor — that path
  // reads a single CAD model-space tile, so there are no separate upper pages.
  const mergedUpperStoreys: number[] = [];
  if (upperFloorResults.length > 0 && !sheetDecompositionUsed) {
    const groundCentre = boundsCentre(layout.bounds);
    for (const up of upperFloorResults) {
      if (!up.layout) continue;
      const prepared = prepareStorey(up.layout, up.storey, groundCentre);
      layout.walls = [...(layout.walls ?? []), ...prepared.walls];
      layout.rooms = [...(layout.rooms ?? []), ...prepared.rooms];
      layout.openings = [...(layout.openings ?? []), ...prepared.openings];
      mergedUpperStoreys.push(up.storey);
    }
    if (mergedUpperStoreys.length > 0) {
      layout.bounds = recomputeBounds(layout.walls ?? [], layout.rooms ?? []);
    }
  }
  // Storey count = floors we actually have geometry for. Overriding the model's
  // per-page `storeys` guess is deliberate: it keeps the roof on the top
  // EXTRACTED floor instead of floating above a storey we never read.
  layout.storeys = 1 + mergedUpperStoreys.length;
  if (mergedUpperStoreys.length > 0) {
    console.log(
      `[extractFullHouse] merged upper storey(s) ${mergedUpperStoreys.join(", ")} → ${layout.storeys} storeys total`,
    );
  }

  // Backfill internal partitions from room boundaries so the 3D/.dae model
  // shows the full layout, not just the walls the vision model happened to
  // trace (it under-populates `walls` while reliably tracing room polygons).
  const wallsBefore = layout.walls?.length ?? 0;
  layout.walls = backfillWallsFromRooms(layout.walls ?? [], layout.rooms ?? []);
  if (layout.walls.length > wallsBefore) {
    console.log(
      `[extractFullHouse] backfilled ${layout.walls.length - wallsBefore} walls ` +
        `from ${layout.rooms?.length ?? 0} room boundaries (${wallsBefore} -> ${layout.walls.length})`,
    );
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

  // Flat-roof sanity guard. A truly flat roof is rare in AU residential and is
  // the most common roof mis-read (observed: a clearly pitched house extracted
  // as "flat"). If the section drawing shows a ridge above the top plate, the
  // roof is pitched by definition — override the flat reading to a conservative
  // gable rather than render a flat box. (No section = nothing to contradict it,
  // so a flat reading is left alone.)
  if (layout.roof.form === "flat") {
    const ridge = sectionResult?.ridge_height_above_top_plate_m;
    if (typeof ridge === "number" && ridge > 0.3) {
      layout.roof = {
        ...layout.roof,
        form: "gable",
        pitch_deg:
          layout.roof.pitch_deg && layout.roof.pitch_deg > 5
            ? layout.roof.pitch_deg
            : 22.5,
      };
      layout.notes = `${layout.notes ? `${layout.notes} ` : ""}[roof: "flat" reading overridden to gable — section shows a ${ridge.toFixed(1)}m ridge].`;
    }
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

  // Total-extraction-failure guard. After the floor-plan extractor, the sheet-
  // decomposer fallback AND the room-boundary backfill, a layout with zero walls
  // AND zero rooms means nothing was actually read. Don't ship an empty box that
  // looks like a (broken) success — surface a clear extraction error so the
  // caller shows "couldn't read this plan" instead of an empty 3D model.
  if ((layout.walls?.length ?? 0) === 0 && (layout.rooms?.length ?? 0) === 0) {
    console.error(
      "[extractFullHouse] no walls and no rooms after all fallbacks — failing the extraction",
    );
    return {
      layout: null,
      classifications,
      floorPlanPage,
      elevationsExtracted: elevationsValid,
      sectionExtracted: sectionResult,
      scheduleExtracted: scheduleResult,
      totalPages: floorPlanResult?.totalPages ?? sourcePageCount,
      decomposer,
      error:
        "The plan couldn't be read — no walls or rooms were detected. Please re-upload a clearer floor plan.",
    };
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
