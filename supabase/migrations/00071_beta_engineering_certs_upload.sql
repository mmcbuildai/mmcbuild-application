-- Migration 00071: let beta-role testers upload project certifications.
--
-- BUG (2026-07-03): loading / adding a certification to a project fails with
-- "new row violates row-level security policy". That RLS error only fires on an
-- INSERT — here the client-side upload of the file to the `engineering-certs`
-- storage bucket (certification-upload.tsx). Owners are unaffected (an owner
-- uploaded a cert successfully on 2026-07-03); the shared Beta Demo account and
-- every real invited beta tester are blocked.
--
-- ROOT CAUSE: the exact same prod drift that migration 00066 repaired for
-- `plan-uploads`. Repo migration 00015 left the `engineering-certs` INSERT
-- policy as a permissive bucket-only check, but prod's live policy has been
-- hardened out of band to require BOTH (folder = caller's org) AND
-- (role IN owner/admin/architect/builder). That role set EXCLUDES 'beta', so a
-- beta tester is org-aligned but role-blocked and cannot upload a certificate at
-- all. It "works for us" only because we test as owners.
--
-- The client builds the object path as `<org_id>/<project_id>/<file>`
-- (certification-upload.tsx: `${profile.org_id}/${projectId}/...`), identical to
-- plan-uploads, so get_user_org_id() must equal the first path folder. The
-- security boundary that matters is the ORG SCOPE (you may only write into your
-- own org's folder); which role within that org may upload is not a meaningful
-- boundary for the beta program, whose testers MUST upload to exercise the
-- product. This migration sets the storage INSERT policy to org-scoped /
-- any-authenticated-member, which (a) restores beta uploads, (b) keeps the org
-- isolation that actually protects tenants, and (c) brings the storage policy
-- back into the migration set as the single source of truth (repairing drift).
--
-- The `project_certifications` table INSERT policy carries the same
-- beta-excluding role gate (00007); we align it (add 'beta') for consistency so
-- the policy is honest, even though registerCertification() currently inserts
-- via the admin client.
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE). Apply against prod
-- (lztzyfeivpsbqbsfzctw) via the pooler, or paste into the Supabase SQL editor.
-- NOTE: `supabase db push` is unsafe on this repo (untracked history replays the
-- whole set) — apply manually and commit this file for the record.

-- ============================================================
-- 1. Storage: engineering-certs INSERT — org-scoped, any member (incl. beta)
-- ============================================================
-- Prod verification (2026-07-03) showed the live INSERT policy had been renamed
-- `engineering_certs_insert_own_org` (repo 00015 created `engineering_certs_insert`),
-- with a role gate `role IN (owner,admin,architect,builder)` that excludes beta.
-- Drop BOTH possible names so this migration converges from either state, then
-- recreate a single org-scoped policy with NO uploader-role restriction.
DROP POLICY IF EXISTS "engineering_certs_insert" ON storage.objects;
DROP POLICY IF EXISTS "engineering_certs_insert_own_org" ON storage.objects;
CREATE POLICY "engineering_certs_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'engineering-certs'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

-- ============================================================
-- 2. project_certifications table INSERT — add 'beta' to allowed roles
-- ============================================================
DROP POLICY IF EXISTS "Users can insert certifications in their org" ON project_certifications;
CREATE POLICY "Users can insert certifications in their org"
  ON project_certifications FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND org_id = project_certifications.org_id
        AND role IN ('owner', 'admin', 'architect', 'builder', 'beta')
    )
  );
