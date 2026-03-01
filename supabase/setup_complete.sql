-- ============================================================
-- MMC Build — Complete Supabase Setup
-- ============================================================
-- Run this in the Supabase SQL Editor (https://skyeqimwnyuuozvhubdc.supabase.co)
-- Dashboard → SQL Editor → New Query → Paste & Run
--
-- This script sets up:
--   1. Extensions (uuid-ossp, pgvector)
--   2. Enums (user_role, project_status)
--   3. Core tables (organisations, profiles, projects, project_members)
--   4. RLS policies (org-scoped access)
--   5. Helper functions & triggers
--   6. Storage buckets (plan-uploads, reports, rd-evidence)
--   7. Storage RLS policies
--   8. Auth URL configuration function
--   9. Feedback table (for AI output feedback)
--  10. Audit log table (compliance action trail)
-- ============================================================


-- ============================================================
-- PART 1: Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";


-- ============================================================
-- PART 2: Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'owner', 'admin', 'architect', 'builder', 'trade', 'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM (
    'draft', 'active', 'completed', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- PART 3: Core Tables
-- ============================================================

-- Organisations
CREATE TABLE IF NOT EXISTS organisations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  abn         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

-- Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'viewer',
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles(org_id);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  status      project_status NOT NULL DEFAULT 'draft',
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Project Members
CREATE TABLE IF NOT EXISTS project_members (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'viewer',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, profile_id)
);
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- Feedback (for AI output ratings)
CREATE TABLE IF NOT EXISTS feedback (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  feature       TEXT NOT NULL,
  rating        SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  comment       TEXT,
  ai_output_id  UUID,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_feature ON feedback(feature);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Audit Log (compliance action trail)
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  details     JSONB DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_id ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PART 4: Helper Functions
-- ============================================================

-- Get current authenticated user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS organisations_updated_at ON organisations;
CREATE TRIGGER organisations_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- PART 5: RLS Policies — Organisations
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own organisation" ON organisations;
CREATE POLICY "Users can view their own organisation"
  ON organisations FOR SELECT
  USING (id = get_user_org_id());

DROP POLICY IF EXISTS "Owners can update their organisation" ON organisations;
CREATE POLICY "Owners can update their organisation"
  ON organisations FOR UPDATE
  USING (id = get_user_org_id())
  WITH CHECK (
    id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = id AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Service role can insert organisations" ON organisations;
CREATE POLICY "Service role can insert organisations"
  ON organisations FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- PART 6: RLS Policies — Profiles
-- ============================================================
DROP POLICY IF EXISTS "Users can view profiles in their org" ON profiles;
CREATE POLICY "Users can view profiles in their org"
  ON profiles FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can insert profiles (invites)" ON profiles;
CREATE POLICY "Admins can insert profiles (invites)"
  ON profiles FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.org_id = profiles.org_id AND p.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Allow first profile creation" ON profiles;
CREATE POLICY "Allow first profile creation"
  ON profiles FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.user_id = auth.uid()
    )
  );


-- ============================================================
-- PART 7: RLS Policies — Projects
-- ============================================================
DROP POLICY IF EXISTS "Users can view projects in their org" ON projects;
CREATE POLICY "Users can view projects in their org"
  ON projects FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users with create permissions can insert projects" ON projects;
CREATE POLICY "Users with create permissions can insert projects"
  ON projects FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = projects.org_id
        AND role IN ('owner', 'admin', 'architect', 'builder')
    )
  );

DROP POLICY IF EXISTS "Project creators and admins can update projects" ON projects;
CREATE POLICY "Project creators and admins can update projects"
  ON projects FOR UPDATE
  USING (
    org_id = get_user_org_id()
    AND (
      created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE user_id = auth.uid() AND org_id = projects.org_id AND role IN ('owner', 'admin')
      )
    )
  );

DROP POLICY IF EXISTS "Admins can delete projects" ON projects;
CREATE POLICY "Admins can delete projects"
  ON projects FOR DELETE
  USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = projects.org_id AND role IN ('owner', 'admin')
    )
  );


