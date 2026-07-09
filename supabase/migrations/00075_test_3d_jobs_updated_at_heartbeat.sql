-- ============================================================
-- 00075 — Add an updated_at heartbeat to test_3d_jobs (SCRUM-309)
-- ============================================================
-- The stuck-job reaper (reap-stuck-jobs.ts) marks a test_3d_jobs row `error`
-- when it's still `processing` and `created_at` is older than 15 min. That 15-min
-- window is calibrated for a SINGLE-function run (Comply ≈ 300s × retries). But
-- the Build-3D extraction is a MULTI-STEP pipeline — CloudConvert DWG→PDF, then
-- classify → extract → decompose, each its own Vercel invocation — so a heavy
-- multi-storey terrace legitimately runs past 15 min of wall-clock. Reaping on
-- total age (created_at) therefore FALSELY kills a still-progressing job: the
-- geometry extracts, but the reaper flips it to error mid-run ("Reaped: timed
-- out (no worker result)" — SCRUM-309).
--
-- Fix: give test_3d_jobs an `updated_at` heartbeat that bumps on every stage
-- update (via the shared update_updated_at() trigger from 00001), so the reaper
-- can distinguish "still making progress" from "genuinely dead" and key off
-- last-progress instead of total age (see the reaper change in the same PR).
--
-- Idempotent.
-- ============================================================

-- 1. Add the column nullable, backfill a sane heartbeat for existing rows
--    (finished rows → their finish time; in-flight → created_at), THEN set the
--    default + NOT NULL. Backfilling BEFORE the trigger exists means the trigger
--    can't overwrite the historical heartbeat with now().
alter table public.test_3d_jobs
  add column if not exists updated_at timestamptz;

update public.test_3d_jobs
  set updated_at = coalesce(finished_at, created_at, now())
  where updated_at is null;

alter table public.test_3d_jobs
  alter column updated_at set default now();
alter table public.test_3d_jobs
  alter column updated_at set not null;

-- 2. Bump updated_at on every UPDATE (reuses the shared trigger fn from 00001).
drop trigger if exists test_3d_jobs_updated_at on public.test_3d_jobs;
create trigger test_3d_jobs_updated_at
  before update on public.test_3d_jobs
  for each row execute function update_updated_at();
