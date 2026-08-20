import type { DocumentChunk } from "../ai/types";

const DEFAULT_CHUNK_SIZE = 500; // approximate tokens
const DEFAULT_OVERLAP = 50;
const CHARS_PER_TOKEN = 4; // rough approximation

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
  sourceType?: string;
  sourceId?: string;
}

/**
 * Strip characters PDF text extraction can produce that Postgres/PostgREST
 * cannot round-trip, so a plan upload can never crash ingestion with
 * "unsupported Unicode escape sequence" partway through embedding storage.
 *
 * Two failure modes, both seen from real uploads:
 *   - NUL bytes (U+0000): Postgres's `text` type cannot store these at all —
 *     a hard Postgres limitation, not a Supabase bug.
 *   - Unpaired UTF-16 surrogate halves: malformed Unicode that PostgREST's
 *     JSON layer rejects. Valid surrogate PAIRS (real non-BMP characters) are
 *     left untouched — only a high surrogate with no following low surrogate,
 *     or a low surrogate with no preceding high surrogate, is stripped.
 *
 * Applied here (the one function every ingestion path routes through —
 * ingestPlan, ingestPlanFromText, process-certification) rather than at each
 * call site, so no future caller can reintroduce the crash by skipping it.
 */
function sanitizeForPostgresText(input: string): string {
  return input
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

export function chunkText(
  rawText: string,
  options: ChunkOptions = {}
): DocumentChunk[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_OVERLAP,
    sourceType = "plan",
    sourceId = "",
  } = options;

  const text = sanitizeForPostgresText(rawText);
  const maxChars = chunkSize * CHARS_PER_TOKEN;
  const overlapChars = overlap * CHARS_PER_TOKEN;

  // Split into paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const chunks: DocumentChunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();

    // If adding this paragraph would exceed chunk size, save current and start new
    if (currentChunk.length + trimmed.length > maxChars && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: { source_type: sourceType, source_id: sourceId },
        chunk_index: chunkIndex,
      });
      chunkIndex++;

      // Keep overlap from the end of the current chunk
      if (overlapChars > 0 && currentChunk.length > overlapChars) {
        currentChunk = currentChunk.slice(-overlapChars) + "\n\n" + trimmed;
      } else {
        currentChunk = trimmed;
      }
    } else {
      currentChunk = currentChunk
        ? currentChunk + "\n\n" + trimmed
        : trimmed;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: { source_type: sourceType, source_id: sourceId },
      chunk_index: chunkIndex,
    });
  }

  return chunks;
}
