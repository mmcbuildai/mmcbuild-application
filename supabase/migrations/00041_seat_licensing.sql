-- ============================================================
-- 00041: Seat licensing — internal / external / viewer
-- ============================================================
-- Adds the data model behind the seat licensing decisions made in
-- the 2026-05-01 product review:
--   - Three seat types: internal (consumes a seat), external (project-
--     scoped uploader, no seat), viewer (project-scoped read-only,
--     no seat).
--   - Seat caps are enforced application-side based on subscription
--     tier (Essentials = 1, Professional = 5, Enterprise = unlimited).
--     Stripe quantity sync is intentionally deferred — beta usage
--     will inform whether to charge per-seat.
--
-- Phase 1 (this migration) adds the schema and lets project admins
-- invite users with a seat_type and optional project scope. Phase 2
-- will add RLS that enforces project-scoped access for external/
-- viewer roles.

-- 1. Add seat_type to profiles
DO $$ BEGIN
  CREATE TYPE seat_type AS ENUM ('internal', 'external', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seat_type seat_type NOT NULL DEFAULT 'internal';

COMMENT ON COLUMN profiles.seat_type IS
  'internal = full org access and counts against seat cap. external = project-scoped uploader, no seat. viewer = project-scoped read-only, no seat.';

-- 2. Add seat_type and project_ids to org_invitations
ALTER TABLE org_invitations
  ADD COLUMN IF NOT EXISTS seat_type seat_type NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS project_ids UUID[] DEFAULT '{}';

COMMENT ON COLUMN org_invitations.seat_type IS
  'Seat type the invited user will receive on acceptance.';
COMMENT ON COLUMN org_invitations.project_ids IS
  'For external/viewer invites: the projects this user will get access to. Ignored for internal invites.';

-- 3. project_user_access — links external / viewer users to specific projects
CREATE TABLE IF NOT EXISTS project_user_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role        seat_type NOT NULL CHECK (role IN ('external', 'viewer')),
  granted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_user_access_unique UNIQUE (project_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_project_user_access_project ON project_user_access(project_id);
CREATE INDEX IF NOT EXISTS idx_project_user_access_profile ON project_user_access(profile_id);
CREATE INDEX IF NOT EXISTS idx_project_user_access_org ON project_user_access(org_id);

ALTER TABLE project_user_access ENABLE ROW LEVEL SECURITY;

-- Read: org members can see their org's project access grants
CREATE POLICY "project_user_access_select" ON project_user_access
  FOR SELECT USING (org_id = get_user_org_id());

-- Insert/update/delete: owner/admin only
CREATE POLICY "project_user_access_insert" ON project_user_access
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.org_id = project_user_access.org_id
        AND profiles.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "project_user_access_delete" ON project_user_access
  FOR DELETE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.org_id = project_user_access.org_id
        AND profiles.role IN ('owner', 'admin')
    )
  );
