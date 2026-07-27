-- ============================================================
-- 20260727110000 — Align kb-uploads + directory-uploads INSERT with the
--                  majority upload pattern: org scope, no role gate (SCRUM-359)
-- ============================================================
-- WHY
-- These two buckets were the only browser-written uploads carrying a role gate on
-- INSERT (owner/admin/architect/builder). plan-uploads, engineering-certs and
-- training-videos have none — org scope alone. Nothing distinguishes the cases:
-- there is no reason uploading a company document should need a role that
-- uploading a building plan does not, so this reads as drift between migrations
-- rather than a decision.
--
-- The gate was also excluding the wrong people. Measured against production on
-- 2026-07-27, the 40 accounts hold exactly three roles: owner (19), beta (17),
-- admin (4). The policy permitted two roles nobody has (architect, builder) while
-- refusing `beta` — 17 accounts, every tester — on their OWN organisation's
-- folder. Neither surface gates on role in the UI, so those users were offered an
-- upload control and then refused by the database: the same shape as the demo
-- failure in SCRUM-319.
--
-- WHAT CHANGES — INSERT only.
-- SELECT and UPDATE were already org-scoped with no role gate. DELETE keeps its
-- owner/admin gate, because that is what plan-uploads does too; "match the
-- majority pattern" means matching it exactly, not removing every role check.
-- Org scope is what does the security work here, and it is untouched: a member
-- still cannot read or write another organisation's prefix.
--
-- Idempotent: policies are dropped if present before being recreated.
-- ============================================================

-- ---------- kb-uploads ----------
DROP POLICY IF EXISTS "kb_uploads_insert_own_org" ON storage.objects;
CREATE POLICY "kb_uploads_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kb-uploads'
    AND (storage.foldername(name))[1] = (get_user_org_id())::text
  );

-- ---------- directory-uploads ----------
DROP POLICY IF EXISTS "directory_uploads_insert_own_org" ON storage.objects;
CREATE POLICY "directory_uploads_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'directory-uploads'
    AND (storage.foldername(name))[1] = (get_user_org_id())::text
  );
