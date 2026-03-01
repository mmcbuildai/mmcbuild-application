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
    filter_source_type: sourceType ?? null,
    filter_source_id: sourceId ?? null,
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
