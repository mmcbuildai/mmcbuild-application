-- ============================================================
-- Migration 00003: Knowledge Bases + R&D Time Tracking
-- ============================================================

-- ============================================================
-- PART 1: New Enums
-- ============================================================

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


-- ============================================================
-- PART 2: System Sentinel Organisation
-- ============================================================
-- Used for system-wide knowledge bases (e.g. NCC volumes)
INSERT INTO organisations (id, name, abn)
VALUES ('00000000-0000-0000-0000-000000000000', 'MMC Build System', NULL)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- PART 3: Knowledge Bases Table
-- ============================================================

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
  BEFORE UPDATE ON knowledge_bases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- PART 4: Knowledge Documents Table
-- ============================================================

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
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- PART 5: Knowledge Base RLS Policies
-- ============================================================

-- System KBs readable by all authenticated users, org KBs by org members
DROP POLICY IF EXISTS "Users can view system KBs" ON knowledge_bases;
CREATE POLICY "Users can view system KBs"
  ON knowledge_bases FOR SELECT
  USING (scope = 'system');

DROP POLICY IF EXISTS "Users can view org KBs" ON knowledge_bases;
CREATE POLICY "Users can view org KBs"
  ON knowledge_bases FOR SELECT
  USING (scope = 'org' AND org_id = get_user_org_id());

-- Writes handled via admin client (service role)
DROP POLICY IF EXISTS "System can manage KBs" ON knowledge_bases;
CREATE POLICY "System can manage KBs"
  ON knowledge_bases FOR ALL
  USING (true)
  WITH CHECK (true);

-- Documents inherit KB visibility
DROP POLICY IF EXISTS "Users can view system KB docs" ON knowledge_documents;
CREATE POLICY "Users can view system KB docs"
  ON knowledge_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_documents.kb_id
        AND knowledge_bases.scope = 'system'
    )
  );

DROP POLICY IF EXISTS "Users can view org KB docs" ON knowledge_documents;
CREATE POLICY "Users can view org KB docs"
  ON knowledge_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_documents.kb_id
        AND knowledge_bases.scope = 'org'
        AND knowledge_bases.org_id = get_user_org_id()
    )
  );

DROP POLICY IF EXISTS "System can manage KB docs" ON knowledge_documents;
CREATE POLICY "System can manage KB docs"
  ON knowledge_documents FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- PART 6: KB Uploads Storage Bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kb-uploads',
  'kb-uploads',
  false,
  52428800,  -- 50MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for kb-uploads
DROP POLICY IF EXISTS "Admins can upload KB docs" ON storage.objects;
CREATE POLICY "Admins can upload KB docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kb-uploads'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view KB docs" ON storage.objects;
CREATE POLICY "Authenticated users can view KB docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kb-uploads'
    AND auth.role() = 'authenticated'
  );


-- ============================================================
-- PART 7: Update match_documents_hybrid with include_system
-- ============================================================

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
    AND (
      (filter_org_id IS NULL OR doc.org_id = filter_org_id)
      OR (include_system AND doc.org_id = '00000000-0000-0000-0000-000000000000'::uuid)
    )
    AND (filter_source_type IS NULL OR doc.source_type = filter_source_type)
    AND (filter_source_id IS NULL OR doc.source_id = filter_source_id)
    AND (query_text = '' OR doc.content ILIKE '%' || query_text || '%')
  ORDER BY doc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- ============================================================
-- PART 8: R&D Time Entries Table
-- ============================================================

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
  BEFORE UPDATE ON rd_time_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- PART 9: R&D Experiments Table
-- ============================================================

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
  BEFORE UPDATE ON rd_experiments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- PART 10: R&D RLS Policies
-- ============================================================

-- Time entries: org-scoped
DROP POLICY IF EXISTS "Users can view time entries in their org" ON rd_time_entries;
CREATE POLICY "Users can view time entries in their org"
  ON rd_time_entries FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert their own time entries" ON rd_time_entries;
CREATE POLICY "Users can insert their own time entries"
  ON rd_time_entries FOR INSERT
  WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can update their own time entries" ON rd_time_entries;
CREATE POLICY "Users can update their own time entries"
  ON rd_time_entries FOR UPDATE
  USING (
    org_id = get_user_org_id()
    AND profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their own time entries" ON rd_time_entries;
CREATE POLICY "Users can delete their own time entries"
  ON rd_time_entries FOR DELETE
  USING (
    org_id = get_user_org_id()
    AND profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Experiments: org-scoped
DROP POLICY IF EXISTS "Users can view experiments in their org" ON rd_experiments;
CREATE POLICY "Users can view experiments in their org"
  ON rd_experiments FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can insert experiments" ON rd_experiments;
CREATE POLICY "Users can insert experiments"
  ON rd_experiments FOR INSERT
  WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can update experiments in their org" ON rd_experiments;
CREATE POLICY "Users can update experiments in their org"
  ON rd_experiments FOR UPDATE
  USING (org_id = get_user_org_id());


-- ============================================================
-- DONE
-- ============================================================
SELECT 'MIGRATION 00003 COMPLETE' AS status;
