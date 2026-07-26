#!/usr/bin/env node
/**
 * qa-session.mjs — mint a REAL Supabase session for the persistent QA account and
 * emit the auth cookie(s) a /browse agent can set to land authenticated WITHOUT
 * driving the (flaky) login form.
 *
 * THIS IS NOT AN AUTH BYPASS. It performs a normal password grant for a real,
 * confirmed test account and reproduces the exact cookie @supabase/ssr would have
 * written after a successful form login. No production code is involved; nothing
 * here weakens the app's auth. The account is a normal `owner` user subject to RLS.
 *
 * Two modes for testers (see docs/TESTING.md):
 *   Mode A — test the auth PATH: type these creds into the real /login form.
 *   Mode B — get PAST auth fast (this script): inject the session cookie, skip the form.
 *
 * Usage (creds come from env, never hard-coded here). Pick the IDENTITY with
 * --as, because MMC Build has three test identities that see different things
 * and a bug found as one is invisible to the others (SCRUM-319):
 *   node scripts/qa-session.mjs --as admin   # QA_TEST_ADMIN_EMAIL / _PASSWORD (owner + operator surfaces)
 *   node scripts/qa-session.mjs --as user    # QA_TEST_USER_EMAIL  / _PASSWORD (plain org member)
 *   node scripts/qa-session.mjs --as beta    # QA_TEST_BETA_EMAIL  / _PASSWORD (role `beta` — the tester's view)
 *
 * Defaults to --as admin. The legacy QA_TEST_EMAIL / QA_TEST_PASSWORD pair is
 * still honoured as the admin identity so existing invocations keep working.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function envFromFile(file) {
  try {
    const txt = readFileSync(join(root, file), "utf8");
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = envFromFile(".env.local");
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Three identities, because role decides what a tester can even reach. Testing
// only as the owner is how the beta-role upload failure reached two client demos
// (migrations 00066 → 00071 → 00072); `--as beta` exists so that stops happening.
const IDENTITIES = {
  admin: {
    email: process.env.QA_TEST_ADMIN_EMAIL || process.env.QA_TEST_EMAIL || "mcmdennis+qa@gmail.com",
    password: process.env.QA_TEST_ADMIN_PASSWORD || process.env.QA_TEST_PASSWORD,
    passwordVar: "QA_TEST_ADMIN_PASSWORD",
  },
  user: {
    email: process.env.QA_TEST_USER_EMAIL,
    password: process.env.QA_TEST_USER_PASSWORD,
    passwordVar: "QA_TEST_USER_PASSWORD",
  },
  beta: {
    email: process.env.QA_TEST_BETA_EMAIL || "beta.demo@mmcbuild.com.au",
    password: process.env.QA_TEST_BETA_PASSWORD,
    passwordVar: "QA_TEST_BETA_PASSWORD",
  },
};

const asIndex = process.argv.indexOf("--as");
const identityName = asIndex === -1 ? "admin" : process.argv[asIndex + 1];
const identity = IDENTITIES[identityName];

if (!identity) {
  console.error(`Unknown identity "${identityName}". Use --as admin | user | beta (see docs/TESTING.md).`);
  process.exit(2);
}

const { email, password } = identity;

if (!SUPA || !ANON) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (env or .env.local).");
  process.exit(2);
}
if (!email) {
  console.error(`Set QA_TEST_${identityName.toUpperCase()}_EMAIL for the "${identityName}" identity (see docs/TESTING.md).`);
  process.exit(2);
}
if (!password) {
  console.error(`Set ${identity.passwordVar} (from the password manager) for the "${identityName}" identity. Never commit it.`);
  process.exit(2);
}
console.error(`[qa-session] minting a session as "${identityName}" (${email})`);

// Project ref = the subdomain of the Supabase URL; the SSR cookie is named after it.
const ref = new URL(SUPA).hostname.split(".")[0];
const cookieName = `sb-${ref}-auth-token`;

// @supabase/ssr chunks cookie values larger than this.
const MAX_CHUNK = 3180;

function toBase64Url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

(async () => {
  // Normal password grant — exactly what the login form does under the hood.
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await r.json();
  if (r.status !== 200 || !session.access_token) {
    console.error(`LOGIN FAILED (HTTP ${r.status}): ${JSON.stringify(session).slice(0, 200)}`);
    process.exit(1);
  }

  // The cookie value @supabase/ssr writes: `base64-` + base64url(JSON.stringify(session)),
  // chunked into .0/.1/... when it exceeds MAX_CHUNK.
  const encoded = "base64-" + toBase64Url(JSON.stringify(session));
  const chunks = [];
  for (let i = 0; i < encoded.length; i += MAX_CHUNK) chunks.push(encoded.slice(i, i + MAX_CHUNK));

  console.log(`✅ LOGIN OK — real session for ${session.user?.email} (confirmed: ${session.user?.confirmed_at ? "yes" : "no"})`);
  console.log(`   expires_at: ${new Date(session.expires_at * 1000).toISOString()}`);
  console.log("");
  console.log("Set these cookie(s) on the app origin (https://mmcbuild-one.vercel.app), path=/, then navigate to /dashboard:");
  if (chunks.length === 1) {
    console.log(`   ${cookieName} = ${chunks[0]}`);
  } else {
    chunks.forEach((c, i) => console.log(`   ${cookieName}.${i} = ${c}`));
    console.log(`   (${chunks.length} chunks — set ALL of them, the server recombines .0/.1/...)`);
  }
  console.log("");
  console.log("Raw tokens (if a tool prefers setSession(access_token, refresh_token)):");
  console.log(`   access_token=${session.access_token}`);
  console.log(`   refresh_token=${session.refresh_token}`);
  console.log("");
  console.log("NOTE (best-effort): the cookie encoding follows the current @supabase/ssr default");
  console.log("(base64url, `base64-` prefix). If the server doesn't accept it after a version bump,");
  console.log("fall back to Mode A — type the creds into the real /login form (which also TESTS auth).");
})();
