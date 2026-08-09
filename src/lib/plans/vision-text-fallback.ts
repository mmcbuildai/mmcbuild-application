import { PDFDocument } from "pdf-lib";
import { callVisionModel } from "@/lib/build/spatial/vision-call";
import { singlePagePdfBase64 } from "./pdf-page-split";
import { preparePdfBufferForVision } from "./pdf-vision-prep";

/**
 * Read the text off a plan by LOOKING at it, when the PDF has no text layer.
 *
 * WHY THIS EXISTS
 * A drawing exported from CAD is a picture of words: room names, dimensions and
 * the title block are drawn as line-work, not stored as characters. Text
 * extraction therefore returns nothing at all — not a little, nothing — and
 * every downstream feature that reads a plan (questionnaire pre-fill, Comply
 * retrieval, Quote) has no input. Karen's 36.9 MB DWG on 2026-08-04 produced
 * exactly zero chunks where a working PDF produces twenty-eight.
 *
 * Vision reads that picture fine. This is the second half of the fix:
 * `classifyIngestOutcome` stops us CLAIMING we read a file we didn't, and this
 * gives us a real chance of reading it.
 *
 * ⚠️ It runs ONLY when text extraction produced nothing. That ordering is the
 * cost control — a normal text PDF never reaches here — and it is also the
 * correctness argument: extracted text is exact, and vision transcription is a
 * model's reading. We prefer the exact one whenever it exists.
 *
 * PER PAGE, NOT PER SET — and this is the load-bearing decision.
 * The first cut of this module sent the WHOLE plan set as one document with one
 * output budget. Three things go wrong at once on a real architectural set, and
 * every one of them fails in the direction this fix exists to close:
 *
 *   1. A forty-sheet set cannot be transcribed inside one output budget. The
 *      reply stops mid-sheet, comes back well over the length floor, passes
 *      every guard, and is embedded as though complete — a PARTIAL read
 *      recorded as a successful one, which is the exact defect of the "ready"
 *      bug wearing different clothes.
 *   2. One blank or dimension-only sheet in the set makes the model emit the
 *      no-legible-text marker inline, and a whole-document marker check then
 *      throws away the eleven sheets it DID read.
 *   3. The 32 MB ceiling gets applied to the whole document, so a 36.9 MB set
 *      is refused outright — even though its pages are a few hundred KB each.
 *      That is Karen's file, and it is why the whole-document version could
 *      have returned nothing for her specifically.
 *
 * Splitting first dissolves all three: each sheet gets its own output budget,
 * its own marker verdict, and its own (tiny) size check. `pdf-page-split` is
 * the repo's existing splitter — SCRUM-316's finding that "the ceiling should
 * only ever be applied to what we actually send" — so this consumes it rather
 * than forking a second pdf-lib dance.
 *
 * Consumes the existing `plan_vision` route (`callVisionModel`) and the
 * existing size handling (`preparePdfBufferForVision`) rather than forking
 * either — the same plumbing Build already uses to pull 3D geometry off these
 * same drawings.
 */

/**
 * Marker the model returns when a page carries no legible text. Checked
 * explicitly so "there is nothing here" arrives as a fact rather than as an
 * empty string we would have to guess the meaning of.
 */
export const NO_LEGIBLE_TEXT = "NO_LEGIBLE_TEXT";

/**
 * How many sheets we will transcribe. A set's readable content — title block,
 * floor plans, schedules, notes — front-loads; past this the cost is real and
 * the marginal text is elevations and details. Matches the page cap the 3D and
 * attribute paths already use, so a plan is read to the same depth everywhere.
 *
 * When a set is longer, what was dropped is LOGGED. A silent cap reads as
 * "we transcribed the plan" when it means "we transcribed part of it".
 */
export const MAX_TRANSCRIBED_PAGES = 12;

/** Sheets transcribed at once. Bounds wall-clock without hammering the provider. */
const PAGE_CONCURRENCY = 3;

