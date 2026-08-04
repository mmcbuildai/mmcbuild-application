-- Marketing attribution on leads (SCRUM-373).
--
-- Neither website loaded tracking and no form captured campaign data, so every
-- lead — and every HubSpot contact — has existed with no recorded source. These
-- columns make the origin durable in OUR database, upstream of the CRM, so
-- campaign performance stays answerable even if a HubSpot sync fails or the
-- portal is later changed.
--
-- Idempotent: every statement is add-if-not-exists. Purely additive — all
-- columns are nullable with no default and no constraint, so existing rows are
-- untouched and existing inserts (including the currently-deployed marketing
-- site, which will keep posting the old payload until redeployed) keep working.

alter table if exists public.leads
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term     text,
  add column if not exists utm_content  text,
  -- Meta and Google ad click identifiers, present on a click straight from an ad.
  add column if not exists fbclid       text,
  add column if not exists gclid        text,
  -- The page first landed on (carries the campaign query string), as distinct
  -- from source_page, which is where the form was submitted.
  add column if not exists landing_page text,
  add column if not exists referrer     text,
  -- HubSpot visitor token sent with the submission. Stored so that "why is this
  -- contact unattributed in HubSpot?" is answerable from our own data rather
  -- than by guesswork — the same reasoning as hubspot_sync_status.
  add column if not exists hubspot_utk  text;

-- Campaign rollups ("how many leads did this campaign produce?") are the whole
-- point of the columns, so index the one they group by. Partial: the vast
-- majority of historical rows have no campaign and should not be carried.
create index if not exists leads_utm_campaign_idx
  on public.leads (utm_campaign)
  where utm_campaign is not null;

comment on column public.leads.hubspot_utk is
  'HubSpot visitor token (hubspotutk cookie) sent as context.hutk at submission time. Diagnostic for attribution gaps.';
