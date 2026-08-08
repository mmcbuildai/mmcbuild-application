#!/usr/bin/env node
/**
 * Flag coherence — is the live site entirely in ONE mode, or half-flipped?
 *
 * WHY THIS EXISTS
 * On 8 August the purchase CTAs were switched on by setting one environment
 * variable. Eight surfaces changed. Two did not, because they had never been
 * wired to the flag — including the homepage hero, the single largest button on
 * the site, which went on saying "Join the Waitlist" and pointing at a contact
 * form on a site that had just started selling.
 *
 * Nothing failed. The build was green, the deploy succeeded, the flag was set
 * correctly, and every page returned 200. A feature flag can only switch the
 * things somebody remembered to attach to it, and there is no error for the one
 * they forgot.
 *
 * It is also the fourth instance in a week of the same shape: the control gets
 * changed and the words around it are left saying something that is no longer
 * true (the admin toggle vs the admin pages, the test-3d action vs its page,
 * the cancel button vs the route that reached it).
 *
 * TWO DESIGN DECISIONS WORTH KNOWING
 *
 * 1. It DETECTS the mode rather than being told it. Given a flag with two
 *    modes, it works out which one the live site is mostly in, then asserts
 *    that nothing from the other mode survives. That means the check does not
 *    need editing at flip time — the moment somebody would be least inclined to
 *    stop and update a test — and it catches a half-flip in either direction,
 *    including a rollback that leaves purchase copy behind.
 *
 * 2. It searches the SHORTEST distinguishing token, never the full phrase.
 *    This is the trap that hid the bug from me for an hour on the day: I grepped
 *    the live HTML for "join waitlist", got zero, and reported the homepage
 *    clean. The real string was "Join THE Waitlist". Only a count of the bare
 *    token "waitlist" found it. Config should therefore carry `waitlist`, not
 *    any phrase built around it — a phrase match proves only that one wording
 *    is absent.
 *
 * Raw HTML is searched, not visible text. That over-counts (a term can appear
 * in the RSC payload as well as in the markup) and never under-counts, which is
 * the safe direction for a check whose job is to prove absence.
 *
 * WHY NOT ON PULL REQUESTS
 * This judges the deployed site. A pull request cannot change what is live, and
 * a blip on the public site should not block an unrelated review. It runs on a
 * schedule and on demand, like the pricing-drift guard next to it.
 *
 * Exit 0 = coherent. Exit 1 = a half-flip, or a page that could not be read.
 * An unreachable page is deliberately NOT a pass: a check that quietly does
 * nothing is indistinguishable from one that succeeded.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, "..", "flag-coherence.config.json");
const TIMEOUT_MS = 20_000;

/* ---------------------------------------------------------------- pure core */

/** Case-insensitive count of non-overlapping occurrences of `needle`. */
export function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let from = 0;
  for (;;) {
    const at = h.indexOf(n, from);
    if (at === -1) return count;
    count += 1;
    from = at + n.length;
  }
}

/**
 * Which mode is the site in?
 *
 * Scores each mode by how many of its markers appear across all pages, and
 * returns the highest. Deliberately a total rather than a per-page decision:
 * an individual page may legitimately carry none of a mode's markers, but the
 * site as a whole always leans one way.
 *
 * Returns null when nothing scores — the site matches no declared mode, which
 * usually means the config has gone stale against a redesign. That is reported
 * as a failure rather than a pass, because an assertion that no longer matches
 * the thing it guards is worse than no assertion: it reads as green forever.
 */
export function detectMode(modes, documents) {
  const scores = Object.entries(modes).map(([name, mode]) => {
    const total = (mode.markers ?? []).reduce(
      (sum, marker) =>
        sum + documents.reduce((s, doc) => s + countOccurrences(doc.html, marker), 0),
      0,
    );
    return { name, total };
  });
  scores.sort((a, b) => b.total - a.total);
  const best = scores[0];
  if (!best || best.total === 0) return null;
  // A tie means the site is showing both modes at once, which is itself the
  // defect this check exists to find. Report it rather than picking one.
  if (scores[1] && scores[1].total === best.total) return "__ambiguous__";
  return best.name;
}

