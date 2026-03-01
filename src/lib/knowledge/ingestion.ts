import { createAdminClient } from "@/lib/supabase/admin";
import { parsePdf } from "@/lib/pdf/parser";
import { chunkText } from "@/lib/pdf/chunker";
import { generateEmbeddings } from "@/lib/ai/openai";

const SYSTEM_ORG_ID = "00000000-0000-0000-0000-000000000000";

export async function ingestKbDocument(
  kbId: string,
  documentId: string,
  pdfBuffer: Buffer,
  scope: "system" | "org",
  orgId: string | null
): Promise<{ pageCount: number; chunkCount: number }> {
  const admin = createAdminClient();
  const effectiveOrgId = scope === "system" ? SYSTEM_ORG_ID : orgId!;

  // 1. Parse PDF
  const parsed = await parsePdf(pdfBuffer);

  // 2. Chunk the text
  const chunks = chunkText(parsed.text, {
    sourceType: "kb_document",
    sourceId: documentId,
  });

  if (chunks.length === 0) {
    await admin
      .from("knowledge_documents")
      .update({
        page_count: parsed.pageCount,
        chunk_count: 0,
        status: "ready",
      } as never)
      .eq("id", documentId);

    return { pageCount: parsed.pageCount, chunkCount: 0 };
  }

  // 3. Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  // 4. Delete any existing embeddings for this document (re-processing)
  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "kb_document")
    .eq("source_id", documentId);

  // 5. Insert chunks with embeddings
  const rows = chunks.map((chunk, i) => ({
    org_id: effectiveOrgId,
    source_type: "kb_document" as const,
    source_id: documentId,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    metadata: {
      ...chunk.metadata,
      kb_id: kbId,
    },
    embedding: JSON.stringify(embeddings[i].embedding),
  }));

  // Insert in batches of 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await admin.from("document_embeddings").insert(batch as never);
    if (error) {
      throw new Error(`Failed to insert KB embeddings batch ${i}: ${error.message}`);
    }
  }

  // 6. Update document record
  await admin
    .from("knowledge_documents")
    .update({
      page_count: parsed.pageCount,
      chunk_count: chunks.length,
      status: "ready",
    } as never)
    .eq("id", documentId);

  console.log(
    `[KB Ingestion] Document ${documentId}: ${parsed.pageCount} pages, ${chunks.length} chunks embedded`
  );

  return { pageCount: parsed.pageCount, chunkCount: chunks.length };
}
