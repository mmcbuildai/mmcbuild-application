/**
 * Per-page PDF splitting — the shared primitive behind SCRUM-316.
 *
 * The whole point: a plan set's SIZE stops being a hard wall once the pipeline
 * works in per-page slices. A 37MB Gladesville-style set is ~40 pages of a few
 * hundred KB each; nothing forces us to hand the model the whole document. So
 * the 32MB document ceiling should only ever be applied to what we actually
 * send, and the only genuinely unprocessable case is a SINGLE page that is
 * itself over the ceiling.
 *
 * This module is deliberately free of `server-only` and of any AI/storage
 * dependency so the page-selection maths is unit-testable without a database,
 * a model call, or a real PDF. `full-house-extractor.ts` (the 3D path, already
 * re-sequenced under SCRUM-312) and `extract-design-attributes.ts` (the
 * attribute path, re-sequenced here) both consume it, so there is one splitter
 * rather than a second fork of the same pdf-lib dance.
 */

import { PDFDocument } from "pdf-lib";

/**
 * Byte budget for a subset PDF assembled for a vision call. Deliberately below
 * `ANTHROPIC_PDF_MAX_BYTES` (32MB): the ceiling applies to the encoded request,
 * and PDF assembly can grow slightly on save, so the headroom keeps a subset
 * that measured under-budget from crossing the real limit in flight.
 */
export const VISION_SUBSET_BYTE_BUDGET = 24 * 1024 * 1024;

/**
 * Page cap for an assembled subset. Attribute extraction reads the title block,
 * floor plan and schedules — all near the front of an architectural set — so
 * more pages buy little and cost latency on every large upload.
 */
export const VISION_SUBSET_MAX_PAGES = 12;

/**
 * Extract a single page from a multi-page PDF as its own base64 PDF document.
 * Per-page slices are typically 200-500 KB against 9-12 MB for the full set.
 *
 * Reuses a parsed source document across calls in a run.
 *
 * pdf-lib can throw on malformed page objects (CAD-exported PDFs sometimes ship
 * pages with non-standard resource refs; in production this surfaces as the
 * minified "Expected instance of b, but got instance of undefined" assertion).
 * That is treated as a SOFT failure returning null, so an orchestrator can skip
 * the page and continue with whatever else is extractable rather than losing
 * the whole set to one bad page.
 */
export async function singlePagePdfBase64(
  sourceDoc: PDFDocument,
  pageNumber: number,
): Promise<string | null> {
  const totalPages = sourceDoc.getPageCount();
  if (pageNumber < 1 || pageNumber > totalPages) return null;

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
 * Choose which pages fit inside a byte budget, given each page's measured size.
 *
 * Pure and separated from any PDF I/O so the decision — the part that decides
 * whether a big set is processed or silently dropped — is testable directly.
 *
 * Pages are considered in document order (an architectural set front-loads the
 * title block, floor plans and schedules). A page larger than the whole budget
 * is skipped rather than aborting the selection: one enormous rendered
 * elevation should not cost us the readable pages around it.
 *
 * Returns page NUMBERS (1-indexed), possibly empty when no single page fits.
 */
export function selectPagesWithinBudget(
  pageSizes: number[],
  byteBudget: number = VISION_SUBSET_BYTE_BUDGET,
  maxPages: number = VISION_SUBSET_MAX_PAGES,
): number[] {
  const chosen: number[] = [];
  let total = 0;

  for (let i = 0; i < pageSizes.length; i++) {
    if (chosen.length >= maxPages) break;
    const size = pageSizes[i];
    if (!Number.isFinite(size) || size <= 0) continue;
    if (total + size > byteBudget) continue;
    chosen.push(i + 1);
    total += size;
  }

  return chosen;
}

export interface VisionSubsetResult {
  /**
   * The assembled subset PDF, safely under the ceiling. Typed against a plain
   * ArrayBuffer (not ArrayBufferLike) so it drops straight into the vision-call
   * payloads, which are built from `Buffer.from(arrayBuffer)`.
   */
  buffer: Buffer<ArrayBuffer>;
  /** 1-indexed page numbers included, in document order. */
  pageNumbers: number[];
  /** Page count of the SOURCE document. */
  totalPages: number;
}

/**
 * Assemble a size-bounded subset PDF from an oversize plan set.
 *
 * This is the SCRUM-316 re-sequence in one call: split per page first, measure
 * the slices, then apply the budget to what will actually be sent — instead of
 * measuring the whole document up front and rejecting the upload outright.
 *
 * Returns null when nothing usable can be assembled, which is the genuinely
 * unprocessable case: a single-page document that is itself over budget (there
 * is nothing to split), or a document whose pages all fail to slice. Callers
 * treat null as "degrade honestly", never as success.
 */
export async function buildVisionSubsetPdf(
  source: Buffer,
  options: { byteBudget?: number; maxPages?: number } = {},
): Promise<VisionSubsetResult | null> {
  const byteBudget = options.byteBudget ?? VISION_SUBSET_BYTE_BUDGET;
  const maxPages = options.maxPages ?? VISION_SUBSET_MAX_PAGES;

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(source, { ignoreEncryption: true });
  } catch (err) {
    console.error("[buildVisionSubsetPdf] could not parse source PDF:", err);
    return null;
  }

  const totalPages = doc.getPageCount();
  if (totalPages < 1) return null;

  // Measure each page as its own document — the same slice the model would be
  // sent — rather than estimating from the whole-document size.
  const sizes: number[] = [];
  for (let page = 1; page <= totalPages; page++) {
    const slice = await singlePagePdfBase64(doc, page);
    // A page that will not slice is unusable; size 0 makes selection skip it.
    sizes.push(slice ? Buffer.byteLength(slice, "base64") : 0);
  }

  const pageNumbers = selectPagesWithinBudget(sizes, byteBudget, maxPages);
  if (pageNumbers.length === 0) return null;

  try {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(
      doc,
      pageNumbers.map((n) => n - 1),
    );
    for (const page of copied) out.addPage(page);
    const bytes = await out.save();
    // Copy into an owned ArrayBuffer rather than wrapping pdf-lib's Uint8Array,
    // so the result is a Buffer<ArrayBuffer> the vision-call payloads accept.
    const buffer = Buffer.alloc(bytes.byteLength);
    buffer.set(bytes);
    return { buffer, pageNumbers, totalPages };
  } catch (err) {
    console.error("[buildVisionSubsetPdf] failed to assemble subset:", err);
    return null;
  }
}
