import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/ai/openai";
import type { RetrievedDocument } from "@/lib/ai/types";

export async function retrieveContext(
  query: string,
  options: {
    orgId: string;
    sourceType?: string;
    sourceId?: string;
    matchThreshold?: number;
    matchCount?: number;
    includeSystem?: boolean;
  }
): Promise<RetrievedDocument[]> {
  const {
    orgId,
    sourceType,
    sourceId,
    matchThreshold = 0.7,
    matchCount = 10,
    includeSystem = false,
  } = options;

  // Generate query embedding
  const { embedding } = await generateEmbedding(query);

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_documents_hybrid", {
    query_embedding: JSON.stringify(embedding),
    query_text: "",
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_org_id: orgId,
    filter_source_type: sourceType ?? undefined,
    filter_source_id: sourceId ?? undefined,
    include_system: includeSystem,
  });

  if (error) {
    console.error("[Retriever] Error:", error.message);
    return [];
  }

  return (data ?? []) as RetrievedDocument[];
}

export async function retrievePlanChunks(
  orgId: string,
  planId: string
): Promise<string> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("document_embeddings")
    .select("content, chunk_index")
    .eq("org_id", orgId)
    .eq("source_type", "plan")
    .eq("source_id", planId)
    .order("chunk_index", { ascending: true });

  if (error) {
    console.error("[Retriever] Error fetching plan chunks:", error.message);
    return "";
  }

  return (data ?? []).map((d: { content: string }) => d.content).join("\n\n");
}

/**
 * Whether a plan has any extracted text content (document_embeddings rows).
 *
 * A plan can be `status = "ready"` for Build (its geometry is extracted by a
 * separate job) yet have ZERO embedded text — a scanned or vector-only PDF
 * extracts to no chunks, so ingestion writes nothing to document_embeddings.
 * Cost estimation (MMC Quote) reads that text via retrievePlanChunks, so it
 * must gate on real content, not just plan status — otherwise Run estimate is
 * enabled and then fails with "No plan content found". (SCRUM-348)
 *
 * Scoped by the plan's own UUID (globally unique), so no org filter is needed
 * for a safe existence check.
 */
export async function planHasContent(planId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { count, error } = await admin
    .from("document_embeddings")
    .select("*", { count: "exact", head: true })
    .eq("source_type", "plan")
    .eq("source_id", planId);

  if (error) {
    console.error("[Retriever] Error counting plan chunks:", error.message);
    return false;
  }

  return (count ?? 0) > 0;
}
