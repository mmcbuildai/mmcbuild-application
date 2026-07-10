-- 00076_kb_rls_scope_fix.sql
--
-- SCRUM-344 (spike finding) — close the open RLS policy on the knowledge base
-- tables.
--
-- knowledge_bases and knowledge_documents each carried, alongside their scoped
-- SELECT policies, a "System can manage …" policy of the form
--   FOR ALL USING (true) WITH CHECK (true)
-- (migration 00003). Postgres RLS OR's permissive policies for a command, so an
-- open FOR ALL policy VOIDS the scoped SELECT — any authenticated RLS-client
-- query could read or write every org's KB rows. That is zero tenant isolation
-- at the database layer.
--
-- All KB access in the app currently goes through the service-role client
-- (createAdminClient / db()), which bypasses RLS entirely, so the open policy
-- was never needed for the app to function and removing it changes nothing about
-- current behaviour. This migration replaces it with org-scoped write policies so
-- the DB layer is the boundary too (and stays correct if KB access ever moves to
-- the RLS client, per SCRUM-344). The existing scoped SELECT policies remain the
-- read boundary. System (shared) KBs are created by operators via the service
-- role and are intentionally not writable by an RLS client.
--
-- Idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.

-- ============================================================
-- knowledge_bases
-- ============================================================

-- Remove the open policy that defeats the scoped SELECT policies.
DROP POLICY IF EXISTS "System can manage KBs" ON knowledge_bases;

-- Scoped writes: an org member may write only their own org's KBs. Reads stay
-- governed by the existing "Users can view system KBs" / "Users can view org KBs"
-- SELECT policies.
DROP POLICY IF EXISTS "Org members can insert org KBs" ON knowledge_bases;
CREATE POLICY "Org members can insert org KBs"
  ON knowledge_bases FOR INSERT
  WITH CHECK (scope = 'org' AND org_id = get_user_org_id());

DROP POLICY IF EXISTS "Org members can update org KBs" ON knowledge_bases;
CREATE POLICY "Org members can update org KBs"
  ON knowledge_bases FOR UPDATE
  USING (scope = 'org' AND org_id = get_user_org_id())
  WITH CHECK (scope = 'org' AND org_id = get_user_org_id());

DROP POLICY IF EXISTS "Org members can delete org KBs" ON knowledge_bases;
CREATE POLICY "Org members can delete org KBs"
  ON knowledge_bases FOR DELETE
  USING (scope = 'org' AND org_id = get_user_org_id());

-- ============================================================
-- knowledge_documents  (scoped via the parent KB)
-- ============================================================

DROP POLICY IF EXISTS "System can manage KB docs" ON knowledge_documents;

DROP POLICY IF EXISTS "Org members can insert org KB docs" ON knowledge_documents;
CREATE POLICY "Org members can insert org KB docs"
  ON knowledge_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_documents.kb_id
        AND knowledge_bases.scope = 'org'
        AND knowledge_bases.org_id = get_user_org_id()
    )
  );

DROP POLICY IF EXISTS "Org members can update org KB docs" ON knowledge_documents;
CREATE POLICY "Org members can update org KB docs"
  ON knowledge_documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_documents.kb_id
        AND knowledge_bases.scope = 'org'
        AND knowledge_bases.org_id = get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_documents.kb_id
        AND knowledge_bases.scope = 'org'
        AND knowledge_bases.org_id = get_user_org_id()
    )
  );

DROP POLICY IF EXISTS "Org members can delete org KB docs" ON knowledge_documents;
CREATE POLICY "Org members can delete org KB docs"
  ON knowledge_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_documents.kb_id
        AND knowledge_bases.scope = 'org'
        AND knowledge_bases.org_id = get_user_org_id()
    )
  );
