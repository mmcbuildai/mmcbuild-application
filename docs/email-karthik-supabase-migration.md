# Draft email — Karthik (Supabase data migration)

**To:** Karthik
**Cc:** —
**Subject:** MMC Build — your Supabase database + files are loaded (please verify + next steps)

---

Hi Karthik,

The MMC Build database has been migrated into **your** Supabase project (`lztzyfeivpsbqbsfzctw`, Sydney). Your password reset came through fine and authenticated first time — thanks for the quick turnaround.

To be clear on method: this was a **copy, not a move**. The old CAS-hosted project (Mumbai) is left fully intact as a rollback, so there is zero risk to live data while we cut over. Nothing is "live" on your project yet — the application still points at the old database until the env + DNS swap in the cutover window.

## What was loaded (all error-free)

| Layer | Result |
|---|---|
| Schema | **60 tables**, 131 functions, RLS policies, triggers; `pgvector 0.8.0` auto-installed |
| Data | **2,602 rows** across the populated tables |
| Auth | **17 users + 17 identities** (your existing sign-ins carry over) |
| Storage | **12 buckets + 119 files** — records **and the file binaries** copied + verified (source = dest, 119/119) |

## Please verify (run this in your SQL editor)

Dashboard → **SQL Editor** → New query → paste + run. This returns an exact row count for every table — it should match the numbers below.

```sql
select table_name,
 (xpath('/row/c/text()',
   query_to_xml(format('select count(*) c from %I.%I', table_schema, table_name),
   false, true, '')))[1]::text::bigint as rows
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by rows desc, table_name;
```

Quick gut-check — the headline numbers you should see:

```sql
select
  (select count(*) from auth.users)                as auth_users,        -- expect 17
  (select count(*) from public.organisations)      as organisations,     -- expect 15
  (select count(*) from public.projects)           as projects,          -- expect 11
  (select count(*) from public.profiles)           as profiles,          -- expect 17
  (select count(*) from public.compliance_findings) as compliance_findings, -- expect 363
  (select count(*) from public.ai_usage_log)       as ai_usage_log,      -- expect 767
  (select count(*) from storage.buckets)           as storage_buckets;   -- expect 12
```

Top tables by row count (the full list comes out of the first query):

```
ai_usage_log          767      report_versions        20
cost_line_items       674      test_3d_jobs           19
compliance_findings   363      profiles               17
document_embeddings   267      organisations          15
design_suggestions     98      design_checks          13
cost_reference_rates   71      knowledge_documents    12
rd_time_entries        51      projects               11
rd_commit_logs         51      project_site_intel     10
rd_auto_entries        51      lessons                 9
                               (… 21 tables are legitimately empty)
TOTAL: 2,602 data rows across 60 tables
```

If those match, the database copy is confirmed complete.

## Two things from you

The data side is fully done — schema, data, auth, **and the storage files** (all 119, verified source = dest). What's left is the cutover, and after it, rotating the keys.

**1. Work your half of the cutover runbook.**
Your steps (Vercel project + env vars, domains/DNS with Karen, HubSpot allowed-domains) are laid out in order in `docs/HANDOVER_CUTOVER_RUNBOOK.md`. The only step that needs us both in one window is the final flip (your env swap + my Supabase Auth URL change + Karen's DNS) — we'll coordinate a ~1-hour slot for that.

**2. After cutover is verified — rotate both secrets you shared.**
Once everything is confirmed working on your infrastructure, please rotate the two credentials that passed through this migration, so neither lingers:
- **Database password:** Project Settings → Database → **Reset database password**.
- **Service-role / API keys:** Project Settings → API → **rotate the JWT secret** (regenerates the `anon` + `service_role` keys). Note this invalidates the old keys, so update the app's Vercel env vars with the new values in the same step.

That's it — the heavy lifting (schema + data + auth + storage files) is all done and verified on your side. The only work left is the cutover window and the post-cutover key rotation above.

Cheers,
Dennis

---

*Internal notes (not for the email):*
- Source: `skyeqimwnyuuozvhubdc` (CAS, ap-south-1 Mumbai) → Dest: `lztzyfeivpsbqbsfzctw` (MMC, ap-southeast-2 Sydney), session pooler `aws-1-ap-southeast-2.pooler.supabase.com:5432`.
- Restore order: roles → schema → data → auth (per `cais-shared-services/SUPABASE_MIGRATION_PLAYBOOK.md`).
- Auth transient tables (sessions/refresh_tokens/one_time_tokens/flow_state/mfa) intentionally not carried — users re-login.
- Local dump files (`supabase/dump-*.sql`, PII) deleted 2026-05-26 after storage verified.
- Storage file copy COMPLETE 2026-05-26 (119/119, source = dest). Dest service-role key at `~/.mmc-serv-rol`; CAS source key at `~/.mmc-src-srv`.
