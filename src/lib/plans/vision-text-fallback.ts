import { PDFDocument } from "pdf-lib";
import { callVisionModel } from "@/lib/build/spatial/vision-call";
import { singlePagePdfBase64 } from "./pdf-page-split";
import { preparePdfBufferForVision } from "./pdf-vision-prep";
import { rasterisePageToTiles } from "./raster-tiles";

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

/**
 * Tiles of ONE sheet read at once. Higher than PAGE_CONCURRENCY because tiles
 * are the inner loop of an already-escalated read and the wall-clock matters
 * more there; still bounded, since a sheet can fan out to MAX_TILES and pages
 * fan out on top of that.
 */
const TILE_CONCURRENCY = 4;

/** Output budget for ONE sheet. A single dense sheet's text runs well inside this. */
const PAGE_MAX_TOKENS = 4000;

/** Output budget when we cannot split and must send the document whole. */
const WHOLE_DOC_MAX_TOKENS = 8000;

/**
 * How many blank sheets we will re-read as tiles.
 *
 * Escalation is the expensive path (a CloudConvert job plus a model call per
 * tile), and a set where sheet after sheet is genuinely blank should not cost
 * the same as one where the first sheet is a dense drawing we failed to read.
 * Front sheets carry the title block, floor plans and schedules, so the first
 * few are where the text is. Sheets past the limit are LOGGED, not silently
 * left out.
 */
export const MAX_ESCALATED_PAGES = 3;

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

/**
 * A tile is a REGION of a sheet, and saying so matters: told it is looking at a
 * whole drawing, the model editorialises about what is missing. Told it is
 * looking at one part of one, it just reads what is in front of it.
 */
const tileUserPrompt = (
  row: number,
  col: number,
  rows: number,
  cols: number,
  page: number,
  totalPages: number,
) =>
  `This image is one region (row ${row} of ${rows}, column ${col} of ${cols}) ` +
  `of drawing sheet ${page} of ${totalPages}. Transcribe every piece of text ` +
  `visible in THIS region, following the rules exactly. Do not comment on what ` +
  `is cut off at the edges.`;

export type VisionTextResult =
  | { text: string; truncated?: true }
  | { error: string };

/**
 * Hand the caller a copy of what we ACTUALLY SENT the model.
 *
 * Three successive fixes to this module reasoned about a rendered CAD sheet
 * that nobody had ever looked at. On 2026-08-09 the tiled read went to
 * production and all twelve tiles came back "no legible text" — at which point
 * "we are reading it badly" and "there is nothing legible in what we produced"
 * became impossible to tell apart from the outside, because the only artefact
 * that could separate them existed for a few seconds inside a serverless
 * function and was never written down.
 *
 * So the failing path now keeps the evidence. Optional, best-effort, and never
 * allowed to affect the read: an artefact sink that throws must not turn a
 * working transcription into a failure.
 */
export type ArtifactSink = (
  name: string,
  data: Buffer,
  contentType: string,
) => Promise<void>;

export interface VisionTextOptions {
  /** Called with the images sent to the model, when a sheet reads blank. */
  onArtifact?: ArtifactSink;
}

