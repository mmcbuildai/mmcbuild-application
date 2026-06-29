# Brief — Verify & finalise HLD/LLD against deployed code

> **For:** Claude Code (mmcbuild-application repo)
> **Type:** Documentation verification pass
> **Repo:** `mmcbuild-ai/mmcbuild-application`
> **Files in scope:** `docs/HLD.md`, `docs/LLD.md`
> **Raised by:** Karthik Rao (29 Jun 2026) — wants HLD/LLD markdown in `docs/`, MMC Quote logic captured in the LLD, kept current as features ship.

---

## Context (confirmed)

Two reference docs have been drafted and committed to `docs/`:
- `HLD.md` — architecture overview (modules, stack, data flows, integrations, deployment).
- `LLD.md` — implementation detail; first feature entry is the **MMC Quote cost engine**.

Both were drafted from the PRD, the accepted quote (GBTA-MMC-2026-001), and a written description of the Quote rework — **not** read off the code. Every claim is tagged `[A]` (asserted, unverified). Your job is to confirm or correct each one against the deployed codebase.

The marker convention is defined at the top of each file: `[A]` asserted → promote to `[V]` verified (with a file path) or `[?]` gap. **Deployed code is the source of truth.** Where a doc and the code disagree, fix the doc to match the code and note the correction.

---

## Hard constraints

1. **Read before asserting.** Do not promote any `[A]` to `[V]` without opening the actual file that confirms it. Cite the path (and line/symbol where useful).
2. **No code changes.** This is a documentation pass only. Do not modify application code, migrations, or config. If you find a bug, note it in the doc's verify section — do not fix it here.
3. **No secrets in the docs.** Reference env var *names* only, never values.
4. **Don't delete asserted claims you can't verify** — downgrade them to `[?]` with a one-line note on what's unresolved.

---

## Tasks (sequenced)

### 1. Reconcile the three known open questions first
- **Deployed stack** — confirm Vercel + Supabase + Inngest matches what's wired in the repo (config, clients, deploy setup). PRD §4 (AWS/Azure) is the *post-MVP migration target*, not current — do not treat it as a discrepancy.
- **LLM routing** — quote said OpenAI primary / Claude fallback; production is believed to be Anthropic primary (prompt caching). Confirm current primary vs. fallback, OpenAI's role (embeddings vs. generation), and where routing is decided. Update the HLD stack table + verify note.
- **MMC Quote engine** — two versions are described (quote Stage 3 AI-material-mapping vs. June market-rate buildup). Determine which is deployed (or hybrid) and document the real implementation. Confirm every number in `LLD.md §1`: base rate (~$2,175/m²), ±15% band, $3,305–$4,083/m² reference range, 93 m² → ~$3,300/m² benchmark, green/amber labelling, and how SIP / 3D-print / NSW gaps are handled.

### 2. Complete the HLD verification checklist (§10)
Work each box: module→route mapping, sync/async boundary (what runs in Inngest), pgvector/RAG path, RLS policies present on tenant tables + storage buckets, framework/SDK version pins from `package.json`. Promote every `[A]` to `[V]`/`[?]`.

### 3. Complete the LLD MMC Quote verify checklist (§1)
Match each line to a constant/config/query in the repo or correct it.

### 4. Produce a corrections summary
At the end of the run, output a short list: what was confirmed, what was corrected (claim → actual), and what remains `[?]`. This is the evidence that the pass actually read the code.

---

## Definition of Done

- [ ] Every `[A]` in both docs is resolved to `[V]` (with file ref) or `[?]` (with note).
- [ ] The three open questions (stack, LLM routing, Quote engine) are explicitly answered in the docs.
- [ ] `docs/HLD.md` and `docs/LLD.md` updated and committed.
- [ ] Corrections summary produced.
- [ ] A note added to both docs stating the convention going forward: **any feature PR must add or update its LLD entry as part of its own Definition of Done** (this is Karthik's "keep it updated" requirement, made enforceable).

## Human handoff points

- If the Quote engine in code materially differs from both described versions, **stop and flag to Dennis** before rewriting the entry — don't guess intent.
- Any bug found during verification (e.g. an RLS table with no policy) → note in the doc and raise to Dennis for a separate ticket; do not fix in this pass.
