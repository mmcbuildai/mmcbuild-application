-- Per-task beta progress: which test tasks a tester has ticked off for a module.
-- Indices reference the order in src/lib/beta/testing-tasks.ts (append-only).
-- A module is only "completed" once every task index is present AND a rating +
-- comment are submitted (enforced in the beta server actions).
alter table if exists public.beta_feedback
  add column if not exists completed_tasks jsonb not null default '[]'::jsonb;