/**
 * Every surviving occurrence of a term the active mode forbids.
 *
 * Carries a context snippet, not just a count. On the day, the count told me
 * something was wrong and the snippet told me WHAT — that the surviving string
 * was a hero button pointing at /contact. A number alone would have sent
 * somebody hunting through thirteen pages.
 */
export function findViolations(activeMode, modes, documents) {
  const forbidden = modes[activeMode]?.forbidden ?? [];
  const out = [];
  for (const doc of documents) {
    for (const term of forbidden) {
      const count = countOccurrences(doc.html, term);
      if (count === 0) continue;
      out.push({ path: doc.path, term, count, context: contextFor(doc.html, term) });
    }
  }
  return out;
}

function contextFor(html, term) {
  const at = html.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1) return "";
  return html
    .slice(Math.max(0, at - 70), at + term.length + 70)
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ runtime */

async function fetchPage(baseUrl, path) {
  const url = new URL(path, baseUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    const html = await res.text();
    return { path, url, status: res.status, html };
  } catch (e) {
    return { path, url, status: 0, html: "", error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  let failed = false;

  for (const site of config.sites) {
    console.log(`\n=== ${site.name} — ${site.baseUrl} ===`);

    const documents = [];
    for (const path of site.pages) {
      const doc = await fetchPage(site.baseUrl, path);
      if (doc.status !== 200) {
        console.error(`  UNREACHABLE  ${path}  (status ${doc.status}${doc.error ? `, ${doc.error}` : ""})`);
        failed = true;
        continue;
      }
      documents.push(doc);
    }

    if (documents.length === 0) {
      console.error("  no pages could be read — treating as a failure, not a skip");
      failed = true;
      continue;
    }

    for (const flag of site.flags) {
      const mode = detectMode(flag.modes, documents);

      if (mode === null) {
        console.error(
          `  ${flag.name}: NO MODE MATCHED. None of the declared markers appear on the ` +
            `live site, so this check is no longer guarding anything. Update the config.`,
        );
        failed = true;
        continue;
      }

      if (mode === "__ambiguous__") {
        console.error(`  ${flag.name}: AMBIGUOUS — markers for more than one mode are equally present.`);
        failed = true;
        continue;
      }

      const violations = findViolations(mode, flag.modes, documents);
      if (violations.length === 0) {
        console.log(`  ${flag.name}: coherent — site is in "${mode}" mode, no leftovers.`);
        continue;
      }

      failed = true;
      console.error(
        `  ${flag.name}: HALF-FLIPPED. The site is in "${mode}" mode, but copy from ` +
          `another mode is still live on ${violations.length} surface(s):`,
      );
      for (const v of violations) {
        console.error(`    ${v.path}  "${v.term}" x${v.count}`);
        console.error(`        …${v.context}…`);
      }
    }
  }

  if (failed) {
    console.error(
      "\nFAIL — the live site is not coherently in one mode, or a page could not be read.",
    );
    // `process.exitCode`, not `process.exit()`. Calling exit() here terminated
    // the process while fetch's handles were still closing, which on Windows
    // aborts with a libuv assertion and exits 127 — "crashed" — instead of 1,
    // "found a problem". A guard whose failure code is ambiguous costs somebody
    // an afternoon working out whether the site is broken or the check is.
    // Setting the code and returning lets the event loop drain normally.
    process.exitCode = 1;
    return;
  }
  console.log("\nOK — every flag is coherent across every page checked.");
}

// Only run when invoked directly, so the pure functions above can be imported
// by tests without firing network requests.
if (process.argv[1] && process.argv[1].endsWith("check-flag-coherence.mjs")) {
  main().catch((e) => {
    console.error("check-flag-coherence crashed:", e);
    process.exit(1);
  });
}
