#!/usr/bin/env node
/**
 * Does mmcbuild.com.au advertise prices this app can actually charge?
 *
 * There are two pricing pages in two repositories, and they have already
 * drifted once: on 7 August the marketing FAQ offered annual billing on
 * "Professional and Enterprise" — Enterprise has no annual price at all, and
 * Essential, which does, was left out. A customer read one thing; the product
 * did another.
 *
 * `tests/unit/billing/pricing-drift.test.ts` covers the half that can be checked
 * without a network: it pins the app's annual prices to the formula the
 * marketing site uses. It cannot see the marketing repo, so it catches a change
 * made HERE. This script catches a change made THERE.
 *
 *   node scripts/check-pricing-drift.mjs
 *   node scripts/check-pricing-drift.mjs --url https://staging.example.com/pricing
 *
 * Exit 0 = the live page agrees with this app. Exit 1 = it does not.
 *
 * ⚠️ WHAT THIS CANNOT SEE, stated rather than implied. The annual figures on
 * that page are rendered by JavaScript after the visitor clicks "Annual", so a
 * plain fetch never receives them — only a real browser does. This script
 * therefore checks the MONTHLY prices and the FAQ copy, which are in the
 * server-rendered HTML. Verifying the annual figures needs the browser pass:
 *
 *   browse goto https://mmcbuild.com.au/pricing && browse click "Annual"
 *
 * A check that quietly covered less than it claimed would be worse than no
 * check, so the gap is printed in the output every run.
 */

import { PLANS, SELLABLE_PLAN_IDS } from "../src/lib/stripe/plans.ts";

const DEFAULT_URL = "https://mmcbuild.com.au/pricing";
const RETRIES = 3;

const urlArg = process.argv.indexOf("--url");
const URL_TO_CHECK = urlArg > -1 ? process.argv[urlArg + 1] : DEFAULT_URL;

/** Fetch with retries — a transient blip must not read as a pricing fault. */
async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError;
}

function fail(lines) {
  console.error("\n❌ PRICING DRIFT\n");
  for (const l of lines) console.error(`   ${l}`);
  console.error(
    "\n   The website and the product disagree about price. Fix whichever is\n" +
      "   wrong — do not adjust this check to make it pass.\n",
  );
  process.exit(1);
}

const html = await fetchWithRetry(URL_TO_CHECK).catch((err) => {
  // A network failure is NOT a pass. Say so and exit non-zero, because a check
  // that silently does nothing is indistinguishable from one that succeeded.
  console.error(`\n❌ Could not reach ${URL_TO_CHECK} after ${RETRIES} attempts: ${err.message}\n`);
  process.exit(1);
});

const problems = [];

// 1. Every monthly price this app sells must appear on the page.
for (const planId of SELLABLE_PLAN_IDS) {
  const price = PLANS[planId].price;
  if (!html.includes(`$${price}`)) {
    problems.push(
      `${planId}: this app charges $${price}/month, and that figure does not appear on the page.`,
    );
  }
}

// 2. The page must not offer annual billing on Enterprise — there is no annual
//    price to sell, which is exactly the fault found on 7 August.
if (/annual[^.]{0,80}Enterprise/i.test(html)) {
  problems.push(
    `The page appears to offer annual billing on Enterprise. Enterprise is custom-priced ` +
      `and has no annual price, so that discount cannot be applied.`,
  );
}

// 3. Prices must be stated GST-exclusive. An unqualified figure reads to a
//    business buyer as the amount that will leave their account.
if (!/GST/i.test(html)) {
  problems.push(
    `No mention of GST anywhere on the page. Prices are quoted GST-exclusive, so ` +
      `$${PLANS.essential.price} collects $${(PLANS.essential.price * 1.1).toFixed(2)}.`,
  );
}

if (problems.length) fail(problems);

console.log(`\n✅ ${URL_TO_CHECK} agrees with this app's pricing.`);
for (const planId of SELLABLE_PLAN_IDS) {
  const p = PLANS[planId];
  console.log(`   ${p.name}: $${p.price}/month · $${p.annualPrice}/year (+ GST)`);
}
console.log(
  `\n   NOT checked here: the annual figures are rendered only after a visitor\n` +
    `   clicks "Annual", so a plain fetch cannot see them. Use the browser pass\n` +
    `   for those. The app-side relationship is covered by\n` +
    `   tests/unit/billing/pricing-drift.test.ts.\n`,
);
