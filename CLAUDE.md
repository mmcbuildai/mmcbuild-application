<!-- SESSION CONTEXT - Injected by Easy Claude Code -->
## Prior Session Context

> User returning after a few days. Summarize what was done before proceeding.

### Last Session Summary
I don't have a Jira integration or any configured credentials to access Jira. I can't connect to external project management tools directly.

To check your Jira tasks, you'll need to access Jira directly. If you'd like, I can help you set up a Jira integration or work through tasks once you share them here.

### Recent Conversation (last 2 turns)
**User (1d ago):** Check jira to list all actions required of me

**Claude (1d ago):** I don't have a Jira integration or any configured credentials to access Jira. I can't connect to external project management tools directly.

To check your Jira tasks, you'll need to access Jira directly. If you'd like, I can help you set up a Jira integration or work through tasks once you share them here.

### Instructions
- Continue from the context above. Do not ask the user to re-explain.
- When you make significant decisions, emit: <!-- MEMORY type=decision importance=8 | description -->
- When you create files, emit: <!-- MEMORY type=file_created importance=6 | path/to/file.ts - description -->
<!-- END SESSION CONTEXT -->

## ⚠️ REPO CHECK — RUN AT SESSION START (NON-NEGOTIABLE)

Before doing ANY work in this repo, alert the user to confirm they are in the
correct repo:

> "Repo check: you're in **mmcbuild-prod** (GitHub `dennissolver/mmc-market`) —
> the canonical repo Vercel deploys from. Confirm this is where you want to work
> before I make changes."

There are two local clones of this project: `mmcbuild` (legacy) and
`mmcbuild-prod` (canonical = the `mmc-market` repo Vercel deploys). On
2026-05-23 a full session was done in the legacy `mmcbuild` by mistake and had
to be copied across. Surface the repo identity at the top of every session and
get confirmation before editing or committing. **This repo is the right one.**

# MMC Build — Project Instructions

> **Global guardrails apply.** Session behaviour, workflow contract, stop phrase
> prohibitions, and quality self-checks are defined in `~/.claude/CLAUDE.md`.
> Read that file before this one. The rules there are NON-NEGOTIABLE here.

---

## Risk Tier: REGULATED

This project is in the REGULATED tier (mmcbuild). Rules:
- Zero tolerance for convention drift
- Mandatory read-before-edit on every file
- No "simplest fix" shortcuts — compliance logic must be correct, not convenient
- Flag any ambiguity rather than assume
- Paywall and billing logic must be verified at both middleware (UX) AND Server
  Action (correctness) — never assume the middleware guard is sufficient

---

## What is this?

AI-powered compliance and construction intelligence platform for Australian
residential construction. Built for Global Buildtech Australia Pty Ltd (GBTA)
on behalf of MMC Build Pty Ltd. Six live modules: Comply, Build, Quote, Direct,
Train, Billing.

---

## Tech Stack

- **Frontend/API**: Next.js 16 (App Router, TypeScript strict, Tailwind CSS, shadcn/ui)
- **Database**: Supabase (PostgreSQL + pgvector + Auth + Storage + RLS) — Sydney region
- **Jobs**: Inngest (async AI pipelines, cron)
- **AI**: Anthropic Claude (primary), OpenAI (embeddings)
- **Email**: Resend (transactional)
- **Payments**: Stripe (test mode for MVP)
- **Deployment**: Vercel

---

