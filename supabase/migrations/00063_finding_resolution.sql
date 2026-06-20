-- Migration: Finding Resolution (Comply remediation convergence — Phase 2)
-- Adds the BUILDER-side acceptance of a non-compliant finding: after a
-- contributor has responded (remediation_status on finding_share_tokens), the
-- builder marks each finding RESOLVED (via updated drawings or evidence/cert)
-- or WAIVED (with a recorded reason). These columns are the builder's verdict,
-- distinct from the contributor's `remediation_status` reply.
--
-- A plain TEXT + CHECK constraint is used (not a new enum) to keep the migration
-- fully idempotent — re-running ADD COLUMN IF NOT EXISTS never conflicts.

ALTER TABLE compliance_findings
  ADD COLUMN IF NOT EXISTS resolution_type TEXT,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS waiver_reason TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Constrain resolution_type to the three locked resolve paths. Guarded so a
-- re-run does not error on the already-present constraint.
DO $$ BEGIN
  ALTER TABLE compliance_findings
    ADD CONSTRAINT compliance_findings_resolution_type_check
    CHECK (resolution_type IN ('updated_drawings', 'evidence', 'waiver'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partial index: the open-items board only ever queries resolved rows.
CREATE INDEX IF NOT EXISTS idx_compliance_findings_resolved
  ON compliance_findings(check_id)
  WHERE resolved_at IS NOT NULL;

COMMENT ON COLUMN compliance_findings.resolution_type IS
  'Builder resolve path: updated_drawings | evidence | waiver. NULL = not yet resolved/waived.';
COMMENT ON COLUMN compliance_findings.resolution_note IS
  'Optional builder note recorded when resolving via updated drawings or evidence/cert.';
COMMENT ON COLUMN compliance_findings.waiver_reason IS
  'Required reason recorded when the builder WAIVES a finding (resolution_type = waiver).';
COMMENT ON COLUMN compliance_findings.resolved_by IS
  'profiles.id of the builder who marked the finding resolved/waived.';
COMMENT ON COLUMN compliance_findings.resolved_at IS
  'Timestamp the finding was marked resolved/waived; NULL while open/responded.';