/** Never let diagnostics break the thing they are diagnosing. */
async function emit(
  sink: ArtifactSink | undefined,
  name: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  if (!sink) return;
  try {
    await sink(name, data, contentType);
  } catch (e) {
    console.warn(
      `[vision-text-fallback] could not keep artefact ${name}:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

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

  return gradeReply(result);
}

/**
 * Grade a model reply identically whether we sent a PDF page or an image tile.
 * One place, so the marker check, the length floor and the truncation signal
 * cannot drift apart between the two paths.
 */
function gradeReply(result: {
  text?: string;
  stopReason?: string;
}): PageOutcome {
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
 * Read a sheet the model said was blank by rasterising it and reading it in
 * tiles at native scale.
 *
 * WHY A SECOND ATTEMPT RATHER THAN DOING THIS FIRST
 * Rasterising costs a CloudConvert job plus one model call per tile. A scanned
 * A4 page reads perfectly well as a native PDF, because at A4 the ~1568px the
 * model works at is roughly the page's own resolution. It is the ARCHITECTURAL
 * sheet — A1, A0, a model-space dump — where that same 1568px destroys the
 * text. Escalating only on a blank reply spends the money exactly where the
 * cheap path failed, and nowhere else.
 *
 * Returns `blank` only when every tile came back blank, which is then a real
 * finding rather than an artefact of how we sent the page.
 */
async function transcribeSheetByTiles(
  pagePdf: Buffer,
  label: string,
  page: number,
  totalPages: number,
  onArtifact?: ArtifactSink,
): Promise<PageOutcome> {
  const rastered = await rasterisePageToTiles(pagePdf);
  if ("error" in rastered) {
    return { kind: "skipped", reason: `could not rasterise the sheet: ${rastered.error}` };
  }

  const { tiles, rows, cols } = rastered;
  console.warn(
    `[vision-text-fallback] ${label}: sheet ${page} read nothing as a whole page — re-reading it as ${cols}x${rows} tiles at ${rastered.width}x${rastered.height}.`,
  );

  // Keep the FIRST tile before reading any of them. If every tile comes back
  // blank, this image is the only thing that can say whether the drawing was
  // illegible or the render was empty — and it has to be captured before the
  // answer is known, or it is never captured at all.
  await emit(
    onArtifact,
    `sheet-${page}-tile-r${tiles[0].row}c${tiles[0].col}.jpg`,
    tiles[0].data,
    "image/jpeg",
  );

  const readTile = async (tile: (typeof tiles)[number]): Promise<PageOutcome> => {
    try {
      const result = await callVisionModel("plan_vision", {
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: tileUserPrompt(tile.row, tile.col, rows, cols, page, totalPages),
          },
        ],
        images: [{ data: tile.data, mimeType: tile.mimeType }],
        temperature: 0,
        maxTokens: PAGE_MAX_TOKENS,
      });
      return gradeReply(result);
    } catch (e) {
      // A failed tile leaves a gap, and the gap is logged rather than hidden.
      console.warn(
        `[vision-text-fallback] ${label}: tile r${tile.row}c${tile.col} failed:`,
        e instanceof Error ? e.message : String(e),
      );
      return { kind: "skipped", reason: "tile read failed" };
    }
  };

  // Read tiles concurrently, in document order.
  //
  // Measured on Karen's file in production (2026-08-09): twelve tiles read
  // SEQUENTIALLY took 18s of the run's 37s. That is fine for one sheet and
  // stops being fine at MAX_ESCALATED_PAGES sheets, because the whole ingestion
  // lives inside a step bounded by Vercel's 300s invocation ceiling — three
  // escalations of a large set would spend a third of the budget waiting on
  // calls that have nothing to do with each other.
  //
  // Order is preserved by collecting per batch rather than as each settles: the
  // output is labelled by sheet and read top-left to bottom-right, and a
  // transcription whose lines arrive in race order would be harder to check
  // against the drawing for no gain.
  const graded: PageOutcome[] = [];
  for (let i = 0; i < tiles.length; i += TILE_CONCURRENCY) {
    graded.push(
      ...(await Promise.all(tiles.slice(i, i + TILE_CONCURRENCY).map(readTile))),
    );
  }

  const parts: string[] = [];
  let truncated = false;
  let blank = 0;

  for (const g of graded) {
    if (g.kind === "text") {
      parts.push(g.text);
      truncated ||= g.truncated;
    } else if (g.kind === "blank") {
      blank++;
    }
  }

  if (parts.length === 0) {
    console.warn(
      `[vision-text-fallback] ${label}: all ${tiles.length} tiles of sheet ${page} were blank.`,
    );
    return { kind: "blank" };
  }

  console.warn(
    `[vision-text-fallback] ${label}: sheet ${page} yielded text from ${parts.length}/${tiles.length} tiles (${blank} blank).`,
  );
  // Tiles overlap, so a label on a seam appears in both. Left in deliberately:
  // a duplicated room name costs a little retrieval noise, whereas trimming it
  // risks deleting a genuine repeat (a schedule row, a repeated dimension).
  return { kind: "text", text: parts.join("\n"), truncated };
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
  opts: VisionTextOptions = {},
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
      let outcome = await transcribeBuffer(
        pdf,
        label,
        USER_PROMPT,
        WHOLE_DOC_MAX_TOKENS,
      );
      // A single huge CAD sheet is the case that reads blank as a whole page
      // and reads fine in tiles. This is Karen's file.
      if (outcome.kind === "blank") {
        outcome = await transcribeSheetByTiles(pdf, label, 1, 1, opts.onArtifact);
      }
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
    // Shared across the batches. JS is single-threaded, so a plain counter is
    // sound here — the increment cannot interleave with another sheet's read.
    let escalations = 0;

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
            const pagePdf = Buffer.from(b64, "base64");
            let outcome = await transcribeBuffer(
              pagePdf,
              `${label} (sheet ${page})`,
              pageUserPrompt(page, totalPages),
              PAGE_MAX_TOKENS,
            );

            // Blank as a whole page usually means the sheet is too big to be
            // legible once scaled down, not that it is empty. Re-read it in
            // tiles — bounded, because escalation is the expensive path.
            if (outcome.kind === "blank") {
              if (escalations < MAX_ESCALATED_PAGES) {
                escalations++;
                outcome = await transcribeSheetByTiles(
                  pagePdf,
                  label,
                  page,
                  totalPages,
                  opts.onArtifact,
                );
              } else {
                // No silent cap — say which sheet went unre-read and why.
                console.warn(
                  `[vision-text-fallback] ${label}: sheet ${page} read nothing, but the tile re-read limit (${MAX_ESCALATED_PAGES}) is used up — this sheet was not re-read.`,
                );
              }
            }

            return { page, outcome };
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
