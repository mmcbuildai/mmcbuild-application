-- ============================================================
-- Migration 00004: Automated R&D Time Tracking
-- GitHub webhook integration + AI classification
-- ============================================================

-- ============================================================
-- PART 1: New Enums
-- ============================================================

DO $$ BEGIN
  CREATE TYPE commit_log_status AS ENUM ('pending', 'processing', 'classified', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- PART 2: rd_tracking_config — per-org webhook settings
-- ============================================================

CREATE TABLE IF NOT EXISTS rd_tracking_config (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                    UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  enabled                   BOOLEAN NOT NULL DEFAULT false,
  github_repo               TEXT,
  webhook_secret            TEXT,
  default_hours_per_commit  DECIMAL(3,1) NOT NULL DEFAULT 0.5,
  auto_approve_threshold    DECIMAL(3,2) NOT NULL DEFAULT 0.85,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rd_tracking_config_org_unique UNIQUE (org_id)
);

ALTER TABLE rd_tracking_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rd_tracking_config_select" ON rd_tracking_config;
CREATE POLICY "rd_tracking_config_select" ON rd_tracking_config
  FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "rd_tracking_config_insert" ON rd_tracking_config;
CREATE POLICY "rd_tracking_config_insert" ON rd_tracking_config
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "rd_tracking_config_update" ON rd_tracking_config;
CREATE POLICY "rd_tracking_config_update" ON rd_tracking_config
  FOR UPDATE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );


-- ============================================================
-- PART 3: rd_commit_logs — raw commit data from GitHub
-- ============================================================

CREATE TABLE IF NOT EXISTS rd_commit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  sha             TEXT NOT NULL,
  author_name     TEXT,
  author_email    TEXT,
  message         TEXT,
  files_changed   JSONB,
  repo            TEXT,
  branch          TEXT,
  committed_at    TIMESTAMPTZ,
  status          commit_log_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rd_commit_logs_org_sha ON rd_commit_logs(org_id, sha);
CREATE INDEX IF NOT EXISTS idx_rd_commit_logs_status ON rd_commit_logs(status);

ALTER TABLE rd_commit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rd_commit_logs_select" ON rd_commit_logs;
CREATE POLICY "rd_commit_logs_select" ON rd_commit_logs
  FOR SELECT USING (org_id = get_user_org_id());


-- ============================================================
-- PART 4: rd_auto_entries — AI-classified staging table
-- ============================================================

CREATE TABLE IF NOT EXISTS rd_auto_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  commit_id       UUID NOT NULL REFERENCES rd_commit_logs(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  hours           DECIMAL(4,1) NOT NULL,
  stage           TEXT NOT NULL,
  deliverable     TEXT NOT NULL,
  rd_tag          rd_tag NOT NULL DEFAULT 'not_eligible',
  description     TEXT,
  ai_reasoning    TEXT,
  confidence      DECIMAL(3,2),
  review_status   review_status NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rd_auto_entries_org_id ON rd_auto_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_rd_auto_entries_review_status ON rd_auto_entries(org_id, review_status);
CREATE INDEX IF NOT EXISTS idx_rd_auto_entries_commit_id ON rd_auto_entries(commit_id);

ALTER TABLE rd_auto_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rd_auto_entries_select" ON rd_auto_entries;
CREATE POLICY "rd_auto_entries_select" ON rd_auto_entries
  FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "rd_auto_entries_update" ON rd_auto_entries;
CREATE POLICY "rd_auto_entries_update" ON rd_auto_entries
  FOR UPDATE USING (org_id = get_user_org_id());


-- ============================================================
-- PART 5: rd_file_mappings — configurable file pattern rules
-- ============================================================

CREATE TABLE IF NOT EXISTS rd_file_mappings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  pattern     TEXT NOT NULL,
  stage       TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  rd_tag      rd_tag NOT NULL DEFAULT 'core_rd',
  priority    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rd_file_mappings_org_id ON rd_file_mappings(org_id);

ALTER TABLE rd_file_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rd_file_mappings_select" ON rd_file_mappings;
CREATE POLICY "rd_file_mappings_select" ON rd_file_mappings
  FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "rd_file_mappings_insert" ON rd_file_mappings;
CREATE POLICY "rd_file_mappings_insert" ON rd_file_mappings
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "rd_file_mappings_update" ON rd_file_mappings;
CREATE POLICY "rd_file_mappings_update" ON rd_file_mappings
  FOR UPDATE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "rd_file_mappings_delete" ON rd_file_mappings;
CREATE POLICY "rd_file_mappings_delete" ON rd_file_mappings
  FOR DELETE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );


