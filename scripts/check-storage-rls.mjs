#!/usr/bin/env node
/**
 * check-storage-rls.mjs — prove that a BETA-role tester can still do the uploads
 * the product asks of them, and cannot reach another organisation's files.
 *
 * WHY THIS EXISTS (SCRUM-319)
 * On 26 Jun a plan upload failed in a client demo with "new row violates row-level
 * security policy": a storage policy had been tightened to owner/admin/architect/
 * builder, which silently excluded the `beta` role every demo account uses. It
 * survived two demos because every QA pass ran as an OWNER, and an owner cannot
 * see this class of bug at all. Migrations 00066 -> 00071 -> 00072 are three
 * attempts at the same failure. Role is not a detail of the test — it decides
 * whether the code path is reachable.
 *
 * WHAT IT ASSERTS, per bucket the BROWSER writes under a user session (server-side
 * writes use the admin client and bypass RLS entirely, so they are out of scope):
 *   POSITIVE — beta can write its OWN organisation's prefix. Catches a role gate
 *              that locks testers out (the original bug).
 *   NEGATIVE — beta cannot write ANOTHER organisation's prefix. Catches the
 *              opposite failure, a policy so loose it leaks across tenants.
 * Both matter. A check that only proves the upload works would pass just as
 * happily against a bucket with no org scope at all.
 *
 * THIS IS NOT AN AUTH BYPASS. It mints a REAL session for a real, confirmed QA
 * account via the admin generate_link + verify flow, then makes ordinary requests
 * that RLS evaluates normally. Nothing here weakens the app; no production code is
 * involved. The service-role key is used to mint the session and to clean up, not
 * to perform the uploads under test — those run as the beta user.
 *
 * Usage:  node scripts/check-storage-rls.mjs        (pnpm test:storage-rls)
 * Env:    SUPABASE_SERVICE_ROLE_KEY (or MMC_SERVICE_ROLE_KEY, or ~/.mmc-serv-rol)
 *         MMC_SUPABASE_REF     project ref, defaults to prod
 *         QA_TEST_BETA_EMAIL   defaults to beta.demo@mmcbuild.com.au
 *         QA_TEST_ADMIN_EMAIL  defaults to mcmdennis+qa@gmail.com (supplies the
 *                              FOREIGN org id for the negative case)
 *
 * Exit: 0 all passed · 1 a check failed or was skipped · 2 not configured.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REF = process.env.MMC_SUPABASE_REF || "lztzyfeivpsbqbsfzctw";
const BASE = `https://${REF}.supabase.co`;
const BETA_EMAIL = process.env.QA_TEST_BETA_EMAIL || "beta.demo@mmcbuild.com.au";
const OTHER_EMAIL = process.env.QA_TEST_ADMIN_EMAIL || "mcmdennis+qa@gmail.com";

/** Same resolution order as scripts/migration-baseline.mjs — one convention, not two. */
function serviceRoleKey() {
  const raw = process.env.MMC_SERVICE_ROLE_KEY;
  if (raw && !raw.includes("/") && !raw.includes("\\") && raw.length > 60) return raw.trim();
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv && fromEnv.trim().length > 60) return fromEnv.trim();
  const candidate = raw || join(homedir(), ".mmc-serv-rol");
  if (existsSync(candidate)) return readFileSync(candidate, "utf8").trim();
  return null;
}

const KEY = serviceRoleKey();
if (!KEY) {
  // Fail rather than skip, for the same reason the schema-drift gate does: a check
  // that quietly does nothing is indistinguishable from one that passed.
  console.error(
    "No service-role key. Set SUPABASE_SERVICE_ROLE_KEY (or MMC_SERVICE_ROLE_KEY),\n" +
      "or place it at ~/.mmc-serv-rol. Refusing to exit 0 unconfigured.",
  );
  process.exit(2);
}

const svc = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: svc });
  if (!r.ok) throw new Error(`REST ${path} -> ${r.status}`);
  return r.json();
}

/**
 * Mint a real session WITHOUT a password: admin generate_link produces a hashed
 * token, /verify exchanges it for one. Chosen over the password grant so the check
 * needs no credential that isn't already a CI secret, and no email round-trip.
 */
async function sessionFor(email) {
  const linkRes = await fetch(`${BASE}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const link = await linkRes.json();
  const hashed = link.hashed_token || link.properties?.hashed_token;
  if (!hashed) throw new Error(`could not mint a session for ${email}: ${JSON.stringify(link).slice(0, 200)}`);

  const vRes = await fetch(`${BASE}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: hashed }),
  });
  const v = await vRes.json();
  if (!v.access_token) throw new Error(`verify failed for ${email}: ${JSON.stringify(v).slice(0, 200)}`);
  return v.access_token;
}

/** Mirrors get_user_org_id(): the ACTIVE org decides, not the home org. */
async function orgFor(email) {
  const profiles = await rest(`profiles?select=id,user_id,org_id&email=eq.${encodeURIComponent(email)}`);
  if (!profiles.length) throw new Error(`no profile for ${email} — is the QA account provisioned?`);
  const { id: profileId, user_id: userId, org_id: homeOrg } = profiles[0];
  const active = await rest(`user_active_org?select=org_id&user_id=eq.${userId}`);
  return { profileId, userId, orgId: active[0]?.org_id || homeOrg };
}

// Every bucket enforces a MIME allow-list, and it is checked BEFORE RLS — so the
// wrong content type returns 415 without the policy ever being consulted, which
// reads as "denied" and would score a cross-tenant check as a pass. The payload
// has to be plausible per bucket for the assertion to mean anything.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const MP4 = Buffer.from("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom", "binary");
const PAYLOAD = {
  "plan-uploads": { body: PDF, type: "application/pdf", ext: "pdf" },
  "engineering-certs": { body: PDF, type: "application/pdf", ext: "pdf" },
  "training-videos": { body: MP4, type: "video/mp4", ext: "mp4" },
};
const STAMP = `rls-check-${Date.now()}`;

