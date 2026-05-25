# Post-Split Audit Backlog

**Date:** 2026-05-25
**Context:** Captured from the canonical audit (`/review`, `/cso`, `/naive-tester`) run over the `mmc-market → mmcbuild-application + mmcbuild-marketing` split, plus the app fix pass that followed. This is the "do later" list — none of it blocks the canonicals re-run, performance pass, or the Karthik migration.

---

## ✅ Done (shipped this session — for reference)
- Brochure: self-host base44 images, favicon, 44px inputs (`8b1ed0c`).
- Security: CORS scoped to the marketing project, off `*.vercel.app` (`9cdf641`); HubSpot `sourcePage` sanitizer (`087444d`).
- App: auth-cookie `secure` hardened (env-conditional); "MMC Direct" naming unified in-app; sidebar `text-[11px]` fixed (`468433e`).
- App: dashboard never-blank fallback (`e957d5a`).
- App: editable Profile — name + password change (`382c8a2`).
- Lead pipeline + sender verified end-to-end; HubSpot fix is a **domain-allowlist** (Karthik, per the emailed draft), not code.

## ⏳ Deferred — needs a decision or a prod-DB touch
- **Profile `phone` / `company` / `job_title` + email-change.** Requires an additive migration on the **live CAS prod DB** (`skyeqimwnyuuozvhubdc`, Karen's data) + the international phone input + the email re-verification flow. Confirm the repo is linked for `supabase db push` first (no `supabase/migrations` profiles def found — schema may be dump-only). Core §4 (name + password) is already done.

## 🛡️ Hardening backlog (no known active hole — defence-in-depth)
- **CSP (Content-Security-Policy)** — the compensating control for the non-`httpOnly` Supabase cookie. Dedicated task: enumerate all external sources (ElevenLabs voice, Mapbox, Stripe, three.js, HeyGen, Supabase, HubSpot…) → roll out `Report-Only` → test every integration → enforce. Do NOT rush (a too-strict CSP silently breaks the voice agent / maps / checkout).
- **Rate-limit `/api/leads` (+ `/api/abn-lookup`)** — reuse the `trustGate` IP-hash pattern already on `/api/estimate`. (cso LOW — financial amplification, not DoS.)
- **Sanitize `/api/remediation/[token]/upload`** — basename the filename + enforce a MIME/extension allowlist (keep the 10MB cap). (cso MEDIUM.)
- **`/beta` + Billing graceful no-profile state** — only reachable by a profile-less user (provisioning edge case the dashboard fallback already guides). Low value; tidy if convenient.

## 📣 Content / branding (Karen's call — not engineering)
- **Brochure public "MMC Directory" → "MMC Direct"** display copy (in-app is already "MMC Direct"); decide whether the `/mmc-directory` URL slug also changes (SEO/redirect).
- **Marketing credibility:** Tier-1 partner logos (real or reframe — legal risk if aspirational); round-number stats + unattributed testimonials; "industry-recognised certifications" accreditor; the "up to 60%" claim footnote; reconcile the hero "Join the Waitlist" vs corner "Get Started".

## 🔜 Process — next, in order (per Dennis 2026-05-25)
1. **Re-run canonicals on the *updated* site** — including **`/voice-auditor`** (not yet run) + re-run review/cso/naive-tester against the fixed build.
2. **Performance standards** — `/benchmark` (Core Web Vitals, load times, bundle size) on brochure + app.
3. **Karthik migration re-plan** — only after 1 + 2 are clean.

## 🧹 Cosmetic
- Rename the legacy `MMCBuild` local folder → `_deprecated-mmcbuild` (the GitHub repo is already archived; the local rename is pending a file lock — do after a reboot).
