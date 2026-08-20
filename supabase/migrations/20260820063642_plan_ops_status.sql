-- Manually-maintained operational status for a plan, distinct from `status`
-- (the pipeline's own processing state) and `error_message` (why it failed).
-- The daily founder report's Needs Attention section shows these two columns
-- for stuck uploads so a follow-up (e.g. "fixed in code, re-upload pending")
-- isn't lost between the person who investigated and the next night's email.
alter table plans
  add column if not exists ops_status text,
  add column if not exists ops_next_steps text;

comment on column plans.ops_status is 'Human-set note on where this stuck plan actually stands (e.g. "Fixed in code, awaiting re-upload"). Null means nobody has annotated it yet.';
comment on column plans.ops_next_steps is 'Human-set note on what to do next for this stuck plan (e.g. "Follow up with the customer"). Null means nobody has annotated it yet.';
