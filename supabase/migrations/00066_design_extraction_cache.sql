-- ============================================================
-- 00066: Content-addressed design-extraction cache
-- ============================================================
-- The strong spatial extraction (extractFullHouse — floor-plan geometry +
-- section + schedule + elevation) is expensive (many vision calls). Today its
-- result is cached in test_3d_jobs keyed by (org_id, storage_path), so the SAME
-- design re-uploaded or COPIED to another org/tester (every beta sample pick is
-- a fresh copy) re-extracts from scratch, and the Comply questionnaire prefill
-- can't see it at all (it reads design_checks.spatial_layout).
--
-- This table makes the extraction CONTENT-ADDRESSED: keyed by the sha256 of the
-- file bytes + the extractor version. Extract a design once, ever; every later
-- run — 3D, design optimisation, Comply prefill, any org, any tester — is a
-- cache hit at zero AI cost.
--
-- DELIBERATE CROSS-ORG SHARING: identical bytes = identical design, so the
-- extraction is safe to share across orgs (the beta-reuse win, and nothing is
-- exposed that an org doesn't already hold — it has the same file). RLS is ON
-- with NO public policies: only server-side code using the service-role key
-- (which bypasses RLS) reads or writes this cache. It is never queried from the
-- client. This is a conscious, content-addressed exception to org-scoped RLS,
-- the same shape as a shared CDN.
--
-- extractor_version: bump the EXTRACTOR_VERSION constant in code whenever the
-- extractor's output changes (e.g. the 2026-06 multi-storey upgrade). Lookups
-- match the CURRENT version, so old rows are simply ignored and re-extracted —
-- no stale ground-floor-only geometry is ever served after an upgrade.

CREATE TABLE IF NOT EXISTS design_extractions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 hex of the raw uploaded file bytes (the design's content address).
  content_hash       TEXT NOT NULL,
  -- Monotonic extractor-output version (see EXTRACTOR_VERSION in code).
  extractor_version  INTEGER NOT NULL,
  -- The full SpatialLayout produced by extractFullHouse (walls/rooms/openings/
  -- roof/storeys). The canonical asset every consumer reuses.
  spatial_layout     JSONB,
  -- Questionnaire-relevant attributes derived FROM the layout (floor area, wet
  -- count, ceiling heights, …). Lets the Comply prefill read the strong values
  -- without re-deriving. Nullable — populated alongside spatial_layout.
  derived_attributes JSONB,
  -- Provenance/diagnostics: file kind extracted, how (ai-vision / dxf-direct),
  -- and the source file size — handy for cache audits.
  source_kind        TEXT,
  extracted_via      TEXT,
  source_size_bytes  BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One cached extraction per (design, extractor version).
  CONSTRAINT design_extractions_hash_version_key
    UNIQUE (content_hash, extractor_version)
);

COMMENT ON TABLE design_extractions IS
  'Content-addressed cache of the strong spatial extraction (extractFullHouse), keyed by sha256(file bytes) + extractor_version. Shared across orgs by design (identical bytes = identical design). Service-role only; RLS on with no public policies.';

CREATE INDEX IF NOT EXISTS idx_design_extractions_lookup
  ON design_extractions (content_hash, extractor_version);

-- RLS on, but NO policies: the service role bypasses RLS, the client never
-- touches this table. Belt-and-braces against an accidental anon/auth read.
ALTER TABLE design_extractions ENABLE ROW LEVEL SECURITY;

-- Content address on the plan, so a consumer can look the cache up without
-- re-reading the file. sha256 hex of the uploaded bytes; computed on upload /
-- backfilled on first need. Null until computed.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

COMMENT ON COLUMN plans.content_hash IS
  'sha256 hex of the uploaded file bytes — the key into design_extractions (the content-addressed extraction cache). Null until computed on upload or first extraction.';

CREATE INDEX IF NOT EXISTS idx_plans_content_hash
  ON plans (content_hash);
