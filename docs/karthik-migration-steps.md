# MMC Build — Migration Steps for Karthik

**Where we are:** the data side is **fully done**. The MMC Build database — schema (60 tables),
2,602 data rows, 17 auth users, and all 119 storage files — is copied and verified into your
Supabase project (`lztzyfeivpsbqbsfzctw`, Sydney). You've confirmed it looks good. Everything
left below is **plumbing and the flip** — no more data work.

**Method reminder:** this is a **copy, not a move**. The old database stays intact as a rollback,
so there is zero risk to live data while we cut over.

---

## Phase A — Your prep (you can do these solo, before the flip)

**1. Two Vercel projects**
- **App** → deploy from `mmcbuild-application`.
- **Brochure** → deploy from `mmcbuild-marketing`. Set one env var only:
  `NEXT_PUBLIC_APP_URL=https://app.mmcbuild.com.au`. It has no database, so it needs no secrets.

**2. Env vars on the App project** — fill with **MMC's own accounts:**
Supabase (URL / anon / service-role), Anthropic, OpenAI, Stripe, Resend, Inngest, Mapbox.
- **Rule (Vercel enforces it):** secrets = **Sensitive**, **Production + Preview only — never
  Development**. Public `NEXT_PUBLIC_*` values = plain, still Production + Preview only. A
  plaintext secret gets flagged "Needs Attention."
- **Dennis hands you:** the `property-services` values only
  (`NEXT_PUBLIC_PROPERTY_SERVICES_URL` + `NEXT_PUBLIC_PROPERTY_SERVICES_API_KEY`) — the one shared
  service MMC keeps consuming from CAS. **platform-trust is not handed over** (it's a shared CAS
  key); the security gate runs on MMC's own Supabase, or with logging off.

**3. DNS records ready with Karen (at VentraIP) — but DO NOT cut over yet**
- `mmcbuild.com.au` (apex) + `www` → the **brochure** project.
- `app.mmcbuild.com.au` → the **app** project.

**4. HubSpot**
- Add `mmcbuild.com.au` (plus `mmcbuild-marketing.vercel.app` for previews) to HubSpot's
  **allowed domains** so the lead forms submit. (This was the earlier "spam notice" — it's a
  domain-allowlist setting, not a code bug.)

---

## Phase B — The cutover window (you + Dennis + Karen together, ~1 hour)

Do these **in order, in one sitting** — auth, env, and DNS must flip together.

1. **[Karthik]** Pause writes on the old app for the window (no new data lands on the old project
   mid-flip). The data's already copied, so this just prevents drift.
2. **[Dennis]** Flip the Supabase **Auth Site URL + redirect allow-list** to
   `https://app.mmcbuild.com.au` (self-serve — no token needed from you).
3. **[Karthik]** Point the App project's `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` at **MMC's** project →
   **redeploy**.
4. **[Karen]** Cut DNS (the records from Phase A.3) once the app responds correctly on MMC's
   Supabase.

---

## Phase C — Verify before calling it live

- [ ] Auth smoke test on `app.mmcbuild.com.au`: **sign-up, login, forgot-password, magic-link**
      all land correctly.
- [ ] Dashboard + all six modules (Comply / Build / Quote / Direct / Train / Billing) load;
      Stripe webhook + Inngest endpoint green.
- [ ] Brochure on `mmcbuild.com.au` loads, browser tab title contains "MMC Build", lead form
      submits → lands in Supabase + HubSpot.

---

## Phase D — Right after it's verified live (you rotate the secrets)

The DB password and service-role key passed through the migration, so once everything is
confirmed working on your infrastructure, rotate both so neither lingers:

- **DB password:** Project Settings → Database → **Reset database password**.
- **API keys:** Project Settings → API → **rotate the JWT secret** (regenerates the `anon` +
  `service_role` keys). This invalidates the old keys — update the new values in Vercel in the
  same step.

---

## Rollback (peace of mind)

- DNS is the last and most reversible step — until it's cut, `mmcbuild-one.vercel.app` keeps
  serving, so there's no downtime.
- The old database stays fully intact (copy, not move) — if the new project has any issue, point
  the app's env back at the old project.

---

*Full detail: `docs/HANDOVER_CUTOVER_RUNBOOK.md`. Env var split: `docs/env-cutover-template.md`.*
