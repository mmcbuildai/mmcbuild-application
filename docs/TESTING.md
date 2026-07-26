# Testing the MMC Build app — how automated testers authenticate

**Audience:** the `/naive-tester`, `/qa`, and `/benchmark` agents (and any future automated
walkthrough) that need to reach authenticated surfaces (dashboard, modules, settings, admin).

> **No auth backdoor exists, and none should be built.** There is no route or flag that skips
> authentication — adding one to a REGULATED product would be a critical vulnerability. Testers
> authenticate as a **real account** with a **real session**. The two modes below are about
> *convenience of logging in*, never about bypassing auth.

**Production URL:** `https://app.mmcbuild.com.au` — this is the app. `mmcbuild.com.au` /
`www.mmcbuild.com.au` is the **marketing site, a separate Vercel project**, and has no login.
`mmcbuild-one.vercel.app` is a stale alias; do not test against it.

---

## The three test identities — and why you must use all three

Role decides what a user can even reach, so a bug found as one identity is **invisible** to the
others. This is not theoretical: the beta-role plan-upload failure survived two client demos
because every QA pass ran as an owner (migrations `00066` → `00071` → `00072` are three attempts at
the same bug). Any run that touches upload, project creation, or a module entry point must be
repeated as `beta`.

| Identity | Account | Role | Sees | Env vars |
|---|---|---|---|---|
| **admin** | `mcmdennis+qa@gmail.com` | `owner` of its own org | org-admin surfaces, all modules | `QA_TEST_ADMIN_EMAIL` / `QA_TEST_ADMIN_PASSWORD` |
| **beta** | `beta.demo@mmcbuild.com.au` | `beta` | what a real beta tester sees | `QA_TEST_BETA_EMAIL` / `QA_TEST_BETA_PASSWORD` |
| **user** | *not yet provisioned* — see below | plain member | a non-owner invited into an existing org | `QA_TEST_USER_EMAIL` / `QA_TEST_USER_PASSWORD` |

Passwords live in Dennis's password manager (entries "MMC Build — QA admin" / "— QA beta" /
"— QA user"). **Never committed, never pasted into a report or a committed file.**

Use these accounts instead of creating throwaway users (which pollute the prod DB and must be
cleaned up). Treat their data as disposable.

### Operator surfaces are a fourth, separate thing

Cross-org operator pages (`/admin/beta-activity-global`) gate on an **email allowlist**
(`src/lib/auth/operator.ts` + `ADMIN_EMAILS`), **not** on org role — because every self-signup is
the owner of its own org, so "owner" cannot mean "our staff". None of the three QA identities above
is on that allowlist, which is deliberate: it keeps operator surfaces out of automated runs. To
test an operator page, do it by hand as `dennis@corporateaisolutions.com` or
`mcmdennis@gmail.com`.

### Known gap: the `user` identity does not exist yet

There is currently no non-owner, non-beta QA account. Provision one before the next full QA pass:
invite a fresh address into the QA admin's org as `member` via Settings → Organisation, accept the
invite, then record the credentials in the password manager and set `QA_TEST_USER_*`. Until then,
report the `user` column of any test matrix as **not covered** rather than assuming the admin
result generalises — that assumption is the exact mistake that produced the beta upload bug.

---

## Mode A — test the auth PATH (default)

The login/signup/forgot-password/magic-link flow is **itself a surface under test** (the
AUTH PAGE PATTERN + AUTH SMOKE-TEST standards). So the default way in is to **walk the real
form**, which validates the auth UX *and* lands a session:

1. Go to `https://app.mmcbuild.com.au/login`.
2. **Type** the creds (don't DOM-inject values — React's controlled inputs ignore injected
   values; this is the #1 reason automated logins "fail" here. Real keystrokes submit fine).
3. Confirm the password visibility toggle, the forgot-password link, and the magic-link option
   are present and work (that's the auth-pattern check).
4. The sign-in server action is **slow** (a few seconds, no spinner yet — a known UX item). Wait
   for the redirect to `/dashboard` and the `sb-…-auth-token` cookie before continuing.

### Daemon-stability workaround (learned 2026-05-25)

The `/browse` daemon on Windows cold-restarts to `about:blank` between commands and crashes on
heavy renders. To keep a session alive:

- **Warm-chain** related steps into one command rather than one-action-per-call.
- **Save and reload the browser auth state** after login so a daemon restart doesn't drop the
  session.
- Avoid the heaviest renders back-to-back; let one settle before the next.

---

## Mode B — get PAST auth fast (for deep surface testing)

When the goal is to test the authed surfaces (not the login form itself) and the flaky form is
getting in the way, mint a real session and inject the cookie. **Pass `--as` to choose the
identity** — the default is `admin`, which is the identity that hides role-specific bugs:

```bash
QA_TEST_ADMIN_PASSWORD='<from password manager>' node scripts/qa-session.mjs --as admin
QA_TEST_BETA_PASSWORD='<from password manager>'  node scripts/qa-session.mjs --as beta
QA_TEST_USER_PASSWORD='<from password manager>'  node scripts/qa-session.mjs --as user
```

It performs a normal password grant (exactly what the form does) and prints the
`sb-<ref>-auth-token` cookie value(s). Set them on the app origin
(`https://app.mmcbuild.com.au`, path `/`) via the `/browse` skill, then navigate to
`/dashboard` — you land authenticated, skipping the form.

This is **real auth** (a real session for a real account), not a bypass. The cookie encoding
follows the current `@supabase/ssr` default (`base64-` + base64url, chunked); it's best-effort —
if a library bump changes the format and the server rejects it, fall back to **Mode A** (which is
also the path that *tests* auth).

Alternative: gstack's `/setup-browser-cookies` to import a logged-in session from a real Chrome
profile into the daemon.

---

## Which mode, which identity

| Goal | Mode | Identity |
|---|---|---|
| Verify login / signup / reset / magic-link UX | **A** (type the form) | admin |
| Smoke-test all four auth paths (per AUTH SMOKE-TEST) | **A** | admin |
| Walk dashboard / modules / settings | **B**, fall back to **A** | admin **and** beta |
| **Any upload, project-create, or module entry point** | **B** | **beta** (mandatory — see above) |
| Org-admin surfaces (members, invites, billing) | **B** | admin |
| Cross-org operator pages (`/admin/beta-activity-global`) | manual | Dennis's own account |

---

## Storage buckets a client-side upload writes to (RLS-gated)

These are the paths where a role gate can silently block a real user, so they are the ones the
`beta` identity exists to exercise. Each is written **from the browser**, so RLS on
`storage.objects` is the only thing standing between the click and a failure:

| Bucket | Uploaded from | Canonical policy shape |
|---|---|---|
| `plan-uploads` | `components/projects/plan-dropzone.tsx`, `components/build/test-3d-harness.tsx` | org-scoped, any member (`00072`) |
| `engineering-certs` | `components/projects/certification-upload.tsx` | org-scoped, any member (`00071`) |
| `kb-uploads` | `components/knowledge/kb-document-upload.tsx` | authenticated (no org scope — see SCRUM-319) |
| `directory-uploads` | `components/direct/file-upload.tsx`, `image-upload.tsx` | authenticated (no org scope — see SCRUM-319) |
| `training-videos` | `components/train/video-upload.tsx` | authenticated (no org scope — see SCRUM-319) |
| `test-screenshots` | `components/admin/test-regime-board.tsx` | admin surface |

A `new row violates row-level security policy` on any of these is a **policy** finding, not a UI
one — report the bucket name so it can be traced to its migration.
