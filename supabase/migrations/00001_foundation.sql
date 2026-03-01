-- MMC Build Foundation Schema
-- Stage 0: Organisations, Profiles, Projects, Project Members with RLS

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enums
CREATE TYPE user_role AS ENUM (
  'owner',
  'admin',
  'architect',
  'builder',
  'trade',
  'viewer'
);

CREATE TYPE project_status AS ENUM (
  'draft',
  'active',
  'completed',
  'archived'
);

-- ============================================================
-- Organisations
-- ============================================================
CREATE TABLE organisations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  abn         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Profiles (linked to auth.users)
-- ============================================================
CREATE TABLE profiles (
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

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_org_id ON profiles(org_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Projects
-- ============================================================
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  status      project_status NOT NULL DEFAULT 'draft',
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org_id ON projects(org_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Project Members
-- ============================================================
CREATE TABLE project_members (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'viewer',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, profile_id)
);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper function: get current user's org_id
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- RLS Policies: Organisations
-- ============================================================
CREATE POLICY "Users can view their own organisation"
  ON organisations FOR SELECT
  USING (id = get_user_org_id());

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

-- Allow insert during signup (service role handles org creation)
CREATE POLICY "Service role can insert organisations"
  ON organisations FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- RLS Policies: Profiles
-- ============================================================
CREATE POLICY "Users can view profiles in their org"
  ON profiles FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert profiles (invites)"
  ON profiles FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = profiles.org_id AND role IN ('owner', 'admin')
    )
  );

-- Allow first profile creation during signup (no existing profile yet)
CREATE POLICY "Allow first profile creation"
  ON profiles FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- RLS Policies: Projects
-- ============================================================
CREATE POLICY "Users can view projects in their org"
  ON projects FOR SELECT
  USING (org_id = get_user_org_id());

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
-- RLS Policies: Project Members
-- ============================================================
CREATE POLICY "Users can view project members in their org"
  ON project_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_members.project_id
        AND projects.org_id = get_user_org_id()
    )
  );

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
-- Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organisations_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