-- ============================================================
-- PART 8: RLS Policies — Project Members
-- ============================================================
DROP POLICY IF EXISTS "Users can view project members in their org" ON project_members;
CREATE POLICY "Users can view project members in their org"
  ON project_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_members.project_id
        AND projects.org_id = get_user_org_id()
    )
  );

DROP POLICY IF EXISTS "Admins can manage project members" ON project_members;
CREATE POLICY "Admins can manage project members"
  ON project_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      JOIN profiles ON profiles.org_id = projects.org_id
      WHERE projects.id = project_members.project_id
        AND profiles.user_id = auth.uid()
        AND profiles.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can remove project members" ON project_members;
CREATE POLICY "Admins can remove project members"
  ON project_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      JOIN profiles ON profiles.org_id = projects.org_id
      WHERE projects.id = project_members.project_id
        AND profiles.user_id = auth.uid()
        AND profiles.role IN ('owner', 'admin')
    )
  );


-- ============================================================
-- PART 9: RLS Policies — Feedback
-- ============================================================
DROP POLICY IF EXISTS "Users can view own feedback" ON feedback;
CREATE POLICY "Users can view own feedback"
  ON feedback FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert feedback" ON feedback;
CREATE POLICY "Users can insert feedback"
  ON feedback FOR INSERT
  WITH CHECK (user_id = auth.uid() AND org_id = get_user_org_id());

DROP POLICY IF EXISTS "Admins can view org feedback" ON feedback;
CREATE POLICY "Admins can view org feedback"
  ON feedback FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = feedback.org_id AND role IN ('owner', 'admin')
    )
  );


-- ============================================================
-- PART 10: RLS Policies — Audit Log
-- ============================================================
DROP POLICY IF EXISTS "Admins can view org audit log" ON audit_log;
CREATE POLICY "Admins can view org audit log"
  ON audit_log FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = audit_log.org_id AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "System can insert audit log" ON audit_log;
CREATE POLICY "System can insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- PART 11: Storage Buckets
-- ============================================================
-- plan-uploads: Building plan PDFs uploaded by users
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'plan-uploads',
  'plan-uploads',
  false,
  52428800,  -- 50MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- reports: Generated compliance/optimisation/quote reports
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reports',
  'reports',
  false,
  26214400,  -- 25MB
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- rd-evidence: R&D Tax Incentive evidence artifacts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rd-evidence',
  'rd-evidence',
  false,
  52428800,  -- 50MB
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- supplier-data: Supplier price lists and specs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-data',
  'supplier-data',
  false,
  26214400,  -- 25MB
  ARRAY[
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- training-content: Course materials (video, docs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-content',
  'training-content',
  true,  -- public for course content delivery
  104857600,  -- 100MB for video
  ARRAY[
    'application/pdf',
    'video/mp4',
    'video/webm',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ============================================================
-- PART 12: Storage RLS Policies
-- ============================================================

-- plan-uploads: Users can upload to their org folder, view own org files
DROP POLICY IF EXISTS "Org members can upload plans" ON storage.objects;
CREATE POLICY "Org members can upload plans"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'plan-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

DROP POLICY IF EXISTS "Org members can view plans" ON storage.objects;
CREATE POLICY "Org members can view plans"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'plan-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

DROP POLICY IF EXISTS "Org admins can delete plans" ON storage.objects;
CREATE POLICY "Org admins can delete plans"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'plan-uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- reports: Same org-scoped pattern
DROP POLICY IF EXISTS "Org members can view reports" ON storage.objects;
CREATE POLICY "Org members can view reports"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reports'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

DROP POLICY IF EXISTS "System can create reports" ON storage.objects;
CREATE POLICY "System can create reports"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'reports'
  );

-- rd-evidence: Org-scoped
DROP POLICY IF EXISTS "Org members can upload evidence" ON storage.objects;
CREATE POLICY "Org members can upload evidence"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'rd-evidence'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

DROP POLICY IF EXISTS "Org members can view evidence" ON storage.objects;
CREATE POLICY "Org members can view evidence"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'rd-evidence'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

-- supplier-data: Org-scoped upload, org-scoped view
DROP POLICY IF EXISTS "Admins can upload supplier data" ON storage.objects;
CREATE POLICY "Admins can upload supplier data"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'supplier-data'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Org members can view supplier data" ON storage.objects;
CREATE POLICY "Org members can view supplier data"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'supplier-data'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

-- training-content: Public read (bucket is public), admin write
DROP POLICY IF EXISTS "Anyone can view training content" ON storage.objects;
CREATE POLICY "Anyone can view training content"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-content');

DROP POLICY IF EXISTS "Admins can upload training content" ON storage.objects;
CREATE POLICY "Admins can upload training content"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'training-content'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );


-- ============================================================
-- PART 13: Vector similarity search function (for RAG)
-- ============================================================
-- This will be used by the compliance engine and knowledge base queries.
-- The embeddings table will be created in Stage 1, but the function
-- is defined here as infrastructure.

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_metadata JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    doc.id,
    doc.content,
    doc.metadata,
    1 - (doc.embedding <=> query_embedding) AS similarity
  FROM document_embeddings doc
  WHERE 1 - (doc.embedding <=> query_embedding) > match_threshold
    AND (filter_metadata = '{}' OR doc.metadata @> filter_metadata)
  ORDER BY doc.embedding <=> query_embedding
  LIMIT match_count;
EXCEPTION
  WHEN undefined_table THEN
    -- document_embeddings table doesn't exist yet (created in Stage 1)
    RETURN;
END;
$$;


-- ============================================================
-- PART 14: Utility RPC functions
-- ============================================================

-- Get current user's profile (used by dashboard header and client-side)
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id', p.id,
    'org_id', p.org_id,
    'user_id', p.user_id,
    'role', p.role,
    'full_name', p.full_name,
    'email', p.email,
    'org_name', o.name,
    'org_abn', o.abn
  ) INTO result
  FROM profiles p
  JOIN organisations o ON o.id = p.org_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  RETURN result;
