-- Migration: Storage bucket policies
-- Allows authenticated users to upload/read files in client-side buckets
-- Note: remediation-uploads only uses admin client, no policies needed

-- ============================================================
-- plan-uploads bucket
-- ============================================================
CREATE POLICY "plan_uploads_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'plan-uploads');

CREATE POLICY "plan_uploads_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'plan-uploads');

CREATE POLICY "plan_uploads_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'plan-uploads');

-- ============================================================
-- engineering-certs bucket
-- ============================================================
CREATE POLICY "engineering_certs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'engineering-certs');

CREATE POLICY "engineering_certs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'engineering-certs');

CREATE POLICY "engineering_certs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'engineering-certs');

-- ============================================================
-- kb-uploads bucket
-- ============================================================
CREATE POLICY "kb_uploads_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kb-uploads');

CREATE POLICY "kb_uploads_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'kb-uploads');

CREATE POLICY "kb_uploads_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'kb-uploads');
