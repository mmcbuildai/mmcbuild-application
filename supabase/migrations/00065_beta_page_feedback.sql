-- Per-page beta feedback: a beta tester can tell us about an issue on a SPECIFIC
-- page (tagged with the page URL), logged against the user for follow-up. This is
-- the beta-only path; a separate live-user path comes later. Distinct from
-- beta_feedback (which is per-MODULE test progress, CHECK-constrained to the five
-- modules + unique per user/module) — page feedback is free-form and many-per-user.
create table if not exists public.beta_page_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid,
  -- Where the tester was when they hit "tell us about this page".
  page_url text not null,
  page_path text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'actioned')),
  created_at timestamptz not null default now()
);

alter table public.beta_page_feedback enable row level security;

-- Writes/reads for the dashboard go through the service role server-side, but add
-- owner policies so a user can only ever see/insert their own rows directly.
drop policy if exists "bpf_insert_own" on public.beta_page_feedback;
create policy "bpf_insert_own" on public.beta_page_feedback
  for insert with check (user_id = auth.uid());

drop policy if exists "bpf_select_own" on public.beta_page_feedback;
create policy "bpf_select_own" on public.beta_page_feedback
  for select using (user_id = auth.uid());

create index if not exists idx_bpf_created on public.beta_page_feedback(created_at desc);
create index if not exists idx_bpf_user on public.beta_page_feedback(user_id);
