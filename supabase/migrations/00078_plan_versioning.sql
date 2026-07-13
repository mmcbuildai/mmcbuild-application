-- SCRUM-333 (Phase 2) — drawing-set version lineage.
--
-- Until now a revised drawing could not be re-uploaded: registerPlan rejected a
-- duplicate (project_id, file_name). To support "compile latest versions" + a
-- retained history, a re-upload of the same drawing slot now supersedes the
-- prior row instead of colliding. A "slot" is (project_id, file_name); the
-- current version is is_current = true; superseded rows chain via superseded_by.
--
-- Backward-compatible: every existing plan gets version = 1, is_current = true
-- (defaults), so current queries that don't filter is_current still see them.
-- Idempotent per the repo migration rule.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS version        INT         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current     BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_by  UUID        REFERENCES plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at  TIMESTAMPTZ;

COMMENT ON COLUMN plans.version IS 'Version number within the (project_id, file_name) slot; 1-based.';
COMMENT ON COLUMN plans.is_current IS 'True for the latest version in the slot; false once superseded.';
COMMENT ON COLUMN plans.superseded_by IS 'The newer plan row that replaced this one (null while current).';
COMMENT ON COLUMN plans.superseded_at IS 'When this version was superseded (null while current).';

-- The hot query is "current plans for a project" (the pack, the plan list).
CREATE INDEX IF NOT EXISTS idx_plans_project_current
  ON plans(project_id)
  WHERE is_current;

-- Retention (Phase 3) sweeps superseded rows by age.
CREATE INDEX IF NOT EXISTS idx_plans_superseded_at
  ON plans(superseded_at)
  WHERE superseded_at IS NOT NULL;