END;
$$;

-- Check if current user has a specific role or higher
CREATE OR REPLACE FUNCTION user_has_role(required_role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND CASE
      WHEN required_role = 'viewer' THEN true
      WHEN required_role = 'trade' THEN role IN ('trade', 'builder', 'architect', 'admin', 'owner')
      WHEN required_role = 'builder' THEN role IN ('builder', 'architect', 'admin', 'owner')
      WHEN required_role = 'architect' THEN role IN ('architect', 'admin', 'owner')
      WHEN required_role = 'admin' THEN role IN ('admin', 'owner')
      WHEN required_role = 'owner' THEN role = 'owner'
      ELSE false
    END
  );
$$;


-- ============================================================
-- PART 15: Stage 1 — MMC Comply Tables
-- ============================================================

-- New enums for compliance module
DO $$ BEGIN
  CREATE TYPE plan_status AS ENUM ('uploading', 'processing', 'ready', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE check_status AS ENUM ('queued', 'processing', 'completed', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE finding_severity AS ENUM ('compliant', 'advisory', 'non_compliant', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  page_count      INT,
  status          plan_status NOT NULL DEFAULT 'uploading',
  created_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_project_id ON plans(project_id);
CREATE INDEX IF NOT EXISTS idx_plans_org_id ON plans(org_id);
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS plans_updated_at ON plans;
CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Questionnaire Responses
CREATE TABLE IF NOT EXISTS questionnaire_responses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  responses   JSONB NOT NULL DEFAULT '{}',
  completed   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_project_id ON questionnaire_responses(project_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_org_id ON questionnaire_responses(org_id);
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS questionnaire_responses_updated_at ON questionnaire_responses;
CREATE TRIGGER questionnaire_responses_updated_at
  BEFORE UPDATE ON questionnaire_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Compliance Checks
CREATE TABLE IF NOT EXISTS compliance_checks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  plan_id           UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  questionnaire_id  UUID REFERENCES questionnaire_responses(id) ON DELETE SET NULL,
  status            check_status NOT NULL DEFAULT 'queued',
  summary           TEXT,
  overall_risk      risk_level,
  error_message     TEXT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_by        UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_project_id ON compliance_checks(project_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_org_id ON compliance_checks(org_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_plan_id ON compliance_checks(plan_id);
ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS compliance_checks_updated_at ON compliance_checks;
CREATE TRIGGER compliance_checks_updated_at
  BEFORE UPDATE ON compliance_checks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Compliance Findings
CREATE TABLE IF NOT EXISTS compliance_findings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_id        UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  ncc_section     TEXT NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  recommendation  TEXT,
  severity        finding_severity NOT NULL DEFAULT 'advisory',
  confidence      FLOAT NOT NULL DEFAULT 0.0,
  ncc_citation    TEXT,
  page_references INT[] DEFAULT '{}',
  sort_order      INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_check_id ON compliance_findings(check_id);
ALTER TABLE compliance_findings ENABLE ROW LEVEL SECURITY;

-- Document Embeddings (RAG)
CREATE TABLE IF NOT EXISTS document_embeddings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id   UUID NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  content     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_org_id ON document_embeddings(org_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_source ON document_embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_embedding
  ON document_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS document_embeddings_updated_at ON document_embeddings;
CREATE TRIGGER document_embeddings_updated_at
  BEFORE UPDATE ON document_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- PART 16: Stage 1 RLS Policies
-- ============================================================

-- Plans RLS
DROP POLICY IF EXISTS "Users can view plans in their org" ON plans;
CREATE POLICY "Users can view plans in their org"
  ON plans FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert plans in their org" ON plans;
CREATE POLICY "Users can insert plans in their org"
  ON plans FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND org_id = plans.org_id
        AND role IN ('owner', 'admin', 'architect', 'builder')
    )
  );

DROP POLICY IF EXISTS "Plan creators and admins can update plans" ON plans;
CREATE POLICY "Plan creators and admins can update plans"
  ON plans FOR UPDATE USING (
    org_id = get_user_org_id()
    AND (
      created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND org_id = plans.org_id AND role IN ('owner', 'admin'))
    )
  );

DROP POLICY IF EXISTS "Admins can delete plans" ON plans;
CREATE POLICY "Admins can delete plans"
  ON plans FOR DELETE USING (
    org_id = get_user_org_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND org_id = plans.org_id AND role IN ('owner', 'admin'))
  );

-- Questionnaire Responses RLS
DROP POLICY IF EXISTS "Users can view questionnaires in their org" ON questionnaire_responses;
CREATE POLICY "Users can view questionnaires in their org"
  ON questionnaire_responses FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert questionnaires in their org" ON questionnaire_responses;
CREATE POLICY "Users can insert questionnaires in their org"
  ON questionnaire_responses FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND org_id = questionnaire_responses.org_id
        AND role IN ('owner', 'admin', 'architect', 'builder')
    )
  );

DROP POLICY IF EXISTS "Users can update questionnaires in their org" ON questionnaire_responses;
CREATE POLICY "Users can update questionnaires in their org"
  ON questionnaire_responses FOR UPDATE USING (
    org_id = get_user_org_id()
    AND (
      created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND org_id = questionnaire_responses.org_id AND role IN ('owner', 'admin'))
    )
  );

-- Compliance Checks RLS
DROP POLICY IF EXISTS "Users can view compliance checks in their org" ON compliance_checks;
CREATE POLICY "Users can view compliance checks in their org"
  ON compliance_checks FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert compliance checks in their org" ON compliance_checks;
CREATE POLICY "Users can insert compliance checks in their org"
  ON compliance_checks FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND org_id = compliance_checks.org_id
        AND role IN ('owner', 'admin', 'architect', 'builder')
    )
  );

DROP POLICY IF EXISTS "System can update compliance checks" ON compliance_checks;
CREATE POLICY "System can update compliance checks"
  ON compliance_checks FOR UPDATE
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- Compliance Findings RLS
DROP POLICY IF EXISTS "Users can view findings via check org" ON compliance_findings;
CREATE POLICY "Users can view findings via check org"
  ON compliance_findings FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM compliance_checks
      WHERE compliance_checks.id = compliance_findings.check_id
        AND compliance_checks.org_id = get_user_org_id()
    )
  );

DROP POLICY IF EXISTS "System can insert findings" ON compliance_findings;
CREATE POLICY "System can insert findings"
  ON compliance_findings FOR INSERT WITH CHECK (true);

-- Document Embeddings RLS
DROP POLICY IF EXISTS "Users can view embeddings in their org" ON document_embeddings;
CREATE POLICY "Users can view embeddings in their org"
  ON document_embeddings FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "System can insert embeddings" ON document_embeddings;
