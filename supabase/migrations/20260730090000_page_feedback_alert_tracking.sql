-- Course-request / page-feedback alert tracking.
--
-- Context (client call 2026-07-29): Karen submitted a course request live on the
-- call, saw "Thanks — we've logged your request", and no email arrived. The row
-- DID save (two rows landed at 2026-07-29 12:07 UTC), so the request was never
-- lost — but the operator alert email is fired inside a try/catch that swallows
-- every failure, leaving no trace anywhere except an ephemeral Vercel log. There
-- was no way to answer "did the alert go out?" after the fact.
--
-- The leads table already solved this exact problem (email_alert_sent_at /
-- email_alert_error, added when Resend was rejecting the unverified apex
-- domain). Mirror that shape here so a failed alert is diagnosable from the
-- data rather than from a log nobody kept.
--
-- Idempotent per the repo migration standard.

alter table if exists public.beta_page_feedback
  add column if not exists alert_email_sent_at timestamptz;

alter table if exists public.beta_page_feedback
  add column if not exists alert_email_error text;

comment on column public.beta_page_feedback.alert_email_sent_at is
  'When the operator alert email for this entry was accepted by Resend. NULL = never sent (see alert_email_error).';

comment on column public.beta_page_feedback.alert_email_error is
  'Resend failure text for the operator alert, if it failed. The entry itself is still saved and visible at /admin/feedback — this only records that the notification did not go out.';
