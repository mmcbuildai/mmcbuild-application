# MMC Build — Handover & Cutover Runbook (Karthik)

**Audience:** Karthik (MMC infra/deploy owner) + Karen (DNS).
**Purpose:** the steps **you** run to take MMC Build live on MMC-owned infrastructure. Dennis owns
the application code and the Supabase **data** move; this runbook is your half, in order.
**Date:** 2026-05-25.

---

## 0. What you're receiving

The old `mmc-market` monolith is split into three repos (ADR-007 / ADR-008):

| Repo | Contents | Goes live at |
|---|---|---|
| `mmcbuild-application` | the whole product — auth + dashboard + API + lib (one fullstack Next.js app, talks to Supabase) | `app.mmcbuild.com.au` |
| `mmcbuild-marketing` | public brochure only — **no Supabase, no auth** | `mmcbuild.com.au` (+ `www`) |
| `mmc-shared` | shared services as `@mmcbuild-ai/*` packages | n/a (npm packages, not deployed) |

Both apps are already live + verified on Vercel default URLs: app = `mmcbuild-one.vercel.app`,
brochure = `mmcbuild-marketing.vercel.app`.

Supabase: the app's data is being migrated **by Dennis** from the CAS project (Mumbai) into **your**
MMC project `lztzyfeivpsbqbsfzctw` (Sydney). You provided the dest; Dennis runs the dump + restore.

---

## 1. Ownership split (so nobody waits on the wrong person)

| Area | Owner |
|---|---|
| Application + brochure code | Dennis (pushes code) |
| Vercel projects + env vars | **You** |
| Domains + DNS (VentraIP) | **You / Karen** |
| HubSpot allowed-domains | **You** |
| Supabase **data** migration (dump + restore) | Dennis |
| Supabase **Auth** config (Site URL, redirect allow-list, SMTP) | Dennis (self-serve, no token needed from you) |
| `property-services` env values (the one CAS service MMC keeps) | Dennis (hands over) |
| `platform-trust` — run self-contained on MMC infra (shared CAS key **not** handed over) | Dennis (config note) |

---

## 2. Your steps, in order

### Step 1 — Repos into the MMC org
- Mirror (or transfer) `dennissolver/mmcbuild-application` and `dennissolver/mmcbuild-marketing`
  into the `mmcbuild-ai` org. (`mmc-shared` is already in your org.)
- Interim is fine: Vercel can deploy from the `dennissolver` repos until you move them — org
  ownership is just the end state.

### Step 2 — Vercel projects
- **Brochure:** new Vercel project from `mmcbuild-marketing`. Set one env var:
  `NEXT_PUBLIC_APP_URL=https://app.mmcbuild.com.au` (the brochure's Sign In / Get Started / lead-form
  POSTs read this). It needs **no secrets** — it has no Supabase.
- **App:** confirm a Vercel project points at `mmcbuild-application` (this is what `mmcbuild-one`
  already serves). Standard Next.js build, no special step.

### Step 3 — Env vars (app project) — see `docs/env-cutover-template.md`
- Fill **MMC's own accounts**: Supabase (URL / anon / service-role), Anthropic, OpenAI, Stripe,
  Resend, Inngest, Mapbox, + app config.
- **Dennis hands over:** the `property-services` pair only — the one shared service MMC keeps
  consuming from CAS (MMC-scoped, public key): `NEXT_PUBLIC_PROPERTY_SERVICES_URL` +
  `NEXT_PUBLIC_PROPERTY_SERVICES_API_KEY`. **platform-trust is NOT handed over** — that's a shared
  CAS service-role key; run the security gate self-contained on MMC's own Supabase (or with logging
  off). See `docs/env-cutover-template.md` Part B.
- **Rule (both Vercel teams enforce it):** secrets = **`Sensitive`**, **Production + Preview only,
  never Development**. Public `NEXT_PUBLIC_*` = plain, still prod+preview only. A plaintext secret
  gets flagged "Needs Attention."

### Step 4 — Domains + DNS (you / Karen, at VentraIP)
- `mmcbuild.com.au` (apex) + `www` → the **marketing** project.
- `app.mmcbuild.com.au` → the **application** project.
- `mmcbuild.com.au` currently resolves to Base44 — cut over only **after Karen signs off visual
  parity** on the new brochure.

### Step 5 — HubSpot
- Add the brochure's live origin (`mmcbuild.com.au`, plus `mmcbuild-marketing.vercel.app` for
  previews) to HubSpot's **allowed domains** so the lead forms submit. (This is the earlier
  "spam notice" — it's a domain-allowlist setting, not a code bug.)

### Step 6 — The cutover window (coordinate with Dennis — do these together)
The only step needing both of you in one ~1-hour window, because auth + data + env must flip together:

1. **[Dennis]** Fresh final dump of the CAS source → restore into `lztzyfeivpsbqbsfzctw`
   (schema is already rehearsed; this window is data + `auth.users` + Storage files). Verify row counts.
2. **[Dennis]** Flip the Supabase **Auth Site URL** + redirect allow-list to
   `https://app.mmcbuild.com.au` (Management API, self-serve).
3. **[You]** Set the app project's `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` to **MMC's** project, redeploy.
4. **[Karen]** Cut DNS (Step 4) once the app responds correctly on MMC's Supabase.

---

## 3. Definition of Done (verify before calling it live)

- [ ] `mmcbuild.com.au` serves the brochure; tab title contains "MMC Build"; responsive at 375px + 1440px.
- [ ] **Auth smoke test on `app.mmcbuild.com.au` (non-negotiable):** sign-up, login, forgot-password,
      and magic-link all land correctly under the new Site URL + allow-list.
- [ ] Dashboard + all six modules (Comply / Build / Quote / Direct / Train / Billing) load; Stripe
      webhook + Inngest endpoint green.
- [ ] Brochure lead form submits → lands in Supabase + HubSpot + the Karen alert.
- [ ] **Containment check:** force a build break in `mmcbuild-application` → confirm `mmcbuild.com.au`
      (brochure) stays **up**. That isolation is the whole point of the split.
- [ ] No `@supabase/*` resolves in the marketing repo.

---

## 4. Rollback

- DNS is the last and most reversible step — until it's cut, `mmcbuild-one.vercel.app` keeps serving;
  no downtime.
- DNS rollback = re-point to the prior target; TTL-bounded.
- The CAS source Supabase stays intact (the migration is a **copy**, not a move) — if the MMC dest
  has an issue, point the app env back at the source.

---

## 5. What Dennis still owns / is doing (so you don't wait on it)

- The Supabase data dump + restore (blocked only on your DB password authenticating — once it does,
  the schema rehearsal + the final-window data load are his).
- Supabase Auth config (Site URL / redirect / SMTP / email templates) — self-serve.
- The `property-services` env values (the one sanctioned CAS dependency). platform-trust runs
  self-contained on MMC infra — its shared CAS key is not handed over.
- Stripping the now-redundant `(marketing)` routes from the app repo (cleanup, post-cutover).

---

## 6. Reference docs (in this repo)
- `docs/env-cutover-template.md` — the who-fills-what env-var list.
- `docs/repo-split-migration-plan.md` — the full internal analysis behind this runbook (ADR-007/008).
- `SUPABASE_MIGRATION_PLAYBOOK.md` / `CLIENT_HANDOVER_KIT.md` (in `cais-shared-services`) — the
  generalised data-move + key self-serve standards.
