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
--    Wrapped in DO blocks so each policy is skipped if its table
--    doesn't exist yet (earlier migrations may not have been run).
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'compliance_checks') THEN
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
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'compliance_findings') THEN
    CREATE POLICY "compliance_findings_delete" ON compliance_findings
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM compliance_checks cc
          JOIN profiles p ON p.user_id = auth.uid() AND p.org_id = cc.org_id
          WHERE cc.id = compliance_findings.check_id
            AND p.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_certifications') THEN
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
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rd_experiments') THEN
    CREATE POLICY "rd_experiments_delete" ON rd_experiments
      FOR DELETE USING (
        org_id = get_user_org_id()
      );
  END IF;
END $$;
