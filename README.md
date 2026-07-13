# MMC Build

AI-powered compliance and construction-intelligence platform for Australian
residential construction. Six modules: **Comply, Build, Quote, Direct, Train,
Billing**.

Next.js 16 (App Router, TypeScript) · Supabase (Postgres + RLS) · Inngest ·
Anthropic Claude · Stripe · Vercel.

## Getting started

```bash
pnpm install
pnpm dev          # start the dev server
pnpm build        # production build
pnpm lint         # ESLint
pnpm test         # unit tests (vitest)
npx tsc --noEmit  # type check
```

See `.env.example` for required environment variables.

## Branding & theme

**The entire site's colours are controlled by one file:
[`src/styles/brand.css`](src/styles/brand.css).** Change a colour there and the
whole app re-themes — no other files to touch. Full guide (written for
non-developers too): **[docs/BRANDING.md](docs/BRANDING.md)**.

## Project docs

- [docs/BRANDING.md](docs/BRANDING.md) — change the site theme/colours.
- [docs/HLD_LLD/](docs/HLD_LLD/) — high- and low-level design.
- `CLAUDE.md` — engineering conventions and architecture patterns (read before
  contributing).
