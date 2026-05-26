# MMC Build — Environment Cutover Template

**Audience:** Karthik (MMC Build), for the CAS → MMC Build environment cutover.

**Purpose:** The definitive list of every environment variable the MMC Build
**application** (`mmc-application`: Comply, Build, Quote, Direct, Train, Billing)
needs to run — and **who fills each one**. Per what was agreed on 15 May 2026,
MMC Build owns its own accounts and keys with a clean billing boundary from day
one. The only values Dennis pastes are the **property-services** backend keys —
the single shared service MMC Build keeps consuming from CAS by agreement
(2026-05-26, Part B). **platform-trust is no longer handed over**: its key is a
*shared* CAS service-role key, so MMC Build runs the security gate on its own
infrastructure instead.

**This doc is the human-readable split.** The machine-readable source of truth is
`byok.config.json` (every key: provider, format, dashboard URL, step-by-step
instructions). The fill-in file generated from it is `.env.restore.local.example`.
If this doc and `byok.config.json` disagree on a key, `byok.config.json` wins —
flag the drift back to Dennis.

---

## How to use this

Three files in the repo root work together:

| File | Role |
|---|---|
| `byok.config.json` | Machine-readable manifest — every key, its provider, required/optional, signup + dashboard URL, copy-paste instructions, expected format, cost note. |
| `.env.restore.local.example` | The human fill-in file (generated from the manifest). Grouped by provider, `[R]`/`[O]` flags, `...` placeholders. |
| `scripts/vercel-env-restore.mjs` | One-command push to Vercel — dry-run by default, `--apply` to push. Pipes values via stdin (never logged), skips any line still ending in `...`, and skips keys already on Vercel. |