async function upload(token, bucket, path, body, contentType) {
  const r = await fetch(`${BASE}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body,
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text.slice(0, 200) };
}

const written = [];
const fixtureCourses = [];
async function cleanup() {
  for (const p of written) {
    await fetch(`${BASE}/storage/v1/object/${p}`, { method: "DELETE", headers: svc }).catch(() => {});
  }
  for (const id of fixtureCourses) {
    await fetch(`${BASE}/rest/v1/courses?id=eq.${id}`, { method: "DELETE", headers: svc }).catch(() => {});
  }
}

/**
 * training-videos is foldered by COURSE id, so the positive case needs a course the
 * beta org owns. Rather than skip when none exists — leaving the newest policy
 * permanently unasserted — create a disposable one and remove it in cleanup().
 */
async function createFixtureCourse(beta) {
  const r = await fetch(`${BASE}/rest/v1/courses`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      title: `${STAMP} storage RLS fixture (safe to delete)`,
      slug: STAMP,
      category: "fundamentals",
      difficulty: "beginner",
      status: "draft",
      created_by_profile_id: beta.profileId,
      created_by_org_id: beta.orgId,
    }),
  });
  if (!r.ok) return null;
  const [row] = await r.json();
  if (row?.id) fixtureCourses.push(row.id);
  return row?.id || null;
}

const results = [];
function record(name, outcome, detail) {
  results.push({ name, outcome, detail });
}

async function expectAllowed(token, bucket, path, label) {
  const p = PAYLOAD[bucket];
  const r = await upload(token, bucket, path, p.body, p.type);
  if (r.ok) {
    written.push(`${bucket}/${path}`);
    record(label, "pass", "upload accepted");
  } else {
    record(label, "FAIL", `expected the upload to succeed, got ${r.status} ${r.body}`);
  }
}

async function expectDenied(token, bucket, path, label) {
  const p = PAYLOAD[bucket];
  const r = await upload(token, bucket, path, p.body, p.type);
  if (r.ok) {
    written.push(`${bucket}/${path}`);
    record(label, "FAIL", "CROSS-TENANT WRITE ACCEPTED — the policy is not org-scoped");
  } else if (/row-level security/i.test(r.body)) {
    record(label, "pass", "denied by RLS");
  } else {
    // Denied, but not by the policy — e.g. a MIME or size rule. That is not the
    // property under test, and reporting it as a pass would be a false negative.
    record(label, "SKIP", `denied by something other than RLS: ${r.status} ${r.body}`);
  }
}

async function main() {
  const beta = await orgFor(BETA_EMAIL);
  const other = await orgFor(OTHER_EMAIL);
  if (beta.orgId === other.orgId) {
    console.error(
      `Both QA identities resolve to the same org (${beta.orgId}); the cross-tenant\n` +
        "checks would be vacuous. Point QA_TEST_ADMIN_EMAIL at an account in a different org.",
    );
    process.exit(2);
  }

  const token = await sessionFor(BETA_EMAIL);
  console.log(`beta identity ${BETA_EMAIL}  org ${beta.orgId}`);
  console.log(`foreign org    ${other.orgId} (from ${OTHER_EMAIL})\n`);

  // The two buckets the browser writes with a plain org prefix.
  for (const bucket of ["plan-uploads", "engineering-certs"]) {
    await expectAllowed(token, bucket, `${beta.orgId}/${STAMP}.pdf`, `${bucket}: beta writes own org`);
    await expectDenied(token, bucket, `${other.orgId}/${STAMP}.pdf`, `${bucket}: beta blocked from other org`);
  }

  // training-videos is foldered by COURSE id, not org, so its policy gates on
  // ownership of the parent course (see 20260727103000).
  const foreignCourse = await rest(
    `courses?select=id&created_by_org_id=neq.${beta.orgId}&limit=1`,
  ).catch(() => []);
  if (foreignCourse.length) {
    await expectDenied(
      token,
      "training-videos",
      `${foreignCourse[0].id}/${STAMP}.mp4`,
      "training-videos: beta blocked from another org's course",
    );
  } else {
    record("training-videos: beta blocked from another org's course", "SKIP", "no course exists outside the beta org");
  }

  const courseId = (await rest(`courses?select=id&created_by_org_id=eq.${beta.orgId}&limit=1`).catch(() => []))[0]?.id
    || (await createFixtureCourse(beta));
  if (courseId) {
    await expectAllowed(
      token,
      "training-videos",
      `${courseId}/${STAMP}.mp4`,
      "training-videos: beta writes a course its org owns",
    );
  } else {
    record("training-videos: beta writes a course its org owns", "SKIP", "could not resolve or create a course");
  }

  await cleanup();

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const mark = r.outcome === "pass" ? "pass" : r.outcome;
    console.log(`${mark.padEnd(5)} ${r.name.padEnd(width)}  ${r.detail}`);
  }
  const bad = results.filter((r) => r.outcome !== "pass");
  console.log(`\n${results.length} checks, ${results.length - bad.length} passed, ${bad.length} not passed.`);
  // SKIP counts against the run: an assertion that could not be made is not
  // evidence that the property holds.
  process.exit(bad.length ? 1 : 0);
}

main().catch(async (err) => {
  await cleanup();
  console.error(`storage RLS check failed to run: ${err.message}`);
  process.exit(1);
});
