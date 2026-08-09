#!/usr/bin/env node
/**
 * Walk the create-project flow against a live deployment, as a real signed-in
 * user, and assert the two things Karen reported on SCRUM-378:
 *
 *   1. after creating, the new project is VISIBLE on /projects
 *   2. re-using the name shows the duplicate message, not a generic digest
 *
 * WHY THIS EXISTS AS A SCRIPT RATHER THAN A NOTE
 * SCRUM-378 was reported twice. Between the two reports the repo had a green
 * test suite, a clean typecheck and successful deploys the whole time — none of
 * which could see the defect, because it lived in the relationship between a
 * server action and the page the user came from. The only thing that can see it
 * is walking the path. So the walk is a script, not a paragraph in a doc that
 * says someone should walk the path.
 *
 * Mode A (types the real login form) per docs/TESTING.md — this also exercises
 * the auth path rather than skipping it.
 *
 *   node scripts/qa-walk-create-project.mjs
 *   node scripts/qa-walk-create-project.mjs --base-url https://<preview>.vercel.app
 *
 * Credentials come from env (never committed):
 *   QA_WALK_EMAIL / QA_WALK_PASSWORD, or QA_TEST_USER_EMAIL / QA_TEST_USER_PASSWORD.
 *
 * Exit code 0 = every assertion passed. Non-zero = a real finding, or the run
 * could not be completed — the two are reported differently, because "I could
 * not check" must never read as "I checked and it was fine".
 */
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const BASE = arg("--base-url", "https://app.mmcbuild.com.au").replace(/\/$/, "");
const EMAIL = process.env.QA_WALK_EMAIL || process.env.QA_TEST_USER_EMAIL;
const PASSWORD = process.env.QA_WALK_PASSWORD || process.env.QA_TEST_USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  // Fail rather than skip. A check that quietly does nothing is
  // indistinguishable from one that passed.
  console.error(
    "Missing credentials. Set QA_WALK_EMAIL/QA_WALK_PASSWORD (or\n" +
      "QA_TEST_USER_EMAIL/QA_TEST_USER_PASSWORD). See docs/TESTING.md.",
  );
  process.exit(2);
}

const NAME = `QA create-project ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
const results = [];
const record = (step, ok, detail = "") => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ channel: process.env.QA_WALK_CHANNEL || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));

let incomplete = null;
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // Type, never DOM-inject: React's controlled inputs ignore injected values,
  // which is the usual reason an automated login here "fails" (docs/TESTING.md).
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

  // Assert WHICH page produced everything below. A headless browser that has
  // reset reports about:blank data that reads exactly like a real measurement.
  const host = await page.evaluate(() => location.hostname);
  record("signed in", host === new URL(BASE).hostname, `on ${host}${new URL(page.url()).pathname}`);

  // The Terms gate is a full-viewport overlay that intercepts every click until
  // accepted — not a bug, but it silently eats the first interaction of any run
  // whose account has not accepted the current terms.
  const acceptTerms = async () => {
    const btn = page.getByRole("button", { name: /^i accept$/i });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(3000);
      return true;
    }
    return false;
  };
  if (await acceptTerms()) record("accepted the Terms of Use gate", true);

  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  await acceptTerms();

  await page.getByRole("button", { name: /new project/i }).first().click();
  await page.fill("#name", NAME);
  await page.getByRole("button", { name: /^create project$/i }).click();

  await page
    .waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 120000 })
    .catch(() => {});
  const landed = /\/projects\/[0-9a-f-]{36}$/.test(new URL(page.url()).pathname);
  record(
    "create lands on the new project, not back on the list",
    landed,
    new URL(page.url()).pathname,
  );
  const projectId = new URL(page.url()).pathname.split("/").pop();
  record(
    "the new project's name is on that page",
    await page.getByText(NAME, { exact: false }).first().isVisible().catch(() => false),
  );

  // THE reported symptom. Navigating back is what Karen did, and it is the
  // path that used to serve a list rendered before the project existed.
  await page.getByRole("link", { name: /back to projects/i }).first().click();
  await page.waitForURL(/\/projects\/?$/, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  record(
    "visible on /projects after navigating back (the reported symptom)",
    await page.getByText(NAME, { exact: false }).first().isVisible().catch(() => false),
  );

  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  record(
    "visible on a cold load of /projects",
    await page.getByText(NAME, { exact: false }).first().isVisible().catch(() => false),
  );

  // The half that was fixed on 5 August — pinned so it cannot regress quietly.
  await page.getByRole("button", { name: /new project/i }).first().click();
  await page.fill("#name", NAME);
  await page.getByRole("button", { name: /^create project$/i }).click();
  await page.waitForTimeout(8000);
  const dup = await page.getByText(/already exists/i).first().innerText().catch(() => "");
  record("re-using the name shows the real duplicate message", /already exists/i.test(dup));
  record(
    "no generic 'specific message is omitted' digest",
    (await page.getByText(/specific message is omitted/i).count()) === 0,
  );

  console.log(`\ncreated project id: ${projectId}`);
  console.log(`console errors: ${consoleErrors.length ? consoleErrors.slice(0, 5).join(" | ") : "none"}`);
} catch (e) {
  incomplete = e instanceof Error ? e.message.slice(0, 300) : String(e);
} finally {
  await browser.close();
}

if (incomplete) {
  console.error(`\nRUN INCOMPLETE — could not finish the walk: ${incomplete}`);
  console.error("This is NOT a pass. Nothing below the failure point was checked.");
  process.exit(2);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
process.exit(failed.length ? 1 : 0);
