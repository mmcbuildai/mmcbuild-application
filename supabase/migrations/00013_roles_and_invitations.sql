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
-- ============================================================

-- compliance_checks: owner/admin can delete
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

-- compliance_findings: delete via check ownership (cascading from check delete)
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
CREATE POLICY "rd_experiments_delete" ON rd_experiments
  FOR DELETE USING (
    org_id = get_user_org_id()
  );

-- ============================================================
-- 6. Update existing INSERT policies to include project_manager
--    (These are safe no-ops if the policies don't restrict by role,
--     since RLS on these tables uses get_user_org_id() org scoping)
-- ============================================================
-- Note: The existing INSERT policies use org_id = get_user_org_id()
-- which already allows any org member to insert. The project_manager
-- role is automatically included since it's in the user_role enum
-- and the RLS checks org membership, not specific roles.
-- No policy changes needed for INSERT on these tables.
