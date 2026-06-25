/**
 * Content-addressed cache for the strong spatial extraction (extractFullHouse).
 *
 * The extraction is expensive (many vision calls). Today its result is cached in
 * test_3d_jobs keyed by (org_id, storage_path), so the SAME design copied to
 * another org/tester — every beta sample pick is a fresh copy — re-extracts from
 * scratch, and the Comply prefill can't see it (it reads design_checks).
 *
 * This module makes the extraction CONTENT-ADDRESSED: keyed by sha256(file
 * bytes) + EXTRACTOR_VERSION. Extract a design once, ever; every later run — 3D,
 * design optimisation, Comply prefill, any org, any tester — is a cache hit.
 *
 * Service layer only (server-only): it reads/writes with the admin client and is
 * never imported into client code. The design_extractions table is service-role
 * only (RLS on, no public policies) — see migration 00066.
 */

import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/supabase/db";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SpatialLayout } from "@/lib/build/spatial/types";
import type { DesignAttributes } from "@/lib/comply/questionnaire-prefill";

/**
 * Extractor-output version. BUMP THIS whenever the extractor's output changes so
 * the cache invalidates cleanly (lookups match the current version, old rows are
 * ignored and re-extracted — no stale geometry served after an upgrade).
 *
 *   v1 — original single-floor extractor (ground floor only).
 *   v2 — 2026-06 multi-storey extraction (all floors stacked + storey tags).
 */
export const EXTRACTOR_VERSION = 2;

const BUCKET = "plan-uploads";

export interface CachedDesignExtraction {
  spatialLayout: SpatialLayout | null;
  derivedAttributes: DesignAttributes | null;
  extractorVersion: number;
}

/** sha256 hex of the file bytes — a design's content address. */
export function computeContentHash(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Cache read at the CURRENT extractor version. Null on miss (no row, or only an
 * older-version row, which we intentionally ignore).
 */
export async function lookupDesignExtraction(
  contentHash: string | null | undefined,
): Promise<CachedDesignExtraction | null> {
  if (!contentHash) return null;
  const { data } = await db()
    .from("design_extractions")
    .select("spatial_layout, derived_attributes, extractor_version")
    .eq("content_hash", contentHash)
    .eq("extractor_version", EXTRACTOR_VERSION)
    .maybeSingle();
  if (!data) return null;
  return {
    spatialLayout: data.spatial_layout ?? null,
    derivedAttributes: data.derived_attributes ?? null,
    extractorVersion: data.extractor_version,
  };
}

/**
 * Cache write, idempotent on (content_hash, extractor_version). Called by the
 * extraction executor (run-test-3d-extraction) once it produces a layout, so
 * every other consumer of this design becomes a free cache hit. Best-effort:
 * never throws into the caller's critical path.
 */
export async function storeDesignExtraction(args: {
  contentHash: string;
  spatialLayout: SpatialLayout | null;
  derivedAttributes?: DesignAttributes | null;
  sourceKind?: string | null;
  extractedVia?: string | null;
  sourceSizeBytes?: number | null;
}): Promise<void> {
  if (!args.contentHash) return;
  try {
    await db()
      .from("design_extractions")
      .upsert(
        {
          content_hash: args.contentHash,
          extractor_version: EXTRACTOR_VERSION,
          spatial_layout: args.spatialLayout,
          derived_attributes: args.derivedAttributes ?? null,
          source_kind: args.sourceKind ?? null,
          extracted_via: args.extractedVia ?? null,
          source_size_bytes: args.sourceSizeBytes ?? null,
        },
        { onConflict: "content_hash,extractor_version" },
      );
  } catch (err) {
    // Caching is an optimisation — a write failure must never break extraction.
    console.error("[design-extraction-cache] store failed:", err);
  }
}

/**
 * Read (or compute + persist) a plan's content hash. The hash keys the cache, so
 * it must exist before a lookup; we compute it lazily from the stored file the
 * first time it's needed and write it back to plans.content_hash. Returns null
 * when the file is unavailable (orphaned record).
 */
export async function ensurePlanContentHash(
  planId: string,
): Promise<string | null> {
  const { data: plan } = await db()
    .from("plans")
    .select("content_hash, file_path")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return null;
  if (plan.content_hash) return plan.content_hash as string;

  const filePath = plan.file_path as string | null;
  if (!filePath) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(filePath);
  if (error || !data) {
    console.error(
      `[design-extraction-cache] cannot hash plan ${planId}: ${error?.message ?? "no data"}`,
    );
    return null;
  }
  const hash = computeContentHash(Buffer.from(await data.arrayBuffer()));
  await db().from("plans").update({ content_hash: hash }).eq("id", planId);
  return hash;
}

/**
 * Canonical accessor for consumers (3D preview, design optimisation, Comply
 * prefill, build actions): the cached strong extraction for a plan at the
 * current extractor version, or null. On null the caller decides whether to
 * trigger an extraction (run-test-3d-extraction) and wait, or degrade — the
 * cache layer does not run the (conversion-heavy) extraction itself.
 */
export async function getCachedDesignForPlan(
  planId: string,
): Promise<CachedDesignExtraction | null> {
  const hash = await ensurePlanContentHash(planId);
  return lookupDesignExtraction(hash);
}