/** Output budget for ONE sheet. A single dense sheet's text runs well inside this. */
const PAGE_MAX_TOKENS = 4000;

/** Output budget when we cannot split and must send the document whole. */
const WHOLE_DOC_MAX_TOKENS = 8000;

/**
 * Below this a reply is not a transcription — it is the model failing in a way
 * the marker didn't catch. Embedding it would put a meaningless chunk into
 * retrieval and let the plan claim it had been read.
 */
const MIN_USABLE_CHARS = 40;

const SYSTEM_PROMPT = `You transcribe architectural and engineering drawings.

Return ONLY the text that is actually visible in the drawing. Transcribe it as
plain text, grouped the way it appears on the sheet: title block first, then
sheet/drawing names, then room names and their areas, then dimensions, then any
notes, legends or schedules.

Rules that matter more than completeness:
- Transcribe what is there. Never infer, complete, correct or expand anything.
  A half-legible room label is transcribed half-legible, not guessed.
- Do not describe the drawing, the geometry, or what the building appears to be.
  You are reading text off a page, not interpreting a design.
- Do not add headings, commentary, or apologies.
- If the page carries no legible text at all, reply with exactly ${NO_LEGIBLE_TEXT}
  and nothing else.`;

const USER_PROMPT =
  "Transcribe every piece of text visible in this drawing set, following the " +
  "rules exactly.";

const pageUserPrompt = (page: number, total: number) =>
  `Transcribe every piece of text visible on this drawing sheet (sheet ${page} ` +
  `of ${total}), following the rules exactly.`;

export type VisionTextResult =
  | { text: string; truncated?: true }
  | { error: string };

/** What one sheet produced. "blank" is an answer, not a failure. */
type PageOutcome =
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "blank" }
  | { kind: "skipped"; reason: string };

/**
 * Send one PDF buffer to the vision model and grade the reply.
 *
 * Shared by both paths so the marker check, the length floor and the
 * truncation signal cannot drift apart between them.
 */
async function transcribeBuffer(
  pdf: Buffer,
  label: string,
  userPrompt: string,
  maxTokens: number,
): Promise<PageOutcome> {
  const prepared = await preparePdfBufferForVision(pdf, label);
  if (!prepared.withinCeiling) {
    // Degrade, don't fake: sending it would 400 or silently truncate.
    return {
      kind: "skipped",
      reason: "still over the vision model's size ceiling after optimising",
    };
  }

  const result = await callVisionModel("plan_vision", {
    pdf: { data: prepared.buffer },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0,
    maxTokens,
  });

  const text = (result.text ?? "").trim();

  if (!text || text.includes(NO_LEGIBLE_TEXT)) return { kind: "blank" };

  if (text.length < MIN_USABLE_CHARS) {
    return {
      kind: "skipped",
      reason: `vision returned too little text to be usable (${text.length} chars)`,
    };
  }

  // The model ran out of output budget, so this transcription is cut short.
  // Surfaced rather than swallowed: a partial read recorded as a complete one
  // is the defect this whole module exists to close.
  return { kind: "text", text, truncated: result.stopReason === "max_tokens" };
}

/**
 * Attempt to transcribe a plan PDF's visible text, sheet by sheet.
 *
 * Never throws — a vision failure must leave the plan in the honest
 * `manual_review` state `classifyIngestOutcome` would have given it, not break
 * the ingestion run. Returns `{ error }` for every unusable outcome, including
 * every sheet reporting no legible text, so the caller has one thing to check.
 */
