-- Test regime manual test tracking
create table if not exists test_results (
  id uuid primary key default gen_random_uuid(),
  tc_id text not null,
  title text not null,
  section text not null,
  status text not null default 'pending' check (status in ('pending', 'passed', 'failed')),
  notes text,
  tested_by uuid references auth.users(id),
  tested_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Screenshots for failed tests
create table if not exists test_screenshots (
  id uuid primary key default gen_random_uuid(),
  test_result_id uuid not null references test_results(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size integer,
  uploaded_at timestamptz default now()
);

-- RLS
alter table test_results enable row level security;
alter table test_screenshots enable row level security;

-- Only admins/owners can access
create policy "admin_test_results" on test_results
  for all using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

create policy "admin_test_screenshots" on test_screenshots
  for all using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

-- Storage bucket for test screenshots
insert into storage.buckets (id, name, public)
values ('test-screenshots', 'test-screenshots', false)
on conflict (id) do nothing;

-- Storage policy — admin only
create policy "admin_test_screenshots_storage" on storage.objects
  for all using (
    bucket_id = 'test-screenshots'
    and exists (
      select 1 from profiles
      where profiles.user_id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );
