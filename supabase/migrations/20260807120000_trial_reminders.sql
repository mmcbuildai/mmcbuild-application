-- Trial-ending reminders (SCRUM-366, Karen's D3: day 7, 11 and 13).
--
-- Under Option A a card is taken at signup and charged automatically at day 14,
-- so these emails are the only thing standing between a customer and a charge
-- they did not expect. That changes what this table is for: it is not a "nice to
-- have" send log, it is the record proving the customer was warned.
--
-- WHY A TABLE RATHER THAN COLUMNS ON `subscriptions`
-- Three nullable timestamp columns (trial_reminder_7_sent_at, ..._11_..., ...)
-- would work, but every send would then be a read-then-write: check the column
-- is null, send, set it. Two cron runs overlapping — a retry, a manual trigger,
-- a redeploy mid-run — both read null and both send. The customer gets the same
-- warning twice, which is the mild failure; the same shape also loses sends.
--
-- A UNIQUE constraint makes the double-send impossible rather than unlikely: the
-- second insert fails at the database, not at whoever remembered to check.

CREATE TABLE IF NOT EXISTS trial_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  -- Which reminder in the sequence: day 7, 11 or 13 of a 14-day trial.
  -- Constrained so a typo cannot quietly create a fourth kind of reminder that
  -- nothing sends and nobody notices.
  reminder_day    INTEGER NOT NULL CHECK (reminder_day IN (7, 11, 13)),

  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Recorded so a "why was I charged without warning?" question can be answered
  -- with the address we actually sent to, rather than the address on the account
  -- today. Those differ once someone changes their email.
  sent_to         TEXT NOT NULL,

  UNIQUE (subscription_id, reminder_day)
);

CREATE INDEX IF NOT EXISTS idx_trial_reminders_subscription
  ON trial_reminders(subscription_id);

ALTER TABLE trial_reminders ENABLE ROW LEVEL SECURITY;

-- Service-role only. Nothing in the app reads or writes this from a user
-- session — it is written by the Inngest cron and read by us when answering a
-- billing question. No policy is created, so RLS denies every anon/authenticated
-- request by default, which is the intent rather than an omission.