-- ============================================================
-- PART 6: Updated_at triggers
-- ============================================================

DROP TRIGGER IF EXISTS set_rd_tracking_config_updated_at ON rd_tracking_config;
CREATE TRIGGER set_rd_tracking_config_updated_at
  BEFORE UPDATE ON rd_tracking_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_rd_auto_entries_updated_at ON rd_auto_entries;
CREATE TRIGGER set_rd_auto_entries_updated_at
  BEFORE UPDATE ON rd_auto_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ============================================================
-- Migration 00005: Expand KB uploads to support multiple formats
-- ============================================================

-- Update the kb-uploads bucket to accept all supported file types
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/acad',
    'application/x-step',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
    'text/plain'
  ],
  file_size_limit = 104857600  -- 100 MB
WHERE id = 'kb-uploads';
-- 00006_site_intel.sql
-- Site intelligence: geocoded project data, wind/climate/council derivations

-- =============================================================================
-- Table: project_site_intel (1:1 with projects)
-- =============================================================================
create table if not exists public.project_site_intel (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  org_id        uuid not null references public.organisations(id) on delete cascade,

  -- Geocoded location
  latitude           double precision,
  longitude          double precision,
  formatted_address  text,
  suburb             text,
  postcode           text,
  state              text,

  -- Derived intelligence
  climate_zone   smallint,          -- NatHERS 1-8
  wind_region    text,              -- A, B, C, D
  bal_rating     text,              -- BAL-LOW, BAL-12.5, BAL-19, BAL-29, BAL-40, BAL-FZ
  council_name   text,              -- LGA name
  council_code   text,              -- LGA code
  zoning         text,              -- R1, R2, etc.
  overlays       jsonb default '{}',-- flood, heritage, bushfire

  -- Presentation
  static_map_url text,              -- Mapbox Static API image URL

  -- Metadata
  derived_at     timestamptz default now(),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  -- 1:1 constraint
  constraint project_site_intel_project_id_unique unique (project_id)
);

-- Index for fast org-scoped queries
create index if not exists idx_project_site_intel_org_id on public.project_site_intel(org_id);

-- Updated-at trigger
DROP TRIGGER IF EXISTS project_site_intel_updated_at ON public.project_site_intel;
create trigger project_site_intel_updated_at
  before update on public.project_site_intel
  for each row execute function public.update_updated_at();

-- =============================================================================
-- RLS: org-scoped access via get_user_org_id()
-- =============================================================================
alter table public.project_site_intel enable row level security;

DROP POLICY IF EXISTS "Users can view own org site intel" ON public.project_site_intel;
create policy "Users can view own org site intel"
  on public.project_site_intel for select
  using (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can insert own org site intel" ON public.project_site_intel;
create policy "Users can insert own org site intel"
  on public.project_site_intel for insert
  with check (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can update own org site intel" ON public.project_site_intel;
create policy "Users can update own org site intel"
  on public.project_site_intel for update
  using (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can delete own org site intel" ON public.project_site_intel;
create policy "Users can delete own org site intel"
  on public.project_site_intel for delete
  using (org_id = public.get_user_org_id());

-- =============================================================================
-- Storage bucket: site-data (GeoJSON files for wind/climate/council lookups)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-data',
  'site-data',
  false,
  200 * 1024 * 1024,  -- 200MB (largest file is ~94MB)
  array['application/json', 'application/geo+json']
)
on conflict (id) do nothing;
-- ============================================================
-- MMC Build — Stage 1 Amendment: Engineering Certifications
-- ============================================================
-- Run after 00006_site_intel.sql
-- Adds certification upload tracking for engineering certs
-- and state-specific forms (QLD Form 15/16, NSW CDC/CC, etc.)
-- ============================================================


-- ============================================================
-- PART 1: New Enums
-- ============================================================

DO $$ BEGIN
  CREATE TYPE cert_type AS ENUM (
    -- Engineering certifications
    'structural', 'geotechnical', 'energy_nathers', 'energy_jv3',
    'bushfire_bal', 'acoustic', 'hydraulic', 'electrical', 'waterproofing',
    -- QLD forms
    'form_15_qld', 'form_16_qld', 'form_21_qld',
    -- NSW forms
    'cdc_nsw', 'cc_nsw', 'oc_nsw',
    -- VIC forms
    'building_permit_vic', 'reg_126_vic',
    -- WA forms
    'design_compliance_wa',
    -- SA forms
    'building_rules_sa',
    -- TAS forms
    'likely_compliance_tas',
    -- Other
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cert_status AS ENUM (
    'uploading', 'processing', 'ready', 'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- PART 2: Project Certifications Table
-- ============================================================

CREATE TABLE IF NOT EXISTS project_certifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  cert_type       cert_type NOT NULL DEFAULT 'other',
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  status          cert_status NOT NULL DEFAULT 'uploading',
  state           TEXT,
  issuer_name     TEXT,
  issue_date      DATE,
  expiry_date     DATE,
  notes           TEXT,
  error_message   TEXT,
  created_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_certifications_project_id ON project_certifications(project_id);
CREATE INDEX IF NOT EXISTS idx_project_certifications_org_id ON project_certifications(org_id);
ALTER TABLE project_certifications ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS project_certifications_updated_at ON project_certifications;
CREATE TRIGGER project_certifications_updated_at
  BEFORE UPDATE ON project_certifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- PART 3: RLS Policies — Project Certifications
-- ============================================================

DROP POLICY IF EXISTS "Users can view certifications in their org" ON project_certifications;
CREATE POLICY "Users can view certifications in their org"
  ON project_certifications FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert certifications in their org" ON project_certifications;
CREATE POLICY "Users can insert certifications in their org"
  ON project_certifications FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = project_certifications.org_id
        AND role IN ('owner', 'admin', 'architect', 'builder')
    )
  );

DROP POLICY IF EXISTS "Cert creators and admins can update certifications" ON project_certifications;
CREATE POLICY "Cert creators and admins can update certifications"
  ON project_certifications FOR UPDATE
  USING (
    org_id = get_user_org_id()
    AND (
      created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE user_id = auth.uid() AND org_id = project_certifications.org_id AND role IN ('owner', 'admin')
      )
    )
  );


-- ============================================================
-- PART 4: Storage Bucket
-- ============================================================
-- Note: Run via Supabase Dashboard or supabase CLI:
--   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
--   VALUES (
--     'engineering-certs',
--     'engineering-certs',
--     false,
--     104857600,
--     ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
--   )
--   ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- DONE
-- ============================================================
SELECT 'CERTIFICATIONS MIGRATION COMPLETE' AS status,
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS public_tables;
-- AI Usage Log: tracks every AI call for cost monitoring and debugging
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  check_id UUID REFERENCES compliance_checks(id) ON DELETE SET NULL,
  ai_function TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  was_fallback BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying by org and time
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_org_created ON ai_usage_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_check ON ai_usage_log(check_id) WHERE check_id IS NOT NULL;

-- RLS: org-scoped SELECT only (inserts via service role)
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org AI usage" ON ai_usage_log;
CREATE POLICY "Users can view own org AI usage"
  ON ai_usage_log FOR SELECT
  USING (org_id = get_user_org_id());
-- Enhanced RAG: add full-text search vector + improved hybrid search

-- Add TSVECTOR column for full-text search (generated from content)
ALTER TABLE document_embeddings
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_document_embeddings_search_vector
  ON document_embeddings USING GIN (search_vector);

-- Replace match_documents_hybrid with improved version using ts_rank
CREATE OR REPLACE FUNCTION match_documents_hybrid(
  query_embedding VECTOR(1536),
  query_text TEXT DEFAULT '',
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_org_id UUID DEFAULT NULL,
  filter_source_type TEXT DEFAULT NULL,
  filter_source_id UUID DEFAULT NULL,
  include_system BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  source_type TEXT,
  source_id UUID,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  ts_query TSQUERY;
BEGIN
  -- Build tsquery from the text query (if provided)
  IF query_text <> '' THEN
    ts_query := plainto_tsquery('english', query_text);
  ELSE
    ts_query := NULL;
  END IF;

  RETURN QUERY
  SELECT
    doc.id,
    doc.content,
    doc.metadata,
    doc.source_type,
    doc.source_id,
    doc.chunk_index,
    -- Blended score: 70% cosine similarity + 30% full-text rank
    CASE
      WHEN ts_query IS NOT NULL AND doc.search_vector @@ ts_query THEN
        (0.7 * (1 - (doc.embedding <=> query_embedding))
         + 0.3 * ts_rank(doc.search_vector, ts_query))::FLOAT
      ELSE
        (1 - (doc.embedding <=> query_embedding))::FLOAT
    END AS similarity
  FROM document_embeddings doc
  WHERE (1 - (doc.embedding <=> query_embedding)) > match_threshold
    AND (
      (filter_org_id IS NULL OR doc.org_id = filter_org_id)
      OR (include_system AND doc.org_id = '00000000-0000-0000-0000-000000000000'::uuid)
    )
    AND (filter_source_type IS NULL OR doc.source_type = filter_source_type)
    AND (filter_source_id IS NULL OR doc.source_id = filter_source_id)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
-- Cross-validation columns on compliance_findings
ALTER TABLE compliance_findings
  ADD COLUMN IF NOT EXISTS validation_tier SMALLINT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS agreement_score FLOAT,
  ADD COLUMN IF NOT EXISTS secondary_model TEXT,
  ADD COLUMN IF NOT EXISTS was_reconciled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_chunk_ids UUID[] DEFAULT '{}';
-- Finding-level feedback for continuous improvement
CREATE TABLE IF NOT EXISTS finding_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES compliance_findings(id) ON DELETE CASCADE,
  check_id UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= -1 AND rating <= 1),
  correction_severity TEXT CHECK (correction_severity IN ('compliant', 'advisory', 'non_compliant', 'critical')),
  correction_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finding_feedback_finding ON finding_feedback(finding_id);
CREATE INDEX IF NOT EXISTS idx_finding_feedback_org ON finding_feedback(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finding_feedback_check ON finding_feedback(check_id);

-- RLS
ALTER TABLE finding_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org feedback" ON finding_feedback;
CREATE POLICY "Users can view own org feedback"
  ON finding_feedback FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert own org feedback" ON finding_feedback;
CREATE POLICY "Users can insert own org feedback"
  ON finding_feedback FOR INSERT
  WITH CHECK (org_id = get_user_org_id() AND user_id = auth.uid());

-- Materialized view for model performance dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS model_performance AS
SELECT
  model_id,
  ai_function,
  COUNT(*) AS total_calls,
  ROUND(AVG(latency_ms)) AS avg_latency_ms,
  ROUND(AVG(estimated_cost_usd)::numeric, 6) AS avg_cost_usd,
  COUNT(*) FILTER (WHERE was_fallback) AS fallback_count,
  MAX(created_at) AS last_used_at
FROM ai_usage_log
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY model_id, ai_function;

-- Index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_performance_pk
  ON model_performance(model_id, ai_function);

-- Refresh function (call from cron or after checks)
CREATE OR REPLACE FUNCTION refresh_model_performance()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY model_performance;
END;
$$;
-- Migration: Compliance Workflow — From Scorecard to Work Orders
-- Adds contributor management, finding review workflow, and activity logging.

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
CREATE TYPE contributor_discipline AS ENUM (
  'architect',
  'structural_engineer',
  'hydraulic_engineer',
  'energy_consultant',
  'building_surveyor',
  'geotechnical_engineer',
  'acoustic_engineer',
  'fire_engineer',
  'landscape_architect',
  'builder',
  'other'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE TYPE finding_review_status AS ENUM (
  'pending',
  'accepted',
  'amended',
  'rejected',
  'sent'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: project_contributors
-- External contacts (not platform users) assigned to a project.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  discipline contributor_discipline NOT NULL DEFAULT 'other',
  company_name TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_contributors_project ON project_contributors(project_id);
CREATE INDEX IF NOT EXISTS idx_project_contributors_org ON project_contributors(org_id);

ALTER TABLE project_contributors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contributors visible to org members" ON project_contributors;
CREATE POLICY "Contributors visible to org members"
  ON project_contributors FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Contributors manageable by org members" ON project_contributors;
CREATE POLICY "Contributors manageable by org members"
  ON project_contributors FOR INSERT
  WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Contributors updatable by org members" ON project_contributors;
CREATE POLICY "Contributors updatable by org members"
  ON project_contributors FOR UPDATE
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Contributors deletable by org members" ON project_contributors;
CREATE POLICY "Contributors deletable by org members"
  ON project_contributors FOR DELETE
  USING (org_id = get_user_org_id());

-- ============================================================
-- ALTER: compliance_findings — add workflow columns
-- All nullable for backwards compatibility with existing findings.
-- ============================================================

ALTER TABLE compliance_findings
  ADD COLUMN IF NOT EXISTS responsible_discipline contributor_discipline,
  ADD COLUMN IF NOT EXISTS assigned_contributor_id UUID REFERENCES project_contributors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remediation_action TEXT,
  ADD COLUMN IF NOT EXISTS review_status finding_review_status,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS amended_description TEXT,
  ADD COLUMN IF NOT EXISTS amended_action TEXT,
  ADD COLUMN IF NOT EXISTS amended_discipline contributor_discipline,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_compliance_findings_review_status ON compliance_findings(review_status)
  WHERE review_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_findings_discipline ON compliance_findings(responsible_discipline)
  WHERE responsible_discipline IS NOT NULL;

-- ============================================================
-- TABLE: finding_activity_log — lightweight audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS finding_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES compliance_findings(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finding_activity_log_finding ON finding_activity_log(finding_id);

ALTER TABLE finding_activity_log ENABLE ROW LEVEL SECURITY;

-- Activity log inherits visibility from the finding's check → org scope.
-- Using a subquery to check org ownership through the chain.
DROP POLICY IF EXISTS "Activity log visible to org members" ON finding_activity_log;
CREATE POLICY "Activity log visible to org members"
  ON finding_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM compliance_findings cf
      JOIN compliance_checks cc ON cc.id = cf.check_id
      WHERE cf.id = finding_activity_log.finding_id
        AND cc.org_id = get_user_org_id()
    )
  );

DROP POLICY IF EXISTS "Activity log insertable by org members" ON finding_activity_log;
CREATE POLICY "Activity log insertable by org members"
  ON finding_activity_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM compliance_findings cf
      JOIN compliance_checks cc ON cc.id = cf.check_id
      WHERE cf.id = finding_activity_log.finding_id
        AND cc.org_id = get_user_org_id()
    )
  );
-- Migration 00013: Role system, invitations, and CRUD completeness RLS
-- Adds project_manager role, org_invitations table, and missing DELETE policies

-- ============================================================
-- 1. Add project_manager to user_role enum
-- ============================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'project_manager' AFTER 'admin';

-- ============================================================
-- 2. Create invitation_status enum
-- ============================================================
DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. Create org_invitations table
-- ============================================================
CREATE TABLE IF NOT EXISTS org_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        user_role NOT NULL DEFAULT 'viewer',
  invited_by  uuid NOT NULL REFERENCES profiles(id),
  status      invitation_status NOT NULL DEFAULT 'pending',
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_pending_invite UNIQUE (org_id, email, status)
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);

