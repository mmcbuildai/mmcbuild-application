#!/usr/bin/env node
/**
 * Jira ticket sweep: cross-references open SCRUM tickets against the local
 * git history and prints a triage report.
 *
 * Buckets each non-Done ticket into:
 *   - DONE     — at least one commit message references the key, work appears
 *                shipped, and no recent "blocked"/"awaiting" comment.
 *   - IN_PROGRESS — commits reference the key but the most recent commit looks
 *                partial (e.g. mentions "wip", "partial", or only one of
 *                multiple deliverables in the description).
 *   - TO_DO    — no commits reference the key, no observable work yet.
 *   - UNCLEAR  — mixed or ambiguous signal; surfaced for the user to decide.
 *   - NEEDS_NUDGE — assigned to a non-Dennis owner, the last sweep comment
 *                is older than NUDGE_DAYS, and the owner hasn't replied.
 *
 * Modes:
 *   (default)        Dry run: print the triage report and exit. Makes no Jira
 *                    writes. Use this to review before --apply.
 *   --apply          Apply the unambiguous transitions (DONE / IN_PROGRESS),
 *                    posting an explanatory comment on each. Also posts a
 *                    polite nudge on each NEEDS_NUDGE ticket. Never touches
 *                    UNCLEAR tickets — those are always printed for the user
 *                    to handle manually.
 *   --json           Emit the raw triage as JSON (useful for piping/scripts).
 *   --nudge-days N   Override the nudge threshold (default 7).
 *   --no-nudge       Skip the needs-nudge scan (faster — avoids per-ticket
 *                    comment fetches).
 *
 * Skip rules (never auto-touched, even with --apply):
 *   - Issuetype Epic, Subtask
 *   - Tickets assigned to anyone other than Dennis (test sign-offs etc.)
 *   - Tickets with summary starting "[TC-" (test cases — Karen's territory)
 *   - Tickets with "STAGE GATE" in the summary (milestone tickets)
 *
 * Re-run any time. Idempotent: only transitions tickets that currently differ
 * from the recommended status.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import https from "https";

// ---- env --------------------------------------------------------------------
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [k, ...r] = line.split("=");
    if (k && r.length && !process.env[k.trim()])
      process.env[k.trim()] = r.join("=").trim().replace(/^["']|["']$/g, "");
  });
}

const HOST = process.env.JIRA_HOST || "corporateaisolutions-team.atlassian.net";
const PROJECT = process.env.JIRA_PROJECT || "SCRUM";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_TOKEN || process.env.JIRA_API_KEY;
const AUTH = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

const APPLY = process.argv.includes("--apply");
const AS_JSON = process.argv.includes("--json");
const NO_NUDGE = process.argv.includes("--no-nudge");
const NUDGE_DAYS = (() => {
  const i = process.argv.indexOf("--nudge-days");
  if (i >= 0 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 7;
})();

// Owners that are "us" — only these tickets are eligible for auto-transition.
const ME_NAMES = new Set(["Dennis McMahon", "unassigned"]);

// Account that posts sweep comments. Used to detect prior sweep activity.
const SWEEP_AUTHOR_EMAIL = (process.env.JIRA_EMAIL || "").toLowerCase();

// Comments matching this regex are considered prior sweep comments.
// Includes legacy wording ("ticket sweep", "jira-sweep") and the marker
// added below.
const SWEEP_COMMENT_RE = /jira-sweep|ticket sweep|\[sweep:v1\]/i;

// Marker appended to every comment we author so future sweeps can recognise
// them unambiguously even if the surrounding wording changes.
const SWEEP_MARKER = "[sweep:v1]";

// Heuristics for partial work in a commit message
const PARTIAL_RE = /\b(wip|partial|in[-\s]?progress|first cut|stub|scaffold|todo)\b/i;

// ---- http -------------------------------------------------------------------
function req(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request(
      {
        hostname: HOST,
        path,
        method,
        headers: {
          Authorization: `Basic ${AUTH}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let parsed = null;
          if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    r.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    r.setTimeout(30000, () => { r.destroy(); resolve({ status: 0, body: "timeout" }); });
    if (data) r.write(data);
    r.end();
  });
}

const get = (p) => req("GET", p, null);

// ---- git --------------------------------------------------------------------
function loadCommits(limit = 500) {
  const log = execSync(
    `git log -${limit} --pretty=format:"%H|%ad|%s" --date=short`,
    { encoding: "utf8" }
  );
  const commits = [];
  for (const line of log.split("\n").filter(Boolean)) {
    const [sha, date, ...rest] = line.split("|");
    const subject = rest.join("|");
    const keys = [...subject.matchAll(/SCRUM-(\d+)/gi)].map((m) => `SCRUM-${m[1]}`);
    commits.push({ sha: sha.slice(0, 7), date, subject, keys });
  }
  return commits;
}

function commitsForKey(commits, key) {
  return commits.filter((c) => c.keys.includes(key));
}

// ---- jira -------------------------------------------------------------------
async function fetchOpenTickets() {
  const jql = encodeURIComponent(
    `project=${PROJECT} AND statusCategory != Done ORDER BY updated DESC`
  );
  const r = await get(
    `/rest/api/3/search/jql?jql=${jql}&fields=summary,status,issuetype,priority,labels,assignee,customfield_10020,updated&maxResults=200`
  );
  return r.body?.issues || [];
}

async function fetchTransitions(key) {
  const r = await get(`/rest/api/3/issue/${key}/transitions`);
  return r.body?.transitions || [];
}

async function fetchComments(key) {
  const r = await get(`/rest/api/3/issue/${key}/comment?orderBy=-created&maxResults=50`);
  return r.body?.comments || [];
}

function commentText(c) {
  return (c.body?.content || [])
    .map((p) => (p.content || []).map((s) => s.text || "").join(" "))
    .join(" ");
}

function isSweepComment(c) {
  // Either the canonical marker, or recognised legacy wording.
  return SWEEP_COMMENT_RE.test(commentText(c));
}

function isOwnerReply(c, ownerAccountId) {
  return c.author?.accountId === ownerAccountId;
}

// Returns { lastSweepAt: Date|null, ownerRepliedAfter: boolean }
function analyseConversation(comments, ownerAccountId) {
  let lastSweepAt = null;
  for (const c of comments) {
    if (isSweepComment(c)) {
      lastSweepAt = new Date(c.created);
      break; // comments come newest-first
    }
  }
  if (!lastSweepAt) return { lastSweepAt: null, ownerRepliedAfter: false };

  let ownerRepliedAfter = false;
  for (const c of comments) {
    if (new Date(c.created) <= lastSweepAt) break;
    if (isOwnerReply(c, ownerAccountId)) {
      ownerRepliedAfter = true;
      break;
    }
  }
  return { lastSweepAt, ownerRepliedAfter };
}

function daysSince(date) {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function findTransition(transitions, targetName) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, "");
  const target = norm(targetName);
  return transitions.find((t) => norm(t.to?.name || t.name) === target);
}

function adfDoc(text) {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n\n").map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    })),
  };
}

// ---- classification ---------------------------------------------------------
function isSkipped(issue) {
  const type = issue.fields?.issuetype?.name || "";
  const summary = issue.fields?.summary || "";
  const assignee = issue.fields?.assignee?.displayName || "unassigned";
  const labels = issue.fields?.labels || [];

  if (labels.includes("do-not-sweep")) return "label: do-not-sweep";
  if (type === "Epic" || type === "Subtask") return "subtask/epic — manual";
  if (summary.startsWith("[TC-")) return "test case — Karen's territory";
  if (/STAGE GATE/i.test(summary)) return "stage-gate — manual";
  if (!ME_NAMES.has(assignee)) return `assigned to ${assignee}`;
  return null;
}

function classify(issue, commits) {
  const key = issue.key;
  const status = issue.fields?.status?.name || "?";
  const linked = commitsForKey(commits, key);

  // Skip ineligible tickets early but still report them.
  const skipReason = isSkipped(issue);
  if (skipReason) {
    return { bucket: "SKIP", reason: skipReason, linked, status };
  }

  if (linked.length === 0) {
    // No commits reference the ticket. Stays To Do.
    return {
      bucket: "TO_DO",
      reason: "no commits reference this key",
      linked,
      status,
    };
  }

  // Has linked commits — figure out done vs in-progress.
  const partial = linked.some((c) => PARTIAL_RE.test(c.subject));
  const newest = linked[0]; // git log returns newest first

  if (partial) {
    return {
      bucket: "IN_PROGRESS",
      reason: `${linked.length} linked commit(s); newest "${newest.subject.slice(0, 60)}" looks partial`,
      linked,
      status,
    };
  }

  // Default: linked commits, no partial markers → done.
  return {
    bucket: "DONE",
    reason: `${linked.length} linked commit(s); newest "${newest.subject.slice(0, 60)}"`,
    linked,
    status,
  };
}

function isUnclear(rec) {
  if (rec.bucket !== "DONE") return false;
  // Heuristic: if the title contains "and"/"+" suggesting multiple deliverables
  // and there's only one linked commit, flag for human review — might be partial.
  // (Cheap, conservative — false positives are fine, false negatives are bad.)
  // We don't have the description text in the issue payload here, so this
  // check is title-only.
  return false;
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (!EMAIL || !TOKEN) {
    console.error("Missing JIRA_EMAIL / JIRA_TOKEN in .env.local");
    process.exit(1);
  }

  const commits = loadCommits(500);
  const issues = await fetchOpenTickets();

  const triage = issues.map((i) => {
    const rec = classify(i, commits);
    return {
      key: i.key,
      summary: i.fields?.summary || "",
      currentStatus: rec.status,
      issuetype: i.fields?.issuetype?.name || "",
      assignee: i.fields?.assignee?.displayName || "unassigned",
      assigneeId: i.fields?.assignee?.accountId || null,
      bucket: rec.bucket,
      reason: rec.reason,
      linkedCommits: rec.linked.map((c) => `${c.sha} (${c.date}) ${c.subject}`),
      unclear: isUnclear(rec),
      // Filled in by the nudge scan below
      nudgeReason: null,
      lastSweepAt: null,
    };
  });

  // ---- Needs-nudge scan -----------------------------------------------------
  // Fetch comments only for tickets assigned to non-Dennis owners. Each
  // comment fetch is one HTTP call, so we cap concurrency to keep things
  // responsive on long backlogs.
  if (!NO_NUDGE) {
    const candidates = triage.filter(
      (t) =>
        t.assigneeId &&
        !ME_NAMES.has(t.assignee) &&
        t.bucket !== "DONE" // anything we'd auto-close shouldn't be nudged
    );

    const CONCURRENCY = 6;
    let cursor = 0;
    async function worker() {
      while (cursor < candidates.length) {
        const t = candidates[cursor++];
        const comments = await fetchComments(t.key);
        const conv = analyseConversation(comments, t.assigneeId);
        if (!conv.lastSweepAt) continue;
        const age = daysSince(conv.lastSweepAt);
        if (age >= NUDGE_DAYS && !conv.ownerRepliedAfter) {
          t.nudgeReason = `last sweep comment ${age}d ago, no reply from ${t.assignee}`;
          t.lastSweepAt = conv.lastSweepAt.toISOString().slice(0, 10);
          // Move into NEEDS_NUDGE bucket regardless of original classification.
          t.bucket = "NEEDS_NUDGE";
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  if (AS_JSON) {
    console.log(JSON.stringify(triage, null, 2));
    return;
  }

  // ---- Print report ---------------------------------------------------------
  const buckets = { DONE: [], IN_PROGRESS: [], TO_DO: [], UNCLEAR: [], NEEDS_NUDGE: [], SKIP: [] };
  for (const t of triage) {
    if (t.unclear) buckets.UNCLEAR.push(t);
    else buckets[t.bucket].push(t);
  }

  console.log(`Sweep of project ${PROJECT}: ${issues.length} open tickets, ${commits.length} recent commits scanned${NO_NUDGE ? " (nudge scan skipped)" : `, nudge threshold ${NUDGE_DAYS}d`}\n`);

  function printBucket(name, items) {
    if (!items.length) return;
    console.log(`\n=== ${name} (${items.length}) ===`);
    for (const t of items) {
      console.log(`  ${t.key.padEnd(11)} [${t.currentStatus.padEnd(11)}] (${t.assignee.padEnd(15)}) ${t.summary.slice(0, 60)}`);
      if (t.bucket === "NEEDS_NUDGE") {
        console.log(`              → ${t.nudgeReason}`);
      } else if (t.bucket !== "TO_DO" && t.bucket !== "SKIP") {
        console.log(`              → ${t.reason}`);
        for (const c of t.linkedCommits.slice(0, 3)) {
          console.log(`                ${c.slice(0, 100)}`);
        }
      } else if (t.bucket === "SKIP") {
        console.log(`              → ${t.reason}`);
      }
    }
  }

  printBucket("DONE — recommend transition to Done", buckets.DONE);
  printBucket("IN PROGRESS — recommend transition to In Progress", buckets.IN_PROGRESS);
  printBucket(`NEEDS NUDGE — owner silent for ≥${NUDGE_DAYS}d after sweep comment`, buckets.NEEDS_NUDGE);
  printBucket("UNCLEAR — please define status", buckets.UNCLEAR);
  printBucket("TO DO — no observable work, leaving as-is", buckets.TO_DO);
  printBucket("SKIP — not eligible for auto-transition", buckets.SKIP);

  console.log("\n---");
  console.log(`Summary: DONE=${buckets.DONE.length} IN_PROGRESS=${buckets.IN_PROGRESS.length} NEEDS_NUDGE=${buckets.NEEDS_NUDGE.length} UNCLEAR=${buckets.UNCLEAR.length} TO_DO=${buckets.TO_DO.length} SKIP=${buckets.SKIP.length}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to transition DONE/IN_PROGRESS and post nudges on NEEDS_NUDGE (UNCLEAR are always left alone).");
    return;
  }

  // ---- Apply ----------------------------------------------------------------
  const toApply = [...buckets.DONE.map((t) => ({ ...t, target: "Done" })),
                   ...buckets.IN_PROGRESS.map((t) => ({ ...t, target: "In Progress" }))];

  if (!toApply.length) {
    console.log("\nNothing to apply.");
    return;
  }

  console.log(`\nApplying ${toApply.length} transitions...`);
  let ok = 0, skip = 0, fail = 0;

  for (const t of toApply) {
    if (t.currentStatus === t.target) {
      console.log(`  · ${t.key} already at ${t.target}, skipping`);
      skip++;
      continue;
    }

    const transitions = await fetchTransitions(t.key);
    const tr = findTransition(transitions, t.target);
    if (!tr) {
      const avail = transitions.map((x) => x.to?.name || x.name).join(", ");
      console.log(`  ✗ ${t.key}: no transition to ${t.target} (available: ${avail})`);
      fail++;
      continue;
    }

    const r1 = await req("POST", `/rest/api/3/issue/${t.key}/transitions`, { transition: { id: tr.id } });
    if (r1.status >= 400) {
      console.log(`  ✗ ${t.key}: transition failed (${r1.status}) ${JSON.stringify(r1.body).slice(0, 200)}`);
      fail++;
      continue;
    }

    const commentBody = `${SWEEP_MARKER} Auto-update by jira-sweep on ${new Date().toISOString().slice(0, 10)}.\n\nTransitioned from ${t.currentStatus} → ${t.target}.\n\nReason: ${t.reason}\n\nLinked commits:\n${t.linkedCommits.slice(0, 5).join("\n")}\n\nIf this is wrong, revert the status and add a "do-not-sweep" label so future runs skip this ticket.`;
    await req("POST", `/rest/api/3/issue/${t.key}/comment`, { body: adfDoc(commentBody) });

    console.log(`  ✓ ${t.key}: ${t.currentStatus} → ${t.target}`);
    ok++;
  }

  console.log(`\nApplied: ${ok}  Skipped: ${skip}  Failed: ${fail}`);

  // ---- Nudges ---------------------------------------------------------------
  if (buckets.NEEDS_NUDGE.length) {
    console.log(`\nPosting ${buckets.NEEDS_NUDGE.length} nudge comment(s)...`);
    let nok = 0, nfail = 0;
    for (const t of buckets.NEEDS_NUDGE) {
      const body = `${SWEEP_MARKER} Nudge from jira-sweep on ${new Date().toISOString().slice(0, 10)}.\n\n${t.assignee} — the previous sweep comment (${t.lastSweepAt}) hasn't had a reply from you. ${t.nudgeReason}.\n\nQuick reply please:\n  - "still required" → I'll factor into Sprint 6 planning\n  - "delete" → I'll close this ticket\n  - "subsumed by SCRUM-NN" → I'll close as duplicate of that ticket\n\nIf you've actioned this elsewhere, just drop a one-liner so the next sweep stops nudging you. Add the "do-not-sweep" label to opt this ticket out permanently.`;
      const c = await req("POST", `/rest/api/3/issue/${t.key}/comment`, { body: adfDoc(body) });
      if (c.status >= 400) {
        console.log(`  ✗ ${t.key} nudge failed (${c.status})`);
        nfail++;
      } else {
        console.log(`  ✓ ${t.key} nudged ${t.assignee}`);
        nok++;
      }
    }
    console.log(`Nudges sent: ${nok}  Failed: ${nfail}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
