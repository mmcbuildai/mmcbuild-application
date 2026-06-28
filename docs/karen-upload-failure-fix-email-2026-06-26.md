# Reply to Karen — plan upload failure (2026-06-26)

**To:** karen.engel@mmcbuild.com.au
**Cc:** karthik.rao@mmcbuild.com.au
**Subject:** Re: Karen, Karthik, re work from last night — upload failure found & fixed

(Gmail draft created: id r-9026391152051577231)

---

Hi Karen,

Thanks for the clear report and the screenshot — that was enough to find it precisely.

**What happened**
The upload didn't fail because of the plan or the file. It failed because of the demo itself. When you use the "refresh demo", it signs you in as a shared demo tester account rather than your own account. We recently tightened the security rules on plan storage so that uploads are locked to your own organisation — but that change accidentally left the "tester" account type out of the list of accounts allowed to upload. So the moment you uploaded inside the demo, the system blocked it. On your own (owner) account it works normally, which is why it worked before and works for us.

I confirmed this directly against the live system today: an upload on your own account succeeds; the same upload on the demo tester account is refused with exactly the message you saw.

**What to do right now (works immediately)**
Skip the "refresh demo" for real testing. Instead, from your normal logged-in account, click New Project, then upload the Terrace plan there. That path isn't affected and will go straight through.

**The permanent fix**
The fix is written and ready (it adds the tester account back into the list allowed to upload, while keeping every organisation's files locked to itself). Karthik — it's a one-line database policy change, PR #53 on mmcbuildai/mmcbuild-application (migration 00066). Once it's applied to the live database, the demo upload path works for testers too; I've got a quick verification ready to confirm it the moment it's in.

I'll let you know as soon as it's live.

Thanks,
Dennis

---

## Engineering notes (not for the client)

- **Root cause:** prod `storage.objects` INSERT policy on bucket `plan-uploads` had drifted from repo migration `00015` (permissive) to a hardened `(storage.foldername(name))[1] = get_user_org_id()::text AND role IN ('owner','admin','architect','builder')`. The `beta` role is excluded → the shared `beta.demo@mmcbuild.com.au` account (role `beta`) and any invited beta tester cannot upload.
- **Proof (live, minted sessions):** owner→own org 200; owner→foreign org 403; beta→own/active org 403; beta→another membership 403.
- **Why we missed it:** we QA as `owner`; the demo (and real testers) run as `beta`. The client-side storage upload is the only user-context write in the chain — Comply/Build/Quote write via the admin client and bypass RLS, so beta already works for them (no downstream dead-end from this fix).
- **Fix:** migration `00066_plan_uploads_beta_insert.sql` (PR #53) — storage INSERT → org-scoped/any-member; `plans` INSERT role gate gains `beta`. Apply via `supabase db push` (ref `lztzyfeivpsbqbsfzctw`) or the SQL editor. Verify by replaying the demo-account upload (expect 200).
- **Standing gap:** mmcbuild has no `owner`-vs-`beta` QA matrix; every "works for us / breaks for Karen" traces to testing only as owner. Ties to SCRUM-308 (no working QA account).
