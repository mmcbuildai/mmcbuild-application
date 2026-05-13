-- Marketing site leads — captured by /api/leads
-- Source of truth; HubSpot is downstream sync target.
-- Idempotent: re-running drops nothing.

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  form_type       text not null check (form_type in ('contact', 'waitlist', 'trades-supplier')),
  first_name      text not null,
  last_name       text,
  email           text not null,
  phone_country   text,
  phone           text,
  company         text,
  role            text,
  interest        text,
  message         text,
  source_page     text,

  -- HubSpot sync tracking
  hubspot_sync_status text not null default 'pending'
    check (hubspot_sync_status in ('pending', 'synced', 'failed')),
  hubspot_synced_at   timestamptz,
  hubspot_error       text,
  hubspot_retry_count integer not null default 0,
  hubspot_last_retry_at timestamptz,

  -- Resend tracking
  email_alert_sent_at timestamptz,
  email_alert_error   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists leads_email_idx          on public.leads (lower(email));
create index if not exists leads_created_at_idx     on public.leads (created_at desc);
create index if not exists leads_hubspot_pending_idx on public.leads (hubspot_sync_status, hubspot_last_retry_at)
  where hubspot_sync_status in ('pending', 'failed');

-- Auto-update updated_at on row change
create or replace function public.set_updated_at_leads() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at_leads();

-- RLS: anon can insert (form submissions); only service role reads.
alter table public.leads enable row level security;

drop policy if exists "anon can insert leads" on public.leads;
create policy "anon can insert leads"
  on public.leads
  for insert
  to anon
  with check (true);

-- No SELECT policy => only service role + future authed admins can read.
-- Admin read policy can be added later when admin dashboard is built.