CREATE POLICY "System can insert embeddings"
  ON document_embeddings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "System can delete embeddings" ON document_embeddings;
CREATE POLICY "System can delete embeddings"
  ON document_embeddings FOR DELETE USING (true);


-- ============================================================
-- PART 17: Hybrid Search RPC
-- ============================================================

CREATE OR REPLACE FUNCTION match_documents_hybrid(
  query_embedding VECTOR(1536),
  query_text TEXT DEFAULT '',
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_org_id UUID DEFAULT NULL,
  filter_source_type TEXT DEFAULT NULL,
  filter_source_id UUID DEFAULT NULL
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
BEGIN
  RETURN QUERY
  SELECT
    doc.id, doc.content, doc.metadata, doc.source_type, doc.source_id, doc.chunk_index,
    1 - (doc.embedding <=> query_embedding) AS similarity
  FROM document_embeddings doc
  WHERE 1 - (doc.embedding <=> query_embedding) > match_threshold
    AND (filter_org_id IS NULL OR doc.org_id = filter_org_id)
    AND (filter_source_type IS NULL OR doc.source_type = filter_source_type)
    AND (filter_source_id IS NULL OR doc.source_id = filter_source_id)
    AND (query_text = '' OR doc.content ILIKE '%' || query_text || '%')
  ORDER BY doc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- ============================================================
-- PART 18: Knowledge Bases + R&D Time Tracking (Stage 2)
-- ============================================================

-- New enums
DO $$ BEGIN
  CREATE TYPE kb_scope AS ENUM ('system', 'org');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE kb_document_status AS ENUM ('pending', 'processing', 'ready', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rd_tag AS ENUM ('core_rd', 'rd_supporting', 'not_eligible');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE experiment_status AS ENUM ('planned', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- System sentinel organisation
INSERT INTO organisations (id, name, abn)
VALUES ('00000000-0000-0000-0000-000000000000', 'MMC Build System', NULL)
ON CONFLICT (id) DO NOTHING;

-- Knowledge Bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'reference',
  scope       kb_scope NOT NULL DEFAULT 'org',
  org_id      UUID REFERENCES organisations(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_org_id ON knowledge_bases(org_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_slug ON knowledge_bases(slug);
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS knowledge_bases_updated_at ON knowledge_bases;
CREATE TRIGGER knowledge_bases_updated_at
  BEFORE UPDATE ON knowledge_bases FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Knowledge Documents
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kb_id           UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  page_count      INT,
  chunk_count     INT DEFAULT 0,
  status          kb_document_status NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_kb_id ON knowledge_documents(kb_id);
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- KB RLS
DROP POLICY IF EXISTS "Users can view system KBs" ON knowledge_bases;
CREATE POLICY "Users can view system KBs" ON knowledge_bases FOR SELECT USING (scope = 'system');

DROP POLICY IF EXISTS "Users can view org KBs" ON knowledge_bases;
CREATE POLICY "Users can view org KBs" ON knowledge_bases FOR SELECT USING (scope = 'org' AND org_id = get_user_org_id());

DROP POLICY IF EXISTS "System can manage KBs" ON knowledge_bases;
CREATE POLICY "System can manage KBs" ON knowledge_bases FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view system KB docs" ON knowledge_documents;
CREATE POLICY "Users can view system KB docs" ON knowledge_documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM knowledge_bases WHERE knowledge_bases.id = knowledge_documents.kb_id AND knowledge_bases.scope = 'system'));

DROP POLICY IF EXISTS "Users can view org KB docs" ON knowledge_documents;
CREATE POLICY "Users can view org KB docs" ON knowledge_documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM knowledge_bases WHERE knowledge_bases.id = knowledge_documents.kb_id AND knowledge_bases.scope = 'org' AND knowledge_bases.org_id = get_user_org_id()));

DROP POLICY IF EXISTS "System can manage KB docs" ON knowledge_documents;
CREATE POLICY "System can manage KB docs" ON knowledge_documents FOR ALL USING (true) WITH CHECK (true);

-- KB Uploads Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kb-uploads', 'kb-uploads', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can upload KB docs" ON storage.objects;
CREATE POLICY "Admins can upload KB docs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'kb-uploads' AND auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

DROP POLICY IF EXISTS "Authenticated users can view KB docs" ON storage.objects;
CREATE POLICY "Authenticated users can view KB docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'kb-uploads' AND auth.role() = 'authenticated');

-- Updated hybrid search with include_system parameter
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
RETURNS TABLE (id UUID, content TEXT, metadata JSONB, source_type TEXT, source_id UUID, chunk_index INT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT doc.id, doc.content, doc.metadata, doc.source_type, doc.source_id, doc.chunk_index,
    1 - (doc.embedding <=> query_embedding) AS similarity
  FROM document_embeddings doc
  WHERE 1 - (doc.embedding <=> query_embedding) > match_threshold
    AND ((filter_org_id IS NULL OR doc.org_id = filter_org_id) OR (include_system AND doc.org_id = '00000000-0000-0000-0000-000000000000'::uuid))
    AND (filter_source_type IS NULL OR doc.source_type = filter_source_type)
    AND (filter_source_id IS NULL OR doc.source_id = filter_source_id)
    AND (query_text = '' OR doc.content ILIKE '%' || query_text || '%')
  ORDER BY doc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- R&D Time Entries
CREATE TABLE IF NOT EXISTS rd_time_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  hours       DECIMAL(4,1) NOT NULL CHECK (hours > 0 AND hours <= 24),
  stage       TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  rd_tag      rd_tag NOT NULL DEFAULT 'not_eligible',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rd_time_entries_org_id ON rd_time_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_rd_time_entries_profile_id ON rd_time_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_rd_time_entries_date ON rd_time_entries(date);
ALTER TABLE rd_time_entries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS rd_time_entries_updated_at ON rd_time_entries;
CREATE TRIGGER rd_time_entries_updated_at
  BEFORE UPDATE ON rd_time_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- R&D Experiments
CREATE TABLE IF NOT EXISTS rd_experiments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  hypothesis  TEXT NOT NULL,
  methodology TEXT,
  outcome     TEXT,
  status      experiment_status NOT NULL DEFAULT 'planned',
  stage       TEXT,
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rd_experiments_org_id ON rd_experiments(org_id);
ALTER TABLE rd_experiments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS rd_experiments_updated_at ON rd_experiments;
CREATE TRIGGER rd_experiments_updated_at
  BEFORE UPDATE ON rd_experiments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- R&D RLS
DROP POLICY IF EXISTS "Users can view time entries in their org" ON rd_time_entries;
CREATE POLICY "Users can view time entries in their org" ON rd_time_entries FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert their own time entries" ON rd_time_entries;
CREATE POLICY "Users can insert their own time entries" ON rd_time_entries FOR INSERT WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can update their own time entries" ON rd_time_entries;
CREATE POLICY "Users can update their own time entries" ON rd_time_entries FOR UPDATE
  USING (org_id = get_user_org_id() AND profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own time entries" ON rd_time_entries;
CREATE POLICY "Users can delete their own time entries" ON rd_time_entries FOR DELETE
  USING (org_id = get_user_org_id() AND profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view experiments in their org" ON rd_experiments;
CREATE POLICY "Users can view experiments in their org" ON rd_experiments FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert experiments" ON rd_experiments;
CREATE POLICY "Users can insert experiments" ON rd_experiments FOR INSERT WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can update experiments in their org" ON rd_experiments;
CREATE POLICY "Users can update experiments in their org" ON rd_experiments FOR UPDATE USING (org_id = get_user_org_id());


-- ============================================================
-- DONE
-- ============================================================
-- Verify setup ran correctly:
SELECT 'SETUP COMPLETE' AS status,
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS public_tables,
  (SELECT count(*) FROM pg_policies) AS rls_policies,
  (SELECT count(*) FROM storage.buckets) AS storage_buckets;
