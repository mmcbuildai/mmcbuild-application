/**
 * Floor-plan page classifier.
 *
 * Architectural plan sets are typically delivered as multi-page PDFs:
 * cover → site → floor plans → elevations → sections → details. Our spatial
 * extractor needs a floor plan as input — handing it the cover sheet
 * produces nothing useful and silently disables the 3D viewer + COLLADA
 * export downstream.
 *
 * This module asks Claude Vision a cheap binary question for each page
 * ("is this a floor plan?") at low resolution, returns the first page
 * that qualifies. The caller then re-renders that page at full scale for
 * the real extraction.
 *
 * Limits classification to the first MAX_PAGES_TO_CLASSIFY pages — floor
 * plans always live near the front of an architectural set; scanning the
 * tail of a 100-page tender pack is wasted spend.
 */

import "server-only";
import { renderAllPdfPages } from "./pdf-to-image";
import { extractJson } from "@/lib/ai/extract-json";
import { detectAiProviderUnavailable } from "@/lib/ai/provider-errors";
import { callVisionModel } from "./vision-call";

const MAX_PAGES_TO_CLASSIFY = 15;
const CLASSIFIER_SCALE = 1.0;
// Model tier + Claude→OpenAI fallback now come from the "plan_page_classify"
// routing chain (claude-haiku-4.5 → gpt-4o-mini), not a hardcoded model id.

const CLASSIFIER_PROMPT = `You are looking at one page from a multi-page architectural plan set.

Decide whether this page is a FLOOR PLAN — a top-down view of a building showing rooms with walls, doors, and windows, the kind of plan from which spatial layout (rooms / walls / openings) can be extracted.

NOT floor plans (these are NO):
- Cover sheets, title sheets, sheet indexes, revision tables
- Site plans (the building seen from above as a single footprint on a lot)
- Elevations (views of the building from one side)
- Sections (a vertical slice through the building)
- Detail drawings, construction details, joinery details, schedules
- Tables, legends, notes-only pages

YES floor plans:
- "Proposed plan", "ground floor plan", "first floor plan", "floor plan"
- Top-down view with internal walls and room labels

Respond with EXACTLY one word, all uppercase: YES or NO. No other text.`;

export interface PageClassification {
  pageNumber: number;
  isFloorPlan: boolean;
}

/**
 * Classify each page of a PDF in order. Returns the 1-indexed page number
 * of the FIRST page judged to be a floor plan, or null if none of the
 * inspected pages qualify.
 *
 * Also returns the rendered images of all inspected pages (low scale) so
 * the caller can avoid a second render pass for diagnostic logging.
 */
export async function findFloorPlanPage(
  pdfBuffer: Buffer,
): Promise<{
  pageNumber: number | null;
  classifications: PageClassification[];
  totalPagesRendered: number;
}> {
  // Render up to MAX_PAGES_TO_CLASSIFY pages at low scale.
  const allPages = await renderAllPdfPages(pdfBuffer, CLASSIFIER_SCALE);
  const pages = allPages.slice(0, MAX_PAGES_TO_CLASSIFY);

  if (pages.length === 0) {
    return { pageNumber: null, classifications: [], totalPagesRendered: 0 };
  }

  const classifications: PageClassification[] = [];

  for (let i = 0; i < pages.length; i++) {
    const pageNumber = i + 1;
    try {
      // Routed through callVisionModel → Haiku first, gpt-4o-mini fallback
      // (SCRUM-290). Image classify is provider-neutral (no rasterise needed).
      const result = await callVisionModel("plan_page_classify", {
        system: CLASSIFIER_PROMPT,
        messages: [{ role: "user", content: "Floor plan? Respond YES or NO." }],
        images: [
          { data: Buffer.from(pages[i], "base64"), mimeType: "image/png" },
        ],
        maxTokens: 5,
      });
      const verdict = (result.text ?? "").trim().toUpperCase();
      const isFloorPlan = verdict.startsWith("YES");
      classifications.push({ pageNumber, isFloorPlan });
      if (isFloorPlan) {
        return {
          pageNumber,
          classifications,
          totalPagesRendered: pages.length,
        };
      }
    } catch (err) {
      // A provider outage (billing/key/rate-limit) will fail every page
      // identically — don't grind through all 15 pretending each is "not a
      // floor plan". Propagate so the caller can report the real reason.
      const outage = detectAiProviderUnavailable(err);
      if (outage) throw outage;
      console.error(
        `[page-classifier] page ${pageNumber} classify failed:`,
        err,
      );
      classifications.push({ pageNumber, isFloorPlan: false });
    }
  }

  return { pageNumber: null, classifications, totalPagesRendered: pages.length };
}

