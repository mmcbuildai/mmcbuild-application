-- Beta tester feedback per module
create table if not exists beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  module_id text not null check (module_id in ('comply', 'build', 'quote', 'direct', 'train')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  feedback text,
  rating integer check (rating >= 1 and rating <= 5),
  started_at timestamptz,
  completed_at timestamptz,
  org_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, module_id)
);

-- Indexes
create index idx_beta_feedback_user on beta_feedback(user_id);
create index idx_beta_feedback_org on beta_feedback(org_id);

-- RLS
alter table beta_feedback enable row level security;

-- Users can read/write their own feedback
create policy "users_own_beta_feedback" on beta_feedback
  for all using (user_id = auth.uid());

-- Admins can read all feedback in their org
create policy "admin_read_beta_feedback" on beta_feedback
  for select using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid()
      and profiles.org_id = beta_feedback.org_id
      and profiles.role in ('owner', 'admin')
    )
  );
