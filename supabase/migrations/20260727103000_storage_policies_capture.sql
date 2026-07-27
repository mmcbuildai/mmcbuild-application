-- ============================================================
-- 20260727103000 — Capture the live storage.objects RLS layer + fix training-videos (SCRUM-319)
-- ============================================================
-- WHY THIS EXISTS
-- The storage RLS in production had been hardened directly (dashboard / SQL
-- editor) and never written back to a migration. Live prod carried 51
-- storage.objects policies; the repo migrations described only 19. A fresh
-- deploy from the repo alone would therefore ship a WIDE-OPEN storage layer
-- (kb-uploads/directory-uploads/training-videos with no org scope, and
-- plan-uploads/engineering-certs read+delete unscoped). This migration makes
-- the repo reproduce the known-good production state 1:1, so repo == prod.
--
-- The org-scoped policy bodies below were captured verbatim from production
-- pg_policies on 2026-07-27 (SCRUM-319 step A). Do not hand-edit them — they are
-- the live source of truth. Fully idempotent: every policy is dropped if it
-- exists before being (re)created, so this converges from any live state.
--
-- TWO deviations from a pure capture, both deliberate:
--   1. training-videos — the ONLY bucket still on the weak "authenticated"-only
--      write pattern (any user in any org could upload/overwrite a lesson video).
--      Its objects are foldered by course id, not org id, so the standard
--      foldername[1] = get_user_org_id() shape would break uploads. Instead its
--      writes are gated by COURSE OWNERSHIP (the course's created_by_org_id must
--      match the caller's org). Public read is retained — learners stream videos.
--   2. site-data — production carries 4 policies for a bucket that DOES NOT
--      EXIST. They are dropped and not recreated (dead rows).
-- ============================================================

-- ---------- plan-uploads (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "plan_uploads_delete_own_org" ON storage.objects;
CREATE POLICY "plan_uploads_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'plan-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "plan_uploads_insert_own_org" ON storage.objects;
CREATE POLICY "plan_uploads_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'plan-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "plan_uploads_select_own_org" ON storage.objects;
CREATE POLICY "plan_uploads_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'plan-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "plan_uploads_update_own_org" ON storage.objects;
CREATE POLICY "plan_uploads_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'plan-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- engineering-certs (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "engineering_certs_delete_own_org" ON storage.objects;
CREATE POLICY "engineering_certs_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'engineering-certs'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "engineering_certs_insert_own_org" ON storage.objects;
CREATE POLICY "engineering_certs_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'engineering-certs'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "engineering_certs_select_own_org" ON storage.objects;
CREATE POLICY "engineering_certs_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'engineering-certs'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "engineering_certs_update_own_org" ON storage.objects;
CREATE POLICY "engineering_certs_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'engineering-certs'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- kb-uploads (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "kb_uploads_delete_own_org" ON storage.objects;
CREATE POLICY "kb_uploads_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'kb-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "kb_uploads_insert_own_org" ON storage.objects;
CREATE POLICY "kb_uploads_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'kb-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "kb_uploads_select_own_org" ON storage.objects;
CREATE POLICY "kb_uploads_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'kb-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "kb_uploads_update_own_org" ON storage.objects;
CREATE POLICY "kb_uploads_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'kb-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- directory-uploads (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "directory_uploads_delete_own_org" ON storage.objects;
CREATE POLICY "directory_uploads_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'directory-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "directory_uploads_insert_own_org" ON storage.objects;
CREATE POLICY "directory_uploads_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'directory-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "directory_uploads_select_own_org" ON storage.objects;
CREATE POLICY "directory_uploads_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'directory-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "directory_uploads_update_own_org" ON storage.objects;
CREATE POLICY "directory_uploads_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'directory-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- reports (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "reports_delete_own_org" ON storage.objects;
CREATE POLICY "reports_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "reports_insert_own_org" ON storage.objects;
CREATE POLICY "reports_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "reports_select_own_org" ON storage.objects;
CREATE POLICY "reports_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "reports_update_own_org" ON storage.objects;
CREATE POLICY "reports_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- rd-evidence (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "rd_evidence_delete_own_org" ON storage.objects;
CREATE POLICY "rd_evidence_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'rd-evidence'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "rd_evidence_insert_own_org" ON storage.objects;
CREATE POLICY "rd_evidence_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'rd-evidence'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "rd_evidence_select_own_org" ON storage.objects;
CREATE POLICY "rd_evidence_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'rd-evidence'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "rd_evidence_update_own_org" ON storage.objects;
CREATE POLICY "rd_evidence_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'rd-evidence'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- remediation-uploads (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "remediation_uploads_delete_own_org" ON storage.objects;
CREATE POLICY "remediation_uploads_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'remediation-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "remediation_uploads_insert_own_org" ON storage.objects;
CREATE POLICY "remediation_uploads_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'remediation-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "remediation_uploads_select_own_org" ON storage.objects;
CREATE POLICY "remediation_uploads_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'remediation-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "remediation_uploads_update_own_org" ON storage.objects;
CREATE POLICY "remediation_uploads_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'remediation-uploads'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- supplier-data (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "supplier_data_delete_own_org" ON storage.objects;
CREATE POLICY "supplier_data_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'supplier-data'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "supplier_data_insert_own_org" ON storage.objects;
CREATE POLICY "supplier_data_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'supplier-data'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "supplier_data_select_own_org" ON storage.objects;
CREATE POLICY "supplier_data_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'supplier-data'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "supplier_data_update_own_org" ON storage.objects;
CREATE POLICY "supplier_data_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'supplier-data'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- test-screenshots (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "test_screenshots_delete_own_org" ON storage.objects;
CREATE POLICY "test_screenshots_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'test-screenshots'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "test_screenshots_insert_own_org" ON storage.objects;
CREATE POLICY "test_screenshots_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'test-screenshots'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "test_screenshots_select_own_org" ON storage.objects;
CREATE POLICY "test_screenshots_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'test-screenshots'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "test_screenshots_update_own_org" ON storage.objects;
CREATE POLICY "test_screenshots_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'test-screenshots'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- training-certs (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "training_certs_delete_own_org" ON storage.objects;
CREATE POLICY "training_certs_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'training-certs'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "training_certs_insert_own_org" ON storage.objects;
CREATE POLICY "training_certs_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'training-certs'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "training_certs_select_own_org" ON storage.objects;
CREATE POLICY "training_certs_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'training-certs'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "training_certs_update_own_org" ON storage.objects;
CREATE POLICY "training_certs_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'training-certs'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- training-content (captured from production, org-scoped CRUD) ----------
DROP POLICY IF EXISTS "training_content_delete_own_org" ON storage.objects;
CREATE POLICY "training_content_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'training-content'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role])))))));

DROP POLICY IF EXISTS "training_content_insert_own_org" ON storage.objects;
CREATE POLICY "training_content_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'training-content'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND ((profiles.org_id)::text = (storage.foldername(objects.name))[1]) AND (profiles.role = ANY (ARRAY['owner'::user_role, 'admin'::user_role, 'architect'::user_role, 'builder'::user_role])))))));

DROP POLICY IF EXISTS "training_content_select_own_org" ON storage.objects;
CREATE POLICY "training_content_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'training-content'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

DROP POLICY IF EXISTS "training_content_update_own_org" ON storage.objects;
CREATE POLICY "training_content_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (((bucket_id = 'training-content'::text) AND ((storage.foldername(name))[1] = (get_user_org_id())::text)));

-- ---------- site-data — orphan policies for a nonexistent bucket: DROP only ----------
DROP POLICY IF EXISTS "site_data_delete_own_org" ON storage.objects;
DROP POLICY IF EXISTS "site_data_insert_own_org" ON storage.objects;
DROP POLICY IF EXISTS "site_data_select_own_org" ON storage.objects;
DROP POLICY IF EXISTS "site_data_update_own_org" ON storage.objects;

-- ---------- training-videos — FIX: course-ownership writes, public read ----------
-- Objects are foldered by course id (courseId/<file>), NOT org id, so writes are
-- gated by the owning course's org rather than foldername = org. Public read kept.
DROP POLICY IF EXISTS "Anyone can view training videos" ON storage.objects;
DROP POLICY IF EXISTS "Authed users can replace training videos" ON storage.objects;
DROP POLICY IF EXISTS "Authed users can upload training videos" ON storage.objects;

CREATE POLICY "training_videos_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'training-videos');

CREATE POLICY "training_videos_insert_course_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'training-videos'
    AND EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = ((storage.foldername(name))[1])::uuid
        AND courses.created_by_org_id = get_user_org_id()
    )
  );

CREATE POLICY "training_videos_update_course_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'training-videos'
    AND EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = ((storage.foldername(name))[1])::uuid
        AND courses.created_by_org_id = get_user_org_id()
    )
  );

CREATE POLICY "training_videos_delete_course_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'training-videos'
    AND EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = ((storage.foldername(name))[1])::uuid
        AND courses.created_by_org_id = get_user_org_id()
    )
  );