export async function readPlanTextViaVision(
  pdf: Buffer,
  label = "plan.pdf",
): Promise<VisionTextResult> {
  try {
    let doc: PDFDocument | null = null;
    try {
      doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    } catch {
      // A PDF we cannot parse is not a PDF we cannot READ — pdf-lib is
      // stricter than the model is. Fall through to sending it whole.
      doc = null;
    }

    const totalPages = doc ? doc.getPageCount() : 0;

    // Nothing to gain from splitting a single sheet, and re-saving it through
    // pdf-lib would only risk a parse we already know we don't need.
    if (!doc || totalPages <= 1) {
      const outcome = await transcribeBuffer(
        pdf,
        label,
        USER_PROMPT,
        WHOLE_DOC_MAX_TOKENS,
      );
      if (outcome.kind === "text") {
        if (outcome.truncated) {
          console.warn(
            `[vision-text-fallback] ${label}: transcription hit the output ceiling — the stored text is incomplete.`,
          );
        }
        return outcome.truncated
          ? { text: outcome.text, truncated: true }
          : { text: outcome.text };
      }
      return {
        error:
          outcome.kind === "blank"
            ? "the drawing carries no legible text"
            : outcome.reason,
      };
    }

    const pageCount = Math.min(totalPages, MAX_TRANSCRIBED_PAGES);
    if (totalPages > MAX_TRANSCRIBED_PAGES) {
      // No silent caps — say which sheets were not read.
      console.warn(
        `[vision-text-fallback] ${label}: ${totalPages} sheets, transcribing the first ${MAX_TRANSCRIBED_PAGES}; sheets ${MAX_TRANSCRIBED_PAGES + 1}–${totalPages} were not read.`,
      );
    }

    const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
    const outcomes: { page: number; outcome: PageOutcome }[] = [];

    for (let i = 0; i < pages.length; i += PAGE_CONCURRENCY) {
      const batch = pages.slice(i, i + PAGE_CONCURRENCY);
      const settled = await Promise.all(
        batch.map(async (page): Promise<{ page: number; outcome: PageOutcome }> => {
          try {
            const b64 = await singlePagePdfBase64(doc, page);
            if (!b64) {
              return {
                page,
                outcome: { kind: "skipped", reason: "the sheet could not be split out" },
              };
            }
            return {
              page,
              outcome: await transcribeBuffer(
                Buffer.from(b64, "base64"),
                `${label} (sheet ${page})`,
                pageUserPrompt(page, totalPages),
                PAGE_MAX_TOKENS,
              ),
            };
          } catch (e) {
            // One bad sheet must not cost us the rest of the set.
            return {
              page,
              outcome: {
                kind: "skipped",
                reason: e instanceof Error ? e.message : "sheet transcription failed",
              },
            };
          }
        }),
      );
      outcomes.push(...settled);
    }

    const sheets: string[] = [];
    let truncated = false;
    let blank = 0;
    const skipped: string[] = [];

    for (const { page, outcome } of outcomes) {
      if (outcome.kind === "text") {
        // Labelled so retrieval can cite a sheet, and so a reader can tell a
        // twelve-sheet read from a one-sheet one.
        sheets.push(`--- Sheet ${page} of ${totalPages} ---\n${outcome.text}`);
        truncated ||= outcome.truncated;
      } else if (outcome.kind === "blank") {
        blank++;
      } else {
        skipped.push(`sheet ${page}: ${outcome.reason}`);
      }
    }

    if (sheets.length === 0) {
      if (skipped.length > 0) {
        console.warn(
          `[vision-text-fallback] ${label}: no sheet could be transcribed — ${skipped.join("; ")}`,
        );
        return { error: skipped[0] };
      }
      return { error: "the drawing carries no legible text" };
    }

    if (skipped.length > 0 || truncated) {
      console.warn(
        `[vision-text-fallback] ${label}: transcribed ${sheets.length}/${pageCount} sheets` +
          (blank > 0 ? `, ${blank} blank` : "") +
          (truncated ? ", at least one hit the output ceiling" : "") +
          (skipped.length > 0 ? ` — ${skipped.join("; ")}` : ""),
      );
    }

    const text = sheets.join("\n\n");
    return truncated ? { text, truncated: true } : { text };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "vision transcription failed",
    };
  }
}
