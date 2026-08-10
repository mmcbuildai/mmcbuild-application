-- Persist WHY a DWG ingestion fell back, so the next person does not have to
-- reconstruct it from logs that have already expired.
--
-- Karen's "TH01 Terraces 01 … technical-01.dwg" has now had four fixes designed
-- against it (#166/#168/#169/#170) without anyone being able to say which
-- reader gave up. The DWG path tries DXF first (it preserves layers and TEXT /
-- MTEXT annotations) and falls back to PDF on three DIFFERENT conditions —
-- conversion failed, DXF over the 60MB parse cap, DXF parsed but empty. All
-- three funnel into the same fallback and are recorded only as a console.warn,
-- so by the time anyone asks, the answer is gone: `vercel logs` tails a short
-- window and the Inngest run has rotated.
--
-- The reason strings already carry the numbers that matter (e.g. "DXF is
-- 214.7MB — over the parse cap"), so one text column answers both "which
-- branch" and "how far over".
--
-- Nullable and free-text ON PURPOSE. This is a diagnostic, not a state
-- machine: a constrained enum would need a migration every time a new fallback
-- appears, which is how a diagnostic quietly stops being written.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS ingest_fallback_reason text;

COMMENT ON COLUMN plans.ingest_fallback_reason IS
  'Why DWG ingestion fell back from the DXF path to PDF, verbatim. NULL when the DXF path succeeded or the plan is not a DWG. Cleared at the start of every run so a stale value cannot be read as current.';