## Key Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # ESLint
pnpm test         # Run vitest unit tests
pnpm test:e2e     # Run Playwright E2E tests
npx tsc --noEmit  # Type check
```

---

## Architecture — Mandatory Patterns

Violating these patterns in this project is a convention violation, not a style
choice. Read before editing any file in these paths.

### AI Calls
ALL AI calls MUST go through `callModel()` from `src/lib/ai/models/router.ts`.
Never call Anthropic or OpenAI SDK directly from routes or server actions.
The router handles model fallback, usage tracking, and cost estimation.

Never send a model a blank/near-empty document or image. Validate input bytes
BEFORE any `messages.create`; if the decoded payload is empty or below
`MIN_READABLE_PLAN_BYTES` (`src/lib/plans/file-kind.ts`), fail fast with a
structured `No readable plan provided` error and do NOT call the model. A blank
document makes Claude correctly ask for the plan, and that prose then surfaces
downstream as a misleading "Failed to extract JSON" / "no readable floor plan".
The spatial extractors (`src/lib/build/spatial/extractor.ts`,
`full-house-extractor.ts`) guard this via `decodedBase64Bytes()`.

### AI Output Handling
Treat a model **refusal/prose** response as an **input/content failure**, not a
parse bug. `extractJson` (`src/lib/ai/extract-json.ts`) throws a typed
`ModelNonJsonResponseError` carrying `reason` (`refusal` / `empty` /
`unparseable`) and a neutral, end-user-safe `userMessage`; callers branch on the
typed error so the persisted/displayed message reflects the REAL cause instead
of a generic "non-JSON response". This is the content-layer instance of the
`provider-errors.ts` philosophy (the 2026-06-10 Karen incident): never mask a
real cause behind a generic downstream error.

A job reporting `done`/`completed` is **not** proof of success. Verify real
output (e.g. an extraction must yield non-zero walls/rooms — not just a layout
shape) before treating a run as resolved. "Status done" with empty geometry is
the exact symptom Karen reported.

> These guards are the local instance of the platform-wide **Diagnostic
> Integrity** standard (R16–R22) — evidence-before-diagnosis, honest-error, and
> ground-truth verification — kept consistent with `provider-errors.ts` so the
> repo doc and the global guardrails agree.

### Database Access
- Use the shared `db()` helper at `src/lib/supabase/db.ts` for tables not in
  generated types
- Use `createClient()` from `src/lib/supabase/server.ts` inside server
  components and route handlers
- Use `createAdminClient()` from `src/lib/supabase/admin.ts` ONLY in
  server-side code where elevated access is explicitly required
- NEVER import the admin client into a file that has or could have `"use client"`

### Auth Pattern
Every route handler that accesses user data MUST begin with:
```typescript
const { data: { user }, error } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
```
Do not infer auth from session cookies alone. Always call `getUser()`.

### Billing / Paywall
Paywalls must be enforced at TWO layers:
1. Middleware (`src/middleware.ts`) — for UX redirect
2. Server Action or API Route — for correctness

The middleware check is NOT sufficient alone. An attacker bypassing the
middleware would hit an unguarded Server Action without the second layer.

Pattern to follow:
```typescript
const usage = await checkAndIncrementUsage(orgId, 'comply')
if (!usage.allowed) return { error: 'usage_limit_reached', limit: usage.limit }
```

### Input Validation
All user inputs entering Server Actions or API routes MUST be validated with
Zod before use. Validators live in `src/lib/validators/`. Do not write inline
validation — add a schema to the validators directory.

### Server vs Client Components
- Default to Server Components
- Use `"use client"` only when you need React state, browser APIs, or event
  handlers
- Never fetch data in a Client Component that could be fetched in a Server
  Component and passed as props

### Async Job Threshold
Any operation expected to take > 5 seconds MUST use Inngest. Do not run
long-lived work synchronously in route handlers. Route handlers have a 10s
Vercel timeout.

### PDF / Report Generation
PDF generation uses `jspdf` + `jspdf-autotable`. Report versioning is tracked
in `src/lib/report-versions.ts`. When modifying a report layout, increment the
version constant and log the change reason.

---

## Security Rules (Project-Specific)

These extend the global security rules, not replace them.

### NCC / Compliance Content
The compliance AI pipeline processes user-uploaded building plans. Treat all
uploaded content as untrusted. The prompt injection guard at
`src/lib/security-gate.ts` must be called before inserting user-derived content
into any AI prompt. Do not bypass this gate for "efficiency".

### Token-Based Endpoints
`/api/remediation/[token]/**` uses time-limited tokens instead of Supabase
auth. These endpoints are publicly accessible. Any changes to this area must:
1. Preserve the expiry check (`expires_at`)
2. Not log the token value
3. Not widen the set of operations the token can perform

### Webhook Verification
Both GitHub (`/api/rd/webhook`) and Stripe (`/api/webhooks/stripe`) webhooks
verify signatures before processing. Never remove or weaken signature
verification. The pattern is: read raw body → verify → parse.

---

## Module Map

| Module | Route | Stage | Status | Key Actions File | Inngest Function |
|--------|-------|-------|--------|-----------------|-----------------|
| MMC Comply | `/comply` | Stage 2 | LIVE | `src/app/(dashboard)/comply/actions.ts` | `run-compliance-check` |
| MMC Build | `/build` | Stage 3 | LIVE | `src/app/(dashboard)/build/actions.ts` | `run-build-check` |
| MMC Quote | `/quote` | Stage 4 | LIVE | `src/app/(dashboard)/quote/actions.ts` | `run-cost-estimate` |
| MMC Direct | `/direct` | Stage 5 | LIVE | `src/app/(dashboard)/direct/actions.ts` | — |
| MMC Train | `/train` | Stage 6 | LIVE | `src/app/(dashboard)/train/actions.ts` | `generate-training-content` |
| Billing | `/billing` | Stage 7 | LIVE | `src/app/(dashboard)/billing/actions.ts` | — |

**Current sprint: v0.4.0** — client feedback and iteration phase.
See `.context/PROJECT_STATE.md` for blocking items and pending work.
Check `gh issue list --label accept` for newly approved code items.

---

## Testing

- **Framework:** Vitest (unit), Playwright (E2E)
- **Run unit:** `pnpm test`
- **Run E2E:** `pnpm test:e2e`
- **Test dirs:** `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Write a regression test for every bug fixed
- Write a unit test for every new function in `src/lib/`
- Target 30–40% coverage minimum

---

## Supabase / RLS

- RLS is enabled on ALL tables. Never disable it, even for debugging.
- If a query returns no rows unexpectedly, check the RLS policy before
  assuming the data is missing.
- The `get_user_org_id()` helper is used in policies for org-scoped access.
  Do not replicate this logic manually.
- Migrations live in `supabase/migrations/`. Write idempotent migrations only.

---

## Environment Variables

See `.env.example` in the repo root for all required variables. Required groups:
- `NEXT_PUBLIC_SUPABASE_*` — public Supabase config (safe for client)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never expose to client
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — server-side only
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — server-side only
- `RESEND_API_KEY` — server-side only
- `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` — server-side only
