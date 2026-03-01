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
-- DONE
-- ============================================================
-- Verify setup ran correctly:
SELECT 'SETUP COMPLETE' AS status,
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS public_tables,
  (SELECT count(*) FROM pg_policies) AS rls_policies,
  (SELECT count(*) FROM storage.buckets) AS storage_buckets;
