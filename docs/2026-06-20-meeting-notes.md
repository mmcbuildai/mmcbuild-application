# MMC Build — meeting notes (20 June 2026, Dennis + Karen)

*Auto-transcribed (faster-whisper base.en); names/terms approximate. Full transcript: `transcript.md` in the recording folder.*

A live walkthrough of the beta app as a dummy tester, surfacing bugs + workflow gaps. Notable: several of the biggest items raised were fixed/built the next day (21 June) — flagged ✅ below.

---

## Already addressed (shipped 21 June)

- ✅ **Comply timing out on the energy/Section J analysis.** Karen's run hit ~14 min and got stuck. Root cause Dennis called out on the call [~0:39]: it analysed **Section J of NCC Volume One (commercial)** first, then realised the plan is **residential (Volume Two, Part 13)**, having "built up so much caching it timed itself out." → Fixed the immediate failure (maxTokens 4096→8192 was truncating the energy JSON), added the stuck-job reaper + onFailure so a hung run surfaces an error instead of an infinite spinner. **The deeper Volume One/Two selection issue is still open — see Actions #1.**
- ✅ **Fields not pre-populating from the uploaded design.** "It's doing all that work and not transferring the data into the pre-populated fields — stories, GFA…" [~0:42]. → Built the questionnaire design-prefill: an on-upload lightweight extraction + "**Extracted from your design**" green badges and "Fill in yourself" on the rest — exactly the UX Dennis described on the call [~1:04].
- ✅ **"Where does the remediation response go?"** Karen sent a finding for remediation, responded, submitted — "where's it going? where should it show me?" [~1:07]. And Dennis mapped the full loop [~1:12–1:15]: a static issues list → responses → updated drawings back into the workflow → when all amended, "**recompile into a new overall design, run it again against compliance**." → Built it: Phase 1 (response notes + file visible + email notify), Phase 2 (Open-Items board, resolve/waive/reopen), Phase 3 (versioned re-check + v1→v2 delta, waivers carried forward). Dennis on the call: "I'll capture that workflow and map it out" — done.

---

## Open action items (app)

1. **Smarter NCC volume/category selection (the real fix behind the timeout).** Use the questionnaire building-type (residential / duplex / boarding house) to SKIP Section J Volume One (commercial) for residential plans, so Comply goes straight to the right volume — less time, fewer tokens, lower cost, more accurate. Dennis [~0:40]: "the more mechanical deterministic choices you can make, the easier on the back end for the LLM to go directly… less tokens burned." HIGH.
2. **Progress bar + honest time estimate on heavy runs.** Keep/extend the progress bar (testers need to see it "inching along," not a stuck spinner). Update the "typically 2–4 min" copy → "5–8 min", ideally **banded by file size** [~1:39].
3. **Mislabelled nav link.** On the compliance-check page the top link reads "**Back to project**" but actually lands on Comply. Relabel to "Back to comply." [~0:27].
4. **Beta task checklist should tick only on completion.** A module task shows as done/in-progress when you *pick* it, not when the run finishes. "They should all show only on full completion of the process." The Comply task didn't tick off after the report finished [~0:29, ~1:16].
5. **Demo reset must refresh ALL modules.** "Start clean demo session" doesn't reset every module's progress. Dennis: "I'll set it so the demo refreshes all modules" [~1:46].
6. **Delete-tester must remove the back-end record.** Karen deleted Sharon's invite, re-added, got "duplicate" — "deletes from the front end but not the back end" [~0:24]. Breaks re-invite.
7. **Knowledge base.** (a) Only 2 documents in there — add more relevant docs (it's what compliance draws on). (b) A non-admin/demo user clicking "Knowledge" gets an **application error** — should block gracefully, not error [~0:34].
8. **Quote (cost) optimisation.** Run took ~9–11 min on the Gladesville boarding house (~$11–12M). Needs: a **meta-search-first** (don't keep hunting for a component that isn't in the tables); a **default/placeholder for every component** ("data to be provided / TBC") so it stops spinning on missing items; surface price **source** (manufacturer vs internet-average) [~1:41].
9. **Allow export with open items.** Some users want to export the report with a few problems still open (to take to a meeting), vs gating the final report until everything's resolved. Decide + small build [~1:16].
10. **Cost/billing dashboard (Dennis, in progress).** Real-time per-run API cost tracking to bump into MMC admin; later, trial cheaper models per task (downgrade from Sonnet where the cheaper model still does the job) once the workflow is validated [~1:00–1:03].

## Open items (Karen / business)

- **Email deliverability.** Invite emails landing in spam (sent via HubSpot). Karen to send invites outside HubSpot + tell testers to check spam for the MMC Build invite they must accept. Possible deliverability hardening on our side [~0:17, ~1:23].
- **New beta testers.** Katherine Jackson — town planner, Geraldton — Karen to set up. (Also an unsolicited "Anica" email referencing the auth-callback fix — looks like vendor/recruiter outreach, low priority.)
- **Overseas market research** (UK / US / NZ) for investors who want overseas scaling. US = per-state compliance (but a possible federal modular standard under discussion); Europe more uniform; UK as the entry point. Dennis offered to build a forecasting tool to pull construction + MMC-adoption numbers [~0:53–0:57].

## Tester activity / dashboard

- Recurring worry: testers may have logged in but aren't showing on the dashboard. Confirmed both on the call and via the DB check next day: **all real activity IS captured — if it's not on the dashboard, they haven't done anything** (no data is being lost). The earlier "stuck processing" rows were the only gap, now handled by the reaper.
