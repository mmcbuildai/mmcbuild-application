-- Allow 'signup' as a lead form_type.
--
-- Context (client call 2026-07-29): the Facebook/social CTA is being repointed
-- from the marketing contact page to the in-app sign-up page — "when somebody
-- looks at an ad on social media, we would want them to sign up, because we want
-- that data from them, at least their sign-up information" (Karthik).
--
-- Today ONLY /api/leads writes to HubSpot. Sign-up touches neither this table nor
-- HubSpot, so the moment that CTA is repointed, CRM lead capture silently drops
-- to zero — indistinguishable from the "HubSpot isn't capturing" symptom already
-- being reported, and this time real.
--
-- 00043 created leads with a CHECK constraint pinned to the three marketing
-- forms. Widen it so a sign-up is recorded through the SAME durable path as every
-- other lead (Supabase row first, HubSpot sync status recorded on the row), which
-- is what makes a failed sync answerable after the fact instead of invisible.
--
-- Idempotent: drop-if-exists then re-add, so re-running is safe.

alter table if exists public.leads
  drop constraint if exists leads_form_type_check;

alter table if exists public.leads
  add constraint leads_form_type_check
  check (form_type in ('contact', 'waitlist', 'trades-supplier', 'signup'));

comment on column public.leads.form_type is
  'Which capture surface produced this lead. ''signup'' = created an account in the app (the social-ad CTA destination); the other three are marketing-site forms.';
