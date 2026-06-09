-- Beta Terms & Conditions acceptance gate (SCRUM-281).
-- Records that a user accepted the terms before using the platform. The app
-- shows a blocking accept/decline gate on first authenticated load until
-- terms_accepted_at is set. Additive + idempotent.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

comment on column public.profiles.terms_accepted_at is
  'When the user accepted the platform T&C (beta). Null = not yet accepted; the app gates access until set.';
comment on column public.profiles.terms_version is
  'Version string of the T&C the user accepted, so a future re-acceptance can be forced on a new version.';