-- ============================================================
-- 4. RLS for org_invitations
-- ============================================================
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- Owners and admins can view invitations for their org
DROP POLICY IF EXISTS "org_invitations_select" ON org_invitations;
CREATE POLICY "org_invitations_select" ON org_invitations
  FOR SELECT USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.org_id = org_invitations.org_id
        AND profiles.role IN ('owner', 'admin')
    )
  );

-- Owners and admins can create invitations
DROP POLICY IF EXISTS "org_invitations_insert" ON org_invitations;
CREATE POLICY "org_invitations_insert" ON org_invitations
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.org_id = org_invitations.org_id
        AND profiles.role IN ('owner', 'admin')
    )
  );

-- Owners and admins can update invitations (revoke, etc.)
DROP POLICY IF EXISTS "org_invitations_update" ON org_invitations;
CREATE POLICY "org_invitations_update" ON org_invitations
  FOR UPDATE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.org_id = org_invitations.org_id
        AND profiles.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 5. Missing DELETE RLS policies for CRUD completeness
--    Requires: 00002 (compliance_checks/findings), 00003 (rd_experiments),
--              00007 (project_certifications) to have been run first.
-- ============================================================

-- compliance_checks: owner/admin can delete
DROP POLICY IF EXISTS "compliance_checks_delete" ON compliance_checks;
CREATE POLICY "compliance_checks_delete" ON compliance_checks
  FOR DELETE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.org_id = compliance_checks.org_id
        AND profiles.role IN ('owner', 'admin')
    )
  );

-- compliance_findings: delete via check ownership
DROP POLICY IF EXISTS "compliance_findings_delete" ON compliance_findings;
CREATE POLICY "compliance_findings_delete" ON compliance_findings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM compliance_checks cc
      JOIN profiles p ON p.user_id = auth.uid() AND p.org_id = cc.org_id
      WHERE cc.id = compliance_findings.check_id
        AND p.role IN ('owner', 'admin')
    )
  );

-- project_certifications: owner/admin/project_manager can delete
DROP POLICY IF EXISTS "project_certifications_delete" ON project_certifications;
CREATE POLICY "project_certifications_delete" ON project_certifications
  FOR DELETE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.org_id = project_certifications.org_id
        AND profiles.role IN ('owner', 'admin', 'project_manager')
    )
  );

-- rd_experiments: org members can delete their org's experiments
DROP POLICY IF EXISTS "rd_experiments_delete" ON rd_experiments;
CREATE POLICY "rd_experiments_delete" ON rd_experiments
  FOR DELETE USING (
    org_id = get_user_org_id()
  );
