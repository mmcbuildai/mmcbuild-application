#!/usr/bin/env node
/**
 * Persona-layer cleanup — Jira reconciliation.
 *
 * After the v0.4.x cleanup that removed persona/role gating, seven test
 * cases in the regime are either obsolete or need their definitions
 * realigned. This script:
 *
 *   - Looks up each test case ticket by its TC- code in the summary
 *   - Posts an explanatory comment
 *   - Transitions obsolete tickets to "Won't Do" (or "Done" with that
 *     resolution if "Won't Do" is not a direct transition)
 *
 * Defaults to --dry-run. Pass --apply to actually post + transition.
 *
 *   node scripts/jira-cleanup-persona-tickets.mjs            # dry run
 *   node scripts/jira-cleanup-persona-tickets.mjs --apply    # for real
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import https from "https";

// ── env ────────────────────────────────────────────────────────────────
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length && !process.env[key.trim()])
      process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  });
}

const HOST = process.env.JIRA_HOST || "corporateaisolutions-team.atlassian.net";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_TOKEN || process.env.JIRA_API_KEY;
const AUTH = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const APPLY = process.argv.includes("--apply");

// ── http ───────────────────────────────────────────────────────────────
function api(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: HOST, path, method,
      headers: {
        Authorization: `Basic ${AUTH}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        let parsed = null;
        if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 0, body: "timeout" }); });
    if (data) req.write(data);
    req.end();
  });
}

function adfDoc(text) {
  const paragraphs = text.split("\n\n").map((p) => ({
    type: "paragraph",
    content: [{ type: "text", text: p }],
  }));
  return { type: "doc", version: 1, content: paragraphs };
}

// ── ticket lookup by TC code ───────────────────────────────────────────
// Atlassian deprecated GET /rest/api/3/search (returns 410). The replacement
// is POST /rest/api/3/search/jql with the JQL in the request body.
async function findTicketByTcCode(tcCode) {
  const r = await api("POST", `/rest/api/3/search/jql`, {
    jql: `project = SCRUM AND summary ~ "${tcCode}"`,
    fields: ["summary", "status"],
    maxResults: 5,
  });
  if (r.status >= 400 || !r.body?.issues) {
    console.error(`  ✗ search failed for ${tcCode}: ${r.status} ${typeof r.body === "string" ? r.body.slice(0, 200) : ""}`);
    return null;
  }
  const exact = r.body.issues.find((i) =>
    (i.fields.summary || "").toUpperCase().includes(tcCode.toUpperCase())
  );
  if (!exact) {
    console.warn(`  ? no ticket found with "${tcCode}" in summary`);
    return null;
  }
  return { key: exact.key, summary: exact.fields.summary, status: exact.fields.status?.name };
}

// ── actions on ticket ──────────────────────────────────────────────────
async function postComment(key, text) {
  const r = await api("POST", `/rest/api/3/issue/${key}/comment`, { body: adfDoc(text) });
  if (r.status >= 400) { console.error(`    ✗ comment failed: ${r.status}`); return false; }
  return true;
}

async function transitionToWontDo(key) {
  const trans = await api("GET", `/rest/api/3/issue/${key}/transitions`);
  const targets = trans.body?.transitions || [];
  // Prefer a transition literally named "Won't Do" or similar, else any
  // transition that lands the issue in a "done" status category. We DO
  // want the issue closed; we just want it tagged so future readers see
  // it was retired by design, not completed.
  const wontDo =
    targets.find((t) => /won't ?do|won t do|wontdo|obsolete|cancel/i.test(t.name)) ||
    targets.find((t) => /closed/i.test(t.name)) ||
    targets.find((t) => /^done$/i.test(t.name)) ||
    targets.find((t) => t.to?.statusCategory?.key === "done");
  if (!wontDo) {
    console.error(`    ✗ no closing transition found. available: ${targets.map((t) => t.name).join(", ") || "(none)"}`);
    return false;
  }
  const r = await api("POST", `/rest/api/3/issue/${key}/transitions`, { transition: { id: wontDo.id } });
  if (r.status >= 400) {
    console.error(`    ✗ transition "${wontDo.name}" failed: ${r.status}`);
    return false;
  }
  return wontDo.name;
}

// ── plan ───────────────────────────────────────────────────────────────
const COMMENT_OBSOLETE_BASE = `Closing as obsolete after v0.4.x cleanup (commit 7f090e6, PR #12).

The persona/role layer was deliberately removed: every authenticated user now sees every module. Beta will reveal which components users reach for via behaviour rather than role assumptions. As a result, this test case describes a flow that no longer exists in the product.

For context see SCRUM-124 (TC-ONB-001), where Karen confirmed the persona system was technically working in production before removal.`;

const PLAN = [
  // ── tickets that stay open but need their definition realigned ──────
  {
    tc: "TC-ONB-001",
    action: "comment",
    comment: `Test definition updated in code (tests/e2e/onboarding.spec.ts) to match the v0.4.x cleanup landed in commit 7f090e6 / PR #12.

New behaviour: signup → land directly on /dashboard with all five modules (MMC Comply, Build, Quote, Direct, Train) visible in the sidebar. No persona / role selection step.

The persona/role layer was deliberately removed in favour of behavioural beta observation. Karen verified on production: all five modules now render correctly in the sidebar, /onboarding 404s, Settings → Profile is a read-only Name + Email card.

Leaving this ticket as-is (Karen marked Done 28 Apr 2026). Posting this comment so the Jira test description doesn't drift back to the old persona-based wording on future re-tests.`,
  },
  {
    tc: "TC-ACCESS-001",
    action: "comment",
    comment: `Test rewritten to match the v0.4.x cleanup (commit 7f090e6, PR #12).

Old definition: "Builder persona sees correct modules in sidebar".
New definition: "All authenticated users see all five modules" — the persona-based gating was removed, so module visibility is now uniform.

Verified live on mmcbuild-one.vercel.app: all five modules render unconditionally for any authenticated user.

The TC-ACCESS-002, TC-ACCESS-003, and TC-ACCESS-004 sibling tests (consultant-only / admin / trade-coming-soon scenarios) have been retired as obsolete since the gating they exercised no longer exists.`,
  },

  // ── tickets to close as obsolete (comment + transition) ─────────────
  {
    tc: "TC-ONB-002",
    action: "close",
    comment: `${COMMENT_OBSOLETE_BASE}

Specific reason this test is obsolete:
The flow it describes (Settings → "Change role" button → confirmation dialog → onboarding screen → select different persona → sidebar updates) no longer exists. Settings → Profile is now a read-only Name + Email card; there is no role to change.`,
  },
  {
    tc: "TC-ONB-003",
    action: "close",
    comment: `${COMMENT_OBSOLETE_BASE}

Specific reason this test is obsolete:
The /onboarding route was deleted. Authenticated users land on /dashboard directly regardless of profile state — there is no longer a "first login redirect to onboarding" flow.`,
  },
  {
    tc: "TC-ACCESS-002",
    action: "close",
    comment: `${COMMENT_OBSOLETE_BASE}

Specific reason this test is obsolete:
Persona-based module gating was removed. Consultants now see all five modules, not just Comply. Superseded by the new TC-ACCESS-001 ("All authenticated users see all five modules").`,
  },
  {
    tc: "TC-ACCESS-003",
    action: "close",
    comment: `${COMMENT_OBSOLETE_BASE}

Specific reason this test is obsolete:
The "admin sees all modules" assertion is now degenerate — every user sees all modules, so there is nothing distinct to test for the admin role at the module-visibility layer. Superseded by TC-ACCESS-001.`,
  },
  {
    tc: "TC-ACCESS-004",
    action: "close",
    comment: `${COMMENT_OBSOLETE_BASE}

Specific reason this test is obsolete:
The "Trade persona sees Coming Soon state" UI was removed along with the rest of the persona gating. Trade users now see all five modules as fully clickable links.`,
  },
];

// ── execute ────────────────────────────────────────────────────────────
async function main() {
  console.log(`Host: ${HOST}`);
  console.log(`Auth: ${EMAIL || "(missing JIRA_EMAIL)"} / token ${TOKEN ? "present" : "MISSING"}`);
  console.log(`Mode: ${APPLY ? "APPLY (will post + transition)" : "DRY RUN (no changes)"}\n`);

  if (!EMAIL || !TOKEN) {
    console.error("Missing JIRA_EMAIL / JIRA_TOKEN — set in .env.local before running.");
    process.exit(1);
  }

  for (const item of PLAN) {
    console.log(`── ${item.tc} (${item.action}) ──`);
    const t = await findTicketByTcCode(item.tc);
    if (!t) continue;
    console.log(`  ${t.key} [${t.status}] ${t.summary}`);

    if (!APPLY) {
      console.log(`  [dry-run] would post comment (${item.comment.split("\n")[0].slice(0, 80)}…)`);
      if (item.action === "close") console.log(`  [dry-run] would transition to Won't Do / Closed`);
      continue;
    }

    const ok = await postComment(t.key, item.comment);
    console.log(`  ${ok ? "✓" : "✗"} comment posted`);
    if (item.action === "close") {
      const transitioned = await transitionToWontDo(t.key);
      console.log(`  ${transitioned ? `✓ transitioned via "${transitioned}"` : "✗ transition failed"}`);
    }
  }

  console.log(APPLY ? "\nDone. Verify via the board." : "\nDry run complete. Add --apply to commit changes.");
}

main();
