import type { PlanFileKind } from "./file-kind";

/**
 * Decide a plan's final status from what ingestion actually produced.
 *
 * WHY THIS EXISTS
 * `process-plan` marked a plan `ready` unless something *threw*. Extracting
 * NOTHING was therefore indistinguishable from extracting everything: a plan
 * with zero embedded chunks got `status: "ready"`, `error_message: null`, and a
 * questionnaire that silently pre-filled nothing.
 *
 * Karen hit exactly that on 4 August with a 36.9 MB DWG
 * (`173ee971-…`, 0 rows in `document_embeddings` against 28 for a working PDF)
 * and reported it as "uploaded with no problems but it did not identify data in
 * document fields". The upload genuinely had no problems. The reading did, and
 * nothing said so.
 *
 * This is the repo's own rule, applied where it was missing — CLAUDE.md: *"A job
 * reporting done/completed is not proof of success. Verify real output before
 * treating a run as resolved."* `planHasContent()` already encodes the same
 * knowledge, but only DOWNSTREAM, to gate Quote's Run button (SCRUM-348). By
 * then the plan has already told the user it is ready.
 *
 * It is deliberately NOT DWG-specific. A scanned or vector-only PDF, and an
 * image with no legible text, fail in exactly the same way — a picture of words
 * is not words. Fixing only the format that happened to be reported would leave
 * the same silence behind two other doors.
 */
export interface IngestOutcome {
  pageCount: number;
  chunkCount: number;
  manualReview: boolean;
  errorMessage?: string | null;
}

export interface ClassifiedOutcome {
  status: "ready" | "manual_review";
  errorMessage: string | null;
}

/**
 * Why nothing could be read, in the user's terms, for the format they gave us.
 *
 * Each one names the CAUSE and then what to DO — a message that only says
 * "no text found" tells someone their file is broken when it is fine and our
 * reading of it is what fell short.
 */
export function noContentMessage(kind: PlanFileKind): string {
  switch (kind) {
    case "dwg":
    case "rvt":
    case "skp":
      return (
        "We converted this drawing but couldn't read any text from it. CAD " +
        "drawings often store room names and dimensions as line-work rather " +
        "than as characters, so there's nothing for us to read back. Upload a " +
        "PDF export of the same drawing if you have one, or fill in the " +
        "questionnaire by hand — the file itself is saved either way."
      );
    case "pdf":
      return (
        "We couldn't read any text from this PDF. It's most likely a scan, or " +
        "exported as an image, so the words on the page aren't stored as text. " +
        "Upload a text-based PDF if you can, or fill in the questionnaire by " +
        "hand — the file itself is saved either way."
      );
    case "image":
      return (
        "We couldn't read any text from this image. Photos and screenshots of " +
        "plans are usually too low-resolution to read reliably. Upload the " +
        "original PDF or drawing if you have it, or fill in the questionnaire " +
        "by hand — the file itself is saved either way."
      );
    case "doc":
    default:
      return (
        "We couldn't read any text from this document. Upload a PDF version if " +
        "you have one, or fill in the questionnaire by hand — the file itself " +
        "is saved either way."
      );
  }
}

/**
 * Map an ingestion result to the status the plan should carry.
 *
 * An existing failure always wins: if ingestion already knows why it failed,
 * that reason is more specific than "nothing came out" and must not be
 * overwritten by it.
 */
export function classifyIngestOutcome(
  outcome: IngestOutcome,
  kind: PlanFileKind,
): ClassifiedOutcome {
  if (outcome.manualReview) {
    return {
      status: "manual_review",
      errorMessage: outcome.errorMessage ?? null,
    };
  }

  if (outcome.chunkCount <= 0) {
    return { status: "manual_review", errorMessage: noContentMessage(kind) };
  }

  return { status: "ready", errorMessage: null };
}