// ============================================================================
// Multi-class native-PDF classifier — used by full-house orchestrator.
// Single Sonnet call reads the whole PDF and returns per-page classifications.
// ============================================================================

export type PageType =
  | "floor_plan_ground"
  | "floor_plan_upper"
  | "elevation_n"
  | "elevation_s"
  | "elevation_e"
  | "elevation_w"
  | "elevation_other"
  | "section"
  | "roof_plan"
  | "schedule"
  | "site_plan"
  | "cover"
  | "details"
  | "other";

export interface PageTypeClassification {
  pageNumber: number;
  type: PageType;
  confidence: number;
  notes?: string;
}

const MULTICLASS_PROMPT = `You are an architectural plan classifier. You are looking at a multi-page architectural plan PDF.

Classify EVERY page using ONE of these types:

- floor_plan_ground : top-down view of ground floor with internal walls and room labels
- floor_plan_upper : top-down view of first/second floor with internal walls and room labels
- elevation_n : north elevation (view from north — labelled "North" or "N")
- elevation_s : south elevation
- elevation_e : east elevation
- elevation_w : west elevation
- elevation_other : elevation page where the cardinal direction is unclear or it shows multiple elevations
- section : vertical slice through the building (shows floor/ceiling heights, roof structure internally)
- roof_plan : top-down view of the roof showing pitch directions, ridges, hips
- schedule : schedule of finishes, materials schedule, door/window schedule, fixtures schedule
- site_plan : building footprint on the lot showing boundaries / setbacks
- cover : cover sheet, title sheet, sheet index, revision table
- details : construction details, joinery details, sections of small assemblies
- other : anything else (legends, notes-only pages, structural, services)

Look at every page in order. Use page labels (titles like "ELEVATION NORTH", "GROUND FLOOR PLAN") where available — they are authoritative. If a label is missing, infer from drawing content.

OUTPUT FORMAT — return ONLY valid JSON, an array of one entry per page:
[
  { "pageNumber": 1, "type": "cover", "confidence": 0.95, "notes": "Sheet A0.00" },
  { "pageNumber": 2, "type": "site_plan", "confidence": 0.9 },
  { "pageNumber": 3, "type": "floor_plan_ground", "confidence": 0.95, "notes": "GROUND FLOOR PLAN 1:100" },
  ...
]

Return ONLY the JSON array — no preamble, no markdown fences.`;

/**
 * Classify all pages of a PDF in one Sonnet call using native PDF support.
 *
 * Used by the full-house extractor to know which pages are floor plans,
 * elevations, sections, etc. Then per-page-type extractors run on each
 * useful page.
 *
 * @param pdfBase64 - Base64-encoded PDF (max ~32MB raw, 100 pages)
 * @returns Array of classifications, one per page. Empty array on failure.
 */
export async function classifyAllPagesNative(
  pdfBase64: string,
): Promise<PageTypeClassification[]> {
  try {
    // Routed through callVisionModel → Haiku first, gpt-4o-mini fallback
    // (SCRUM-290). On the OpenAI leg the PDF is rasterised (capped pages).
    const result = await callVisionModel("plan_page_classify", {
      system: MULTICLASS_PROMPT,
      messages: [
        {
          role: "user",
          content:
            "Classify every page of this PDF. Return ONLY the JSON array.",
        },
      ],
      pdf: { data: Buffer.from(pdfBase64, "base64") },
      maxTokens: 8000,
    });

    if (!result.text) {
      console.error("[classifyAllPagesNative] no text content");
      return [];
    }

    const parsed = extractJson<PageTypeClassification[]>(result.text);
    if (!Array.isArray(parsed)) {
      console.error("[classifyAllPagesNative] parsed result is not array");
      return [];
    }
    return parsed;
  } catch (err) {
    // Surface a provider outage (billing/key/rate-limit) as a thrown error so
    // the orchestrator can report "AI service unavailable" instead of masking
    // it as an empty classification → "no readable floor plan". Genuine
    // failures (parse, no-content) still degrade to [] as before.
    const outage = detectAiProviderUnavailable(err);
    if (outage) throw outage;
    console.error("[classifyAllPagesNative] failed:", err);
    return [];
  }
}
