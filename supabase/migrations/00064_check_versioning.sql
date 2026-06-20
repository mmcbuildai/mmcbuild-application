-- Migration: Compliance Check Versioning (Comply remediation convergence — Phase 3)
-- Turns the Phase-2 readiness banner into a real RE-CHECK: when the builder
-- re-runs compliance against the (optionally updated) design, the new check
-- chains to the prior one so the report can show a v1 -> v2 delta
-- (Cleared / Still-open / Newly-introduced).
--
--   parent_check_id -> the prior compliance_checks row this re-check supersedes.
--                      ON DELETE SET NULL so deleting an old check never cascades
--                      away its child re-check (the delta just loses its baseline).
--   version         -> 1 for an original check, parent.version + 1 for each re-check.
--
-- Fully idempotent: ADD COLUMN IF NOT EXISTS + a guarded index, so re-running is
-- a no-op.

ALTER TABLE compliance_checks
  ADD COLUMN IF NOT EXISTS parent_check_id UUID REFERENCES compliance_checks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Index the parent link: the report page looks up a check's parent (and could
-- enumerate a check's children) when rendering the delta.
CREATE INDEX IF NOT EXISTS idx_compliance_checks_parent_check_id
  ON compliance_checks(parent_check_id)
  WHERE parent_check_id IS NOT NULL;

COMMENT ON COLUMN compliance_checks.parent_check_id IS
  'The prior compliance_checks row this check is a re-check of. NULL for an original (v1) check. ON DELETE SET NULL so an old check can be deleted without removing its re-check.';
COMMENT ON COLUMN compliance_checks.version IS
  'Re-check version: 1 for the original, parent.version + 1 for each subsequent re-check in the convergence loop.';
