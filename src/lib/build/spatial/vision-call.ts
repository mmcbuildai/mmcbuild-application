/**
 * Vision-call helper for the 3D plan extractor (SCRUM-290).
 *
 * Routes every extractor AI call through the model router (`callModel`) so it
 * inherits the router's fallback chain — Claude first, GPT-4o when Claude is
 * unavailable (outage / retired-model 404 / 429 / credit). Before this, the
 * extractor called the Anthropic SDK directly with NO fallback, so any Claude
 * outage killed 3D extraction outright (the 2026-06-10/11 incident class).
 *
 * The router/provider layer is deliberately generic and has no dependency on
 * the plans/CloudConvert module. GPT-4o can't read PDFs, so the OpenAI leg needs
 * pages rasterised to images — we inject that rasteriser HERE (the build layer
 * already depends on CloudConvert), keeping the AI layer decoupled (the D3
 * decision). Page scope follows D2: a hinted page, else the first N pages.
 *
 * The Anthropic (primary) leg is unchanged in behaviour — same model, native
 * PDF document block, extended thinking — so this is purely additive: GPT-4o
 * only ever runs when Claude fails.
 */

import { callModel } from "@/lib/ai/models/router";
import type { AIFunction } from "@/lib/ai/models/registry";
import type { ModelCallOptions, ModelCallResult } from "@/lib/ai/models/call";
import { rasterizePdfPages } from "@/lib/plans/dwg-converter";

/** Max PDF pages rasterised for the OpenAI fallback when no page hint is given. */
export const MAX_FALLBACK_RASTER_PAGES = 12;

export type VisionCallOptions = Omit<ModelCallOptions, "rasterizePdf"> & {
  orgId?: string;
  checkId?: string;
  /** 1-indexed page to rasterise for the OpenAI fallback; else first N pages. */
  pdfPageHint?: number;
};

/**
 * Call a vision-capable model function (e.g. "plan_vision",
 * "plan_page_classify") with automatic Claude→GPT-4o fallback. Returns the raw
 * ModelCallResult; callers parse `.text` with extractJson as before.
 */
export async function callVisionModel(
  fn: AIFunction,
  options: VisionCallOptions,
): Promise<ModelCallResult> {
  const { pdfPageHint, ...rest } = options;

  return callModel(fn, {
    ...rest,
    // Deterministic by default — plan extraction / classification should give
    // the same answer for the same drawing run-to-run (the flaky storey-count /
    // intermittent-null behaviour was partly vision sampling variance). Callers
    // can override. On the one call that uses extended thinking (bbox detect),
    // the Anthropic provider ignores this (temp must be 1 with thinking).
    temperature: rest.temperature ?? 0,
    // Only the OpenAI leg uses this; the Anthropic leg reads the PDF natively
    // and ignores it. Undefined when there's no PDF so non-PDF calls are
    // unaffected.
    rasterizePdf: options.pdf
      ? async (pdf) => {
          const r = await rasterizePdfPages(pdf, {
            maxPages: MAX_FALLBACK_RASTER_PAGES,
            pageHint: pdfPageHint,
          });
          if ("error" in r) {
            throw new Error(
              `PDF rasterise for the GPT-4o vision fallback failed: ${r.error}`,
            );
          }
          // No silent cap — warn when an auto-detect set is truncated so a
          // deep floor-plan page that got dropped is visible in the logs.
          if (!pdfPageHint && r.buffers.length >= MAX_FALLBACK_RASTER_PAGES) {
            console.warn(
              `[callVisionModel] rasterised the first ${MAX_FALLBACK_RASTER_PAGES} pages for the GPT-4o fallback — a floor plan deeper in the set may be missed.`,
            );
          }
          return r.buffers.map((b) => ({ data: b, mimeType: "image/png" }));
        }
      : undefined,
  });
}
