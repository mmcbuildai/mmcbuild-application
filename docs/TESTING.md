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
| **user** | `dennis+qauser@factory2key.com.au` | `builder` | a non-owner inside someone else's org | `QA_TEST_USER_EMAIL` / `QA_TEST_USER_PASSWORD` |

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

### The `user` identity (provisioned 2026-08-01, SCRUM-358)

`dennis+qauser@factory2key.com.au` is a **`builder`** inside the QA admin's organisation
(`QA Test Org`) — a non-owner who did not create the org and cannot administer it. That is the
identity a test matrix's `user` column means.

**There is no `member` role.** Earlier revisions of this doc asked for one, which is a large part of
why the account went un-provisioned for months: the request could not be satisfied. The `user_role`
enum is `owner · admin · beta · project_manager · architect · builder · trade · viewer`
(`src/lib/auth/roles.ts`). **`builder` is the right choice** — it is what a real self-service signup
receives by default, so it reproduces an ordinary customer. `viewer` sits at the bottom of the
hierarchy and is too restricted to walk normal flows.

It was created through the **real invitation path**, not by writing rows: a pending
`org_invitations` record (role `builder`, seat `internal`), then a confirmed auth user, then one
authenticated request to `/dashboard` — because `provisionUser` runs in the dashboard layout
(`src/app/(dashboard)/layout.tsx`), consumes the pending invite, and assigns the invited role.
Verified afterwards: profile and membership both `builder` in the QA org, invitation `accepted`, and
**no personal organisation created** for the user. Reproduce it the same way if it is ever lost.

Password is in the password manager under "MMC Build — QA user".

**Still report honestly:** if a run does not exercise this identity, mark the `user` column **not
covered** rather than assuming the admin result generalises. That assumption is the exact mistake
that produced the beta upload bug.

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

| Bucket | Uploaded from | Policy shape (after `20260727103000`) | `beta` can write? |
|---|---|---|---|
| `plan-uploads` | `components/projects/plan-dropzone.tsx`, `components/build/test-3d-harness.tsx` | org-scoped, no role gate | ✅ yes |
| `engineering-certs` | `components/projects/certification-upload.tsx` | org-scoped, no role gate | ✅ yes |
| `training-videos` | `components/train/video-upload.tsx` | scoped to the owning **course**'s org | ✅ yes |
| `kb-uploads` | `components/knowledge/kb-document-upload.tsx` | org-scoped, no role gate (`20260727110000`) | ✅ yes |
| `directory-uploads` | `components/direct/file-upload.tsx`, `image-upload.tsx` | org-scoped, no role gate (`20260727110000`) | ✅ yes |
| `test-screenshots` | `components/admin/test-regime-board.tsx` | org-scoped + role gate | admin surface |

On all of these, `DELETE` keeps an owner/admin gate. Removing the role gate applies to `INSERT`
only — org scope is what does the security work, and it is untouched.

A `new row violates row-level security policy` on any of these is a **policy** finding, not a UI
one — report the bucket name so it can be traced to its migration.

### Resolved: `kb-uploads` and `directory-uploads` used to deny the `beta` role

Measured 2026-07-27 with a real beta session: both returned `new row violates row-level security
policy` for the tester's **own** org. Their INSERT gate listed `owner/admin/architect/builder` and
omitted `beta` — the same shape as the original SCRUM-319 failure, and neither surface gates on role
in the UI, so a tester was offered the control and then refused by the database.

The role distribution is what settled it. All 40 production accounts hold exactly three roles —
`owner` (19), `beta` (17), `admin` (4) — so the gate permitted two roles **nobody has**
(`architect`, `builder`) while refusing the second-largest population on the system. Migration
`20260727110000` (SCRUM-359) drops the INSERT role gate on both, matching the majority pattern.
Both buckets are now covered by the check below.

---

## The automated storage-RLS check (`pnpm test:storage-rls`)

`scripts/check-storage-rls.mjs` runs the beta-role upload matrix without a browser. It mints a real
session for the beta QA account (admin `generate_link` + `verify` — no password, no email
round-trip, no auth bypass), then per bucket asserts **both** directions:

- **positive** — beta can write its own org's prefix (catches a role gate locking testers out);
- **negative** — beta cannot write another org's prefix (catches a policy so loose it leaks across
  tenants). A check that only proved the upload works would pass just as happily against a bucket
  with no org scope at all.

It creates and deletes a disposable course so the `training-videos` course-ownership policy is
genuinely exercised rather than skipped, and it cleans up every object it writes.

Two traps it encodes, both hit while writing it: the MIME allow-list is enforced **before** RLS, so
the wrong content type returns 415 and a cross-tenant assertion scores as a pass; and a bucket
denial that isn't an RLS denial is reported `SKIP`, not `pass`. `SKIP` counts against the run — an
assertion that could not be made is not evidence that the property holds.

Runs in CI on merge to main and daily (never on PRs — like the schema-drift gate, it judges
production, not the branch). Needs `SUPABASE_SERVICE_ROLE_KEY`; refuses to exit 0 unconfigured.

---

## Walking the create-project flow (SCRUM-378)

`scripts/qa-walk-create-project.mjs` drives create-project against a live deployment as a real
signed-in user and asserts the two things Karen reported: that the new project is **visible on
/projects afterwards**, and that re-using the name shows the real duplicate message rather than a
generic digest.

```bash
QA_WALK_EMAIL='<qa account>' QA_WALK_PASSWORD='<password>' \
  node scripts/qa-walk-create-project.mjs
# or against a preview
QA_WALK_EMAIL=… QA_WALK_PASSWORD=… node scripts/qa-walk-create-project.mjs --base-url https://<preview>.vercel.app
```

**Why it is a script and not a line in a checklist.** SCRUM-378 was reported twice. Throughout, the
repo had a green suite, a clean typecheck and successful deploys — none of which could see the
defect, because it lived in the relationship between a server action and the page the user came
back to. Only walking the path can see that. Exit codes distinguish the two outcomes that must
never be confused: `1` = an assertion failed (a real finding), `2` = the run could not be completed
(**not** a pass — nothing after the failure point was checked).

**Two things it encodes, both of which cost a run to discover:**

- The **Terms of Use gate** is a full-viewport `z-[100]` overlay that intercepts every click until
  accepted. It is correct behaviour, but any run on an account that has not accepted the current
  terms silently loses its first interaction to it — the click resolves to the button and then
  times out, which reads as a broken selector.
- It asserts `location.hostname` **in the same call** as the measurements. A headless browser that
  has reset returns `about:blank` data that is indistinguishable from a real result.

### A fourth account exists outside the three above

`dennis@factory2key.com.au` is an `owner` of its own org (`ca90c098-…`) and is **not** one of the
three identities in the table above — note it is a different address from the documented `user`
identity, `dennis+qauser@factory2key.com.au`. Its password was rotated on 2026-08-09 to run the
SCRUM-378 verification and is stored at `~/.mmc-qa-creds` on Dennis's machine. If it had a prior
password recorded elsewhere, that one no longer works. Prefer the three documented identities;
this one is recorded here so it is not a mystery account.
