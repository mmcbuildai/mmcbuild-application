#!/usr/bin/env node
/**
 * Cross-tenant guard check (SCRUM-343) — prevents the SCRUM-340 / SCRUM-342 class
 * from being reintroduced.
 *
 * THE CLASS: an exported server action / route handler queries a table by a
 * caller-supplied id (id / *_id) via the RLS-bypassing `db()` / `createAdminClient()`
 * helpers, WITHOUT asserting the row belongs to the caller's org. Because those
 * helpers bypass Row-Level Security by design, that assert is the only tenant
 * boundary — forgetting it leaks / mutates another tenant's data.
 *
 * THE GATE (heuristic, deliberately conservative): for every exported function in
 * the scanned files, FAIL if the body BOTH
 *   (a) uses an RLS-bypassing client (`createAdminClient()` or `db()`), AND
 *   (b) filters a query by an id (`.eq("id"|"*_id", …)` / `.in("id"|"*_id", …)`),
 * UNLESS it carries an ownership signal:
 *   - references `org_id` (an `.eq("org_id", …)` scope or a `row.org_id === …` compare), OR
 *   - calls a known ownership gate (`authorizeFindingResolution`, `projectBelongsToOrg`,
 *     `assertProjectOwnership`), OR
 *   - is explicitly acknowledged with a `// @cross-tenant-ok: <reason>` marker
 *     (for genuine cross-org / public / user-owned reads).
 *
 * The marker forces every RLS-bypass-by-id to be a conscious, documented decision
 * rather than a silent gap. This is NOT a substitute for RLS (see SCRUM-344) — it
 * is the cheap, fail-closed backstop that keeps the class from creeping back.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

// Files whose exported functions run RLS-bypassing, id-scoped queries.
const SCAN = [
  { dir: join(ROOT, "src", "app", "(dashboard)"), match: (f) => f.endsWith("actions.ts") },
  { dir: join(ROOT, "src", "app", "api"), match: (f) => f.endsWith("route.ts") },
];

function walk(dir, match, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, match, out);
    else if (match(name)) out.push(full);
  }
  return out;
}

// Split a file into { name, body } for each exported function.
function functions(src) {
  const lines = src.split("\n");
  const starts = [];
  const re = /^export\s+async\s+function\s+([A-Za-z0-9_]+)/;
  lines.forEach((line, i) => {
    const m = re.exec(line);
    if (m) starts.push({ name: m[1], line: i });
  });
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].line;
    const to = i + 1 < starts.length ? starts[i + 1].line : lines.length;
    out.push({ name: starts[i].name, body: lines.slice(from, to).join("\n") });
  }
  return out;
}

const USES_BYPASS = /createAdminClient\(|(?<![\w.])db\(\)/;
const QUERIES_BY_ID = /\.(eq|in)\(\s*["'`](id|[A-Za-z]+_id)["'`]/;
const OWNERSHIP_SIGNAL =
  // `org_id` (an .eq scope or a row.org_id compare), a known ownership gate, a
  // local guard helper by naming convention (…InScope() / …InCallerOrg() /
  // …BelongsToOrg()), or an explicit acknowledgement marker.
  /org_id|authorizeFindingResolution\(|assertProjectOwnership\(|InScope\(|InCallerOrg\(|BelongsToOrg\(|@cross-tenant-ok/;

const files = SCAN.flatMap((s) => walk(s.dir, s.match, []));
const violations = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const fn of functions(src)) {
    if (
      USES_BYPASS.test(fn.body) &&
      QUERIES_BY_ID.test(fn.body) &&
      !OWNERSHIP_SIGNAL.test(fn.body)
    ) {
      violations.push({ file: file.replace(ROOT + "\\", "").replace(ROOT + "/", ""), name: fn.name });
    }
  }
}

if (violations.length > 0) {
  console.error(
    "\n✖ Cross-tenant guard check FAILED (SCRUM-343) — these exported functions\n" +
      "  run RLS-bypassing, id-scoped queries with no org-ownership assert:\n",
  );
  for (const v of violations) {
    console.error(`  - ${v.file} → ${v.name}()`);
  }
  console.error(
    "\n  Fix each by asserting the row belongs to the caller's org (compare\n" +
      "  row.org_id to profile.org_id, add .eq(\"org_id\", profile.org_id), or call\n" +
      "  projectBelongsToOrg/authorizeFindingResolution). If the read is GENUINELY\n" +
      "  cross-org / public / user-owned, annotate the function body with:\n" +
      "      // @cross-tenant-ok: <reason>\n",
  );
  process.exit(1);
}

console.log(`✓ Cross-tenant guard check passed (${files.length} files scanned).`);
