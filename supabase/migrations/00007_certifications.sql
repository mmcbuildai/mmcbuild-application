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
