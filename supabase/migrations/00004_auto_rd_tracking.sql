-- ============================================================
-- Migration 00004: Automated R&D Time Tracking
-- GitHub webhook integration + AI classification
-- ============================================================

-- ============================================================
-- PART 1: New Enums
-- ============================================================

DO $$ BEGIN
  CREATE TYPE commit_log_status AS ENUM ('pending', 'processing', 'classified', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- PART 2: rd_tracking_config — per-org webhook settings
-- ============================================================

CREATE TABLE IF NOT EXISTS rd_tracking_config (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                    UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  enabled                   BOOLEAN NOT NULL DEFAULT false,
  github_repo               TEXT,
  webhook_secret            TEXT,
  default_hours_per_commit  DECIMAL(3,1) NOT NULL DEFAULT 0.5,
  auto_approve_threshold    DECIMAL(3,2) NOT NULL DEFAULT 0.85,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rd_tracking_config_org_unique UNIQUE (org_id)
);

ALTER TABLE rd_tracking_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rd_tracking_config_select" ON rd_tracking_config
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "rd_tracking_config_insert" ON rd_tracking_config
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "rd_tracking_config_update" ON rd_tracking_config
  FOR UPDATE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );


-- ============================================================
-- PART 3: rd_commit_logs — raw commit data from GitHub
-- ============================================================

CREATE TABLE IF NOT EXISTS rd_commit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  sha             TEXT NOT NULL,
  author_name     TEXT,
  author_email    TEXT,
  message         TEXT,
  files_changed   JSONB,
  repo            TEXT,
  branch          TEXT,
  committed_at    TIMESTAMPTZ,
  status          commit_log_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_rd_commit_logs_org_sha ON rd_commit_logs(org_id, sha);
CREATE INDEX idx_rd_commit_logs_status ON rd_commit_logs(status);

ALTER TABLE rd_commit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rd_commit_logs_select" ON rd_commit_logs
  FOR SELECT USING (org_id = get_user_org_id());


-- ============================================================
-- PART 4: rd_auto_entries — AI-classified staging table
-- ============================================================

CREATE TABLE IF NOT EXISTS rd_auto_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  commit_id       UUID NOT NULL REFERENCES rd_commit_logs(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  hours           DECIMAL(4,1) NOT NULL,
  stage           TEXT NOT NULL,
  deliverable     TEXT NOT NULL,
  rd_tag          rd_tag NOT NULL DEFAULT 'not_eligible',
  description     TEXT,
  ai_reasoning    TEXT,
  confidence      DECIMAL(3,2),
  review_status   review_status NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rd_auto_entries_org_id ON rd_auto_entries(org_id);
CREATE INDEX idx_rd_auto_entries_review_status ON rd_auto_entries(org_id, review_status);
CREATE INDEX idx_rd_auto_entries_commit_id ON rd_auto_entries(commit_id);

ALTER TABLE rd_auto_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rd_auto_entries_select" ON rd_auto_entries
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "rd_auto_entries_update" ON rd_auto_entries
  FOR UPDATE USING (org_id = get_user_org_id());


-- ============================================================
-- PART 5: rd_file_mappings — configurable file pattern rules
-- ============================================================

CREATE TABLE IF NOT EXISTS rd_file_mappings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  pattern     TEXT NOT NULL,
  stage       TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  rd_tag      rd_tag NOT NULL DEFAULT 'core_rd',
  priority    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rd_file_mappings_org_id ON rd_file_mappings(org_id);

ALTER TABLE rd_file_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rd_file_mappings_select" ON rd_file_mappings
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "rd_file_mappings_insert" ON rd_file_mappings
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "rd_file_mappings_update" ON rd_file_mappings
  FOR UPDATE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "rd_file_mappings_delete" ON rd_file_mappings
  FOR DELETE USING (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND org_id = get_user_org_id()
        AND role IN ('owner', 'admin')
    )
  );


-- ============================================================
-- PART 6: Updated_at triggers
-- ============================================================

CREATE TRIGGER set_rd_tracking_config_updated_at
  BEFORE UPDATE ON rd_tracking_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_rd_auto_entries_updated_at
  BEFORE UPDATE ON rd_auto_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