**Flow:**
1. `cp .env.restore.local.example .env.restore.local`
2. Fill in each value you own (Part A). Lines left ending in `...` are skipped, so partial fills re-run safely.
3. `vercel login` → `vercel link` (to the MMC Build Vercel project).
4. `node scripts/vercel-env-restore.mjs` (dry-run — shows what will push, writes nothing).
5. `node scripts/vercel-env-restore.mjs --apply` (pushes to Production + Preview + Development).
6. **Delete `.env.restore.local`** afterwards — it holds plaintext secrets (it is gitignored, so it won't commit either way).

`[R]` = required to run the app. `[O]` = optional / feature-gated (the app degrades gracefully or the feature is off).

---

## Part A — Karthik fills (MMC Build's own accounts)

These are MMC Build's keys, on MMC Build's accounts. Clean billing boundary — no
CAS billing touches any of these.

### Supabase — *fill after the DB migration into MMC Build's project*
The migration (CAS project → MMC Build's new Sydney project) must land first;
then pull these three straight from MMC Build's Supabase dashboard
(Settings → API).

| Env var | Req | Source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `[R]` | Project URL (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `[R]` | `anon` / `public` key (JWT, `eyJ…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `[R]` | `service_role` (click Reveal). Server-only — never commit, never `NEXT_PUBLIC_`. |

### Anthropic (Claude) — primary LLM
| Env var | Req | Source |
|---|---|---|
| `ANTHROPIC_API_KEY` | `[R]` | console.anthropic.com → Settings → API Keys → Create (`sk-ant-…`) |

### OpenAI — embeddings + cross-validation
| Env var | Req | Source |
|---|---|---|
| `OPENAI_API_KEY` | `[R]` | platform.openai.com → API Keys (`sk-…`) |

### HuggingFace — BGE reranking
| Env var | Req | Source |
|---|---|---|
| `HUGGINGFACE_API_KEY` | `[O]` | huggingface.co → Settings → Access Tokens (read) (`hf_…`). Reranking degrades gracefully if unset. |

### Resend — transactional email + Supabase Auth SMTP
| Env var | Req | Source |
|---|---|---|
| `RESEND_API_KEY` | `[R]` | resend.com → verify a sending domain first → API Keys (`re_…`) |
| `RESEND_FROM_EMAIL` | `[R]` | A verified sender on MMC Build's Resend domain (e.g. `noreply@updates.mmcbuild.com.au`) |

### Stripe — checkout, subscriptions, usage metering
| Env var | Req | Source |
|---|---|---|
| `STRIPE_SECRET_KEY` | `[R]` | dashboard.stripe.com → Developers → API keys (`sk_test_…` / `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | `[R]` | **Post-deploy** — create the endpoint at `https://<app-url>/api/webhooks/stripe` (events: `checkout.session.completed`, `customer.subscription.*`), then copy its signing secret (`whsec_…`) |
| `STRIPE_COMPLY_PRICE_ID` | `[R]` | Stripe → Products → price per module (`price_…`) |
| `STRIPE_BUILD_PRICE_ID` | `[R]` | as above |
| `STRIPE_QUOTE_PRICE_ID` | `[R]` | as above |
| `STRIPE_DIRECT_PRICE_ID` | `[R]` | as above |
| `STRIPE_TRAIN_PRICE_ID` | `[R]` | as above |
| `STRIPE_BASIC_PRICE_ID` | `[O]` | Legacy bundle price (only if selling bundles) |
| `STRIPE_PROFESSIONAL_PRICE_ID` | `[O]` | Legacy bundle price |

### Inngest — async jobs (15 functions + cron)
| Env var | Req | Source |
|---|---|---|
| `INNGEST_SIGNING_KEY` | `[R]` | app.inngest.com → your env → Manage → Signing Key (`signkey-…`) |
| `INNGEST_EVENT_KEY` | `[R]` | app.inngest.com → Manage → Event Keys |

### Mapbox — geocoding / maps (site intelligence)
| Env var | Req | Source |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | `[R]` | account.mapbox.com → Access tokens → default public token (`pk.…`) |
| `MAPBOX_SECRET_TOKEN` | `[O]` | Server-side token for higher limits (`sk.…`) |

### App config
| Env var | Req | Source |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `[R]` | Where the app is deployed (e.g. `https://app.mmcbuild.com.au`). Used in email links + Stripe redirects. |
| `NEXT_PUBLIC_MODULES_LAUNCH_LIST` | `[O]` | Comma-separated modules visible to non-admins (e.g. `comply,build,quote`). Unset = all visible. |

### Optional feature integrations (only if the feature is used)
| Env var | Req | Source / when needed |
|---|---|---|
| `CLOUDCONVERT_API_KEY` | `[O]` | Only if operators upload DWG / RVT / SKP / DOC plans (converts to PDF before vision extraction). PDF-only? Skip. |
| `ABR_GUID` | `[O]` | ABN validation in the Direct supplier directory. Free ABR web-services GUID. |
| `HUBSPOT_API_KEY` | `[O]` | CRM sync for directory listings + leads. |
| `HEYGEN_API_KEY` | `[O]` | Avatar explainer videos for MMC Train. |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | `[O]` | Voice concierge agent (MMC Direct). Falls back to a test agent if unset. |

---

## Part B — Dennis pastes (the one sanctioned CAS-hosted backend)

By agreement (2026-05-26), **property-services is the single shared service MMC
Build keeps consuming from CAS.** Dennis supplies its values directly; Karthik
creates no account for it. Everything else runs on MMC Build's own infrastructure.

### Platform Trust — NOT handed over (run self-contained)
Its key is a **shared CAS `service_role` key** spanning the whole portfolio's
trust-events project, so it must not leave CAS. The security gate (prompt-injection
guard) is mandatory for this REGULATED product, so keep `ENABLE_SECURITY_GATE=true`
and run it **self-contained**: either leave `PLATFORM_TRUST_*` unset (the gate runs;
audit logging is skipped) or point them at **MMC Build's own** Supabase with a
trust-events table. Do **not** paste the CAS values.

| Env var | Req | Owner |
|---|---|---|
| `PLATFORM_TRUST_SUPABASE_URL` | `[O]` | MMC Build (own Supabase) or leave unset — **not** CAS |
| `PLATFORM_TRUST_SERVICE_KEY` | `[O]` | MMC Build (own `service_role`) or leave unset — **not** CAS |
| `PLATFORM_TRUST_PROJECT_ID` | `[O]` | `mmc-build` (namespacing label) |

### Property Services — site-intelligence backend (wind region, council, climate)
The address → lot / zoning / climate lookup in project creation. Calls CAS-hosted
edge functions; the key below is **MMC-scoped** (rate-limited to MMC Build) and is
a public `NEXT_PUBLIC_` value, so handing it over carries no shared-secret risk.

| Env var | Req | Owner |
|---|---|---|
| `NEXT_PUBLIC_PROPERTY_SERVICES_URL` | `[R]`* | Dennis pastes |
| `NEXT_PUBLIC_PROPERTY_SERVICES_API_KEY` | `[R]`* | Dennis pastes — **this is the key the app code actually reads** (sent as `X-API-Key`). |
| `NEXT_PUBLIC_PROPERTY_SERVICES_ANON_KEY` | `[O]` | Dennis pastes — legacy/optional; only needed for pre-2026-04-30 `verify_jwt` deployments |

*Required whenever the property-profile lookup is used — it's called with a
non-null assertion in project creation, so if unset the lookup throws.

---

## Feature flags & config (sensible defaults — set only to override)

| Env var | Default behaviour |
|---|---|
| `ENABLE_SECURITY_GATE` | `false` → runs without the platform-trust gate. Set `true` once Part B is wired. |
| `ENABLE_CROSS_VALIDATION` | Off unless set. Enables OpenAI cross-validation of Claude output. |
| `ENABLE_AGENTIC_COMPLIANCE` | Off unless set. |
| `CROSS_VALIDATION_TIER` | Tier selector for the AI router cross-validation. |
| `NEXT_PUBLIC_TESTING_MODE` | Leave unset in production. |

---

## Not needed for the production deploy (dev tooling only)

These exist for local developer tooling (Jira automation scripts) and are **not**
required to run or deploy the app. Do not push them to the production Vercel
project unless you actively run the scripts that use them.

`JIRA_API_KEY`, `JIRA_TOKEN`, `JIRA_EMAIL`, `JIRA_HOST`, `JIRA_PROJECT`,
`KAREN_EMAIL`, `KARTHIK_EMAIL`.

---

## The cutover sequence (mirrors the email)

1. **Supabase migration first.** MMC Build creates the new Sydney project and
   shares the project ref + DB connection string; Dennis runs `pg_dump` from the
   CAS project and restores into MMC Build's. Then pull the real Supabase
   URL / anon / service-role keys from MMC Build's dashboard.
2. **Create the other accounts** (Anthropic, OpenAI, HF, Stripe, Resend, Inngest,
   Mapbox) and fill `.env.restore.local` (Part A).
3. `vercel login` → `vercel link` → dry-run → `--apply`.
4. **Post-deploy:** create the Stripe webhook endpoint against the live URL and
   copy `STRIPE_WEBHOOK_SECRET` back in.
5. **Delete `.env.restore.local`.**

---

## Known gaps (honest list)

- **`property-services` keys are not yet in `byok.config.json` /
  `.env.restore.local.example`.** They are listed in Part B above and in
  `.env.example`. Folding them into the wizard manifest is a follow-up.
- **Naming drift on the property-services key (now reflected in Part B):**
  `.env.example` lists `NEXT_PUBLIC_PROPERTY_SERVICES_ANON_KEY`, but the application
  code reads `NEXT_PUBLIC_PROPERTY_SERVICES_API_KEY` (the `X-API-Key` header). Part B
  now hands over `_API_KEY` as the required one. Reconcile `.env.example` to the same
  name as a follow-up so the two stop disagreeing.
</content>
</invoke>
