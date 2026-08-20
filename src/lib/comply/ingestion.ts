import { createAdminClient } from "@/lib/supabase/admin";
import { parsePdf } from "@/lib/pdf/parser";
import { chunkText } from "@/lib/pdf/chunker";
import { generateEmbeddings } from "@/lib/ai/openai";
import { callModel } from "@/lib/ai/models/router";
import { classifyPlanContent, notAPlanMessage } from "@/lib/plans/content-classifier";
import type { PlanFileKind } from "@/lib/plans/file-kind";

export interface IngestPlanResult {
  pageCount: number;
  chunkCount: number;
  /** Set when the file format is not auto-extractable (e.g. DWG), or when
   * content-classification rejected the upload as not a plan. */
  manualReview?: boolean;
  /** Set alongside manualReview — the reason shown to the user. */
  errorMessage?: string;
}

const VISION_PROMPT = `You are extracting structured information from a building plan or
construction drawing for downstream NCC compliance analysis.

Return plain text capturing every detail visible in the drawing:
- title block (project name, drawing number, revision, date, scale, sheet)
- all room labels, dimensions and areas
- wall types, materials, structural notes
- window and door schedules with sizes and types
- any annotations, callouts, levels, setbacks, or services
- legend entries

Do not summarise. Transcribe everything legible. Use line breaks to separate
distinct regions. If the image is not a building drawing, say so on the first
line.`;

export async function ingestPlan(
  orgId: string,
  planId: string,
  fileBuffer: Buffer,
  fileKind: PlanFileKind = "pdf",
  fileName?: string,
): Promise<IngestPlanResult> {
  const admin = createAdminClient();

  if (fileKind === "dwg") {
    return { pageCount: 0, chunkCount: 0, manualReview: true };
  }

  let extractedText: string;
  let pageCount: number;

  if (fileKind === "image") {
    const mimeType = guessImageMime(fileName);
    const result = await callModel("plan_vision", {
      orgId,
      maxTokens: 4096,
      messages: [{ role: "user", content: VISION_PROMPT }],
      images: [{ data: fileBuffer, mimeType }],
    });
    extractedText = result.text;
    pageCount = 1;
  } else {
    const parsed = await parsePdf(fileBuffer);
    extractedText = parsed.text;
    pageCount = parsed.pageCount;
  }

  await admin
    .from("plans")
    .update({ page_count: pageCount } as never)
    .eq("id", planId);

  // Reject a document that isn't a plan at all BEFORE spending on embeddings
  // — see content-classifier.ts for the full why. Checked on the raw
  // extracted text, ahead of chunking, so a rejection never touches
  // document_embeddings.
  const classification = await classifyPlanContent(extractedText);
  if (!classification.isPlan) {
    return {
      pageCount,
      chunkCount: 0,
      manualReview: true,
      errorMessage: notAPlanMessage(classification.reason),
    };
  }

  const chunks = chunkText(extractedText, {
    sourceType: "plan",
    sourceId: planId,
  });

  if (chunks.length === 0) {
    return { pageCount, chunkCount: 0 };
  }

  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "plan")
    .eq("source_id", planId);

  const rows = chunks.map((chunk, i) => ({
    org_id: orgId,
    source_type: "plan" as const,
    source_id: planId,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    metadata: chunk.metadata,
    embedding: JSON.stringify(embeddings[i].embedding),
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await admin
      .from("document_embeddings")
      .insert(batch as never);
    if (error) {
      throw new Error(`Failed to insert embeddings batch ${i}: ${error.message}`);
    }
  }

  console.log(
    `[Ingestion] Plan ${planId} (${fileKind}): ${pageCount} page(s), ${chunks.length} chunks embedded`,
  );

  return { pageCount, chunkCount: chunks.length };
}

function guessImageMime(fileName: string | undefined): string {
  const ext = fileName?.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Variant of ingestPlan for text content that was extracted upstream
 * (e.g. searchable text built from a parsed DXF). Skips PDF parsing and
 * vision; runs the same chunk → embed → store pipeline.
 */
export async function ingestPlanFromText(input: {
  orgId: string;
  planId: string;
  text: string;
  pageCount?: number;
}): Promise<IngestPlanResult> {
  const admin = createAdminClient();
  const pageCount = input.pageCount ?? 1;

  await admin
    .from("plans")
    .update({ page_count: pageCount } as never)
    .eq("id", input.planId);

  // See ingestPlan above — same check, same reasoning.
  const classification = await classifyPlanContent(input.text);
  if (!classification.isPlan) {
    return {
      pageCount,
      chunkCount: 0,
      manualReview: true,
      errorMessage: notAPlanMessage(classification.reason),
    };
  }

  const chunks = chunkText(input.text, {
    sourceType: "plan",
    sourceId: input.planId,
  });

  if (chunks.length === 0) {
    return { pageCount, chunkCount: 0 };
  }

  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "plan")
    .eq("source_id", input.planId);

  const rows = chunks.map((chunk, i) => ({
    org_id: input.orgId,
    source_type: "plan" as const,
    source_id: input.planId,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    metadata: chunk.metadata,
    embedding: JSON.stringify(embeddings[i].embedding),
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await admin
      .from("document_embeddings")
      .insert(batch as never);
    if (error) {
      throw new Error(`Failed to insert embeddings batch ${i}: ${error.message}`);
    }
  }

  console.log(
    `[Ingestion] Plan ${input.planId} (text): ${chunks.length} chunks embedded`,
  );

  return { pageCount, chunkCount: chunks.length };
}
