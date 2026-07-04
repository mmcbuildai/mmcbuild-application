-- Migration 00072: converge the `plan-uploads` INSERT policy from prod drift so
-- beta-role testers can upload a plan during Create Project.
--
-- BUG (recurrence, 2026-07-03): a beta tester uploading a building plan during
-- Create Project still hits "new row violates row-level security policy" on the
-- client-side upload to the `plan-uploads` storage bucket (plan-dropzone.tsx),
-- EVEN THOUGH migration 00066 was written to fix exactly this. Owners are
-- unaffected — we only see it because we test as owners.
--
-- ROOT CAUSE: the same out-of-band prod drift that migration 00071 uncovered for
-- `engineering-certs`. 00066 dropped ONLY the repo-canonical policy name
-- `plan_uploads_insert` (from 00015) before recreating an org-scoped, no-role
-- INSERT policy. But prod's live policy had been hardened AND RENAMED to
-- `plan_uploads_insert_own_org` with a role gate `role IN
-- (owner,admin,architect,builder)` that EXCLUDES 'beta'. Because 00066 never
-- dropped that renamed variant, applying 00066 left the beta-excluding policy in
-- place and the CREATE became a no-op / duplicate — so beta uploads still fail.
--
-- FIX: mirror 00071 lines 47-54 exactly — drop BOTH possible names so this
-- converges from either state, then recreate a single org-scoped policy with NO
-- uploader-role restriction. The security boundary that matters is ORG SCOPE
-- (you may only write into your own org's folder, `<org_id>/<project_id>/<file>`
-- per plan-dropzone.tsx); which role within the org uploads is not a meaningful
-- tenant boundary, and beta testers MUST upload to exercise the product.
--
-- The `plans` table INSERT policy already includes 'beta' (00066) and
-- registerPlan() inserts via the admin client anyway, so the storage.objects
-- INSERT below is the only RLS-gated step on the failing path.
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE). Apply against prod
-- (lztzyfeivpsbqbsfzctw) via the pooler, or paste into the Supabase SQL editor.
-- NOTE: `supabase db push` is unsafe on this repo (untracked history replays the
-- whole set) — apply manually and commit this file for the record.

-- ============================================================
-- Storage: plan-uploads INSERT — org-scoped, any member (incl. beta)
-- ============================================================
DROP POLICY IF EXISTS "plan_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "plan_uploads_insert_own_org" ON storage.objects;
CREATE POLICY "plan_uploads_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'plan-uploads'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );
