-- Migration 00066: let beta-role testers upload building plans.
--
-- BUG (Karen, 2026-06-26): walking the beta demo, every plan upload failed with
-- "Upload failed: new row violates row-level security policy". Reproduced by
-- replaying the exact authenticated upload against prod:
--   * karen.engel (role=owner)  -> her own org folder   => HTTP 200  (works)
--   * karen.engel (role=owner)  -> a foreign org folder  => 403       (org gate)
--   * beta.demo   (role=beta)   -> its OWN/active org     => 403       (role gate)
--   * beta.demo   (role=beta)   -> another org it's in    => 403       (role gate)
--
-- ROOT CAUSE: prod's `plan-uploads` storage INSERT policy had been hardened
-- (out of band — repo migration 00015 was still the permissive bucket-only
-- check, so prod had DRIFTED) to require BOTH (folder = caller's org) AND
-- (role IN owner/admin/architect/builder). That role set EXCLUDES 'beta', so
-- the shared Beta Demo account — and every real invited beta tester — is
-- org-aligned but role-blocked and cannot upload a plan at all. It "works for
-- us" only because we test as owners.
--
-- The beta program REQUIRES testers to upload plans to exercise the product, so
-- the uploader role gate is wrong for this bucket. The security boundary that
-- matters is the ORG SCOPE (you may only write into your own org's folder);
-- which role within that org may upload is not a meaningful boundary here.
-- This migration sets the storage INSERT policy to org-scoped / any-authenticated
-- member, which (a) restores beta uploads, (b) keeps the org isolation that
-- actually protects tenants, and (c) brings the storage policy back into the
-- migration set as the single source of truth (repairing the prod drift).
--
-- The `plans` table INSERT policy carried the same beta-excluding role gate; we
-- align it (add 'beta') for consistency so the policy is honest even though
-- registerPlan() currently inserts via the admin client.
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE). Apply with: supabase db push
-- (linked to lztzyfeivpsbqbsfzctw) or paste into the Supabase SQL editor.

-- ============================================================
-- 1. Storage: plan-uploads INSERT — org-scoped, any member (incl. beta)
-- ============================================================
-- The client builds the object path as `<org_id>/<project_id>/<file>`, where
-- <org_id> is the caller's active org (profiles.org_id, mirrored to the active
-- membership). get_user_org_id() returns that same active org, so the first
-- path folder must equal it. No uploader-role restriction — org scope is the
-- boundary.
DROP POLICY IF EXISTS "plan_uploads_insert" ON storage.objects;
CREATE POLICY "plan_uploads_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'plan-uploads'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

-- ============================================================
-- 2. plans table INSERT — add 'beta' to the allowed uploader roles
-- ============================================================
DROP POLICY IF EXISTS "Users can insert plans in their org" ON plans;
CREATE POLICY "Users can insert plans in their org"
  ON plans FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = plans.org_id
        AND role IN ('owner', 'admin', 'architect', 'builder', 'beta')
    )
  );
