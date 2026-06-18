#!/usr/bin/env node
/**
 * Backfill "stranded" accounts: auth users who have NO profile row because their
 * email-confirmation link was consumed by a mail security scanner (Yahoo!/
 * Outlook Safe Links) before the human clicked — GoTrue marked the email
 * confirmed but the provisioning callback never ran, so they have a confirmed
 * (or invited-but-unconfirmed) account with no org/profile and cannot use the app.
 *
 * For each stranded user we run the SAME idempotent provisioning the app now does
 * at the callback + dashboard layout:
 *   - a PENDING INVITE for their email  -> join the inviting org (+ confirm email)
 *   - else if their email is CONFIRMED  -> create a personal org as owner
 *   - else (self-signup, unconfirmed)   -> SKIP (must confirm first; reported)
 *
 * Usage (from repo root):
 *   node scripts/backfill-stranded-profiles.mjs            # dry-run, reports only
 *   node scripts/backfill-stranded-profiles.mjs --apply    # write changes
 *   node scripts/backfill-stranded-profiles.mjs --apply --temp-password me@x.com
 *       # also set a known temp password for that ONE email so they can sign in
 *       # with the Password tab immediately (printed once; share securely).
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env / .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// --- env (.env.local fallback) ------------------------------------------------
function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — rely on real env */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (env or .env.local)."
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const tpIdx = process.argv.indexOf("--temp-password");
const tempPasswordEmail =
  tpIdx > -1 ? (process.argv[tpIdx + 1] ?? "").toLowerCase() : null;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureMembership(userId, orgId, role, seatType, setActive) {
  await admin
    .from("organisation_members")
    .upsert(
      { user_id: userId, org_id: orgId, role, seat_type: seatType },
      { onConflict: "user_id,org_id" }
    );
  if (setActive) {
    await admin
      .from("user_active_org")
      .upsert({ user_id: userId, org_id: orgId }, { onConflict: "user_id" });
  }
}

async function provision(user) {
  const email = user.email.toLowerCase();
  const fullName =
    user.user_metadata?.full_name || email.split("@")[0] || "User";

  const { data: invite } = await admin
    .from("org_invitations")
    .select("id, org_id, role, seat_type, project_ids")
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const confirmed = !!user.email_confirmed_at;

  if (!invite && !confirmed) {
    return { outcome: "skipped_unconfirmed_selfsignup" };
  }

  // Invited but never confirmed (scanner burned the link) — confirm so they can
  // sign in. Their org membership comes from the invite below.
  if (invite && !confirmed) {
    await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
  }

  if (invite) {
    const seatType = invite.seat_type ?? "internal";
    await ensureMembership(user.id, invite.org_id, invite.role, seatType, true);
    const { data: prof } = await admin
      .from("profiles")
      .insert({
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role,
        seat_type: seatType,
        full_name: fullName,
        email,
      })
      .select("id")
      .single();
    if (
      prof &&
      (seatType === "external" || seatType === "viewer") &&
      invite.project_ids?.length
    ) {
      await admin.from("project_user_access").insert(
        invite.project_ids.map((projectId) => ({
          project_id: projectId,
          profile_id: prof.id,
          org_id: invite.org_id,
          role: seatType,
        }))
      );
    }
    await admin
      .from("org_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    return { outcome: "invited", orgId: invite.org_id };
  }

  // Confirmed self-signup with no invite — fresh personal org.
  const { data: org } = await admin
    .from("organisations")
    .insert({ name: user.user_metadata?.org_name || "My Organisation" })
    .select("id")
    .single();
  if (!org) return { outcome: "failed_org_create" };
  await admin.from("profiles").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
    full_name: fullName,
    email,
  });
  await ensureMembership(user.id, org.id, "owner", "internal", true);
  return { outcome: "self_signup", orgId: org.id };
}

async function main() {
  // All profiles -> set of provisioned user ids.
  const { data: profiles } = await admin.from("profiles").select("user_id");
  const hasProfile = new Set((profiles ?? []).map((p) => p.user_id));

  // All auth users (paginate).
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const stranded = users.filter((u) => u.email && !hasProfile.has(u.id));
  console.log(
    `${users.length} auth users, ${stranded.length} stranded (no profile).`
  );
  console.log(APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY-RUN (no writes)\n");

  for (const u of stranded) {
    if (!APPLY) {
      const { data: invite } = await admin
        .from("org_invitations")
        .select("org_id")
        .eq("email", u.email.toLowerCase())
        .eq("status", "pending")
        .maybeSingle();
      const plan = invite
        ? "would JOIN invited org"
        : u.email_confirmed_at
          ? "would CREATE personal org"
          : "SKIP (unconfirmed self-signup)";
      console.log(`  ${u.email}  ->  ${plan}`);
      continue;
    }
    const res = await provision(u);
    console.log(`  ${u.email}  ->  ${res.outcome}${res.orgId ? ` (${res.orgId})` : ""}`);

    if (tempPasswordEmail && u.email.toLowerCase() === tempPasswordEmail) {
      const pw = `Mmc-${randomBytes(6).toString("base64url")}!`;
      await admin.auth.admin.updateUserById(u.id, {
        password: pw,
        email_confirm: true,
      });
      console.log(`\n  *** TEMP PASSWORD for ${u.email}: ${pw}`);
      console.log(`      Share securely; have them sign in via the Password tab.\n`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
