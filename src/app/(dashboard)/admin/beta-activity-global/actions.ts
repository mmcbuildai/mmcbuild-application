"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/supabase/db";
import { isOperatorEmail } from "@/lib/auth/operator";

// Modules with a per-run AI table we can count real usage from. (Direct and
// Train have no AI-run table — their activity shows only via beta self-report.)
const RUN_TABLES = {
  comply: "compliance_checks",
  build: "design_checks",
  quote: "cost_estimates",
} as const;

const ALL_MODULES = ["comply", "build", "quote", "direct", "train"] as const;
type ModuleId = (typeof ALL_MODULES)[number];

export type BetaModuleStatus = "not_started" | "in_progress" | "completed";

export interface BetaModuleCell {
  status: BetaModuleStatus;
  rating: number | null;
  feedback: string | null;
  completedAt: string | null;
}

/** Where this account came from, for the "invited vs self-signup" column. */
export type SignupSource = "operator" | "invited" | "self_signup" | "unknown";

export interface GlobalBetaTesterRow {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  /** Home org name (from the user's profile), for context. */
  orgName: string | null;
  source: SignupSource;
  signedUpAt: string | null;
  /** Null until the user confirms their email — the funnel's first real step. */
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  runCounts: { comply: number; build: number; quote: number };
  totalRuns: number;
  modules: Record<ModuleId, BetaModuleCell>;
  hasBetaActivity: boolean;
}

export interface GlobalBetaFunnel {
  signedUp: number;
  confirmedEmail: number;
  signedIn: number;
  ranSomething: number;
  leftFeedback: number;
}

export interface GlobalBetaActivityResult {
  rows: GlobalBetaTesterRow[];
  funnel: GlobalBetaFunnel;
}

function emptyModules(): Record<ModuleId, BetaModuleCell> {
  return Object.fromEntries(
    ALL_MODULES.map((m) => [
      m,
      { status: "not_started", rating: null, feedback: null, completedAt: null },
    ])
  ) as Record<ModuleId, BetaModuleCell>;
}

/**
 * Platform-wide beta activity across EVERY organisation. Sourced from the full
 * auth user list so it includes people who signed up but never confirmed their
 * email or never logged in — the part the org-scoped view (getBetaActivity)
 * cannot see, because each self-signup lands in its own personal org.
 *
 * OPERATOR-ONLY: gated on the email allowlist (@/lib/auth/operator), never on
 * org role — a self-signed-up tester is the OWNER of their own org, so role
 * would leak every tester's activity to every supplier.
 */
export async function getGlobalBetaActivity(): Promise<GlobalBetaActivityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!isOperatorEmail(user.email)) throw new Error("Not authorised");

  const admin = createAdminClient();

  // --- Identity maps (all orgs) -------------------------------------------
  // Two id conventions exist and are NOT interchangeable:
  //   - beta_feedback.user_id = AUTH user id (profiles.user_id)
  //   - run tables.created_by = PROFILE PK   (profiles.id)
  const { data: allProfiles } = await admin
    .from("profiles")
    .select("id, user_id, full_name, email, role, org_id");

  type ProfileRow = {
    id: string;
    user_id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    org_id: string | null;
  };
  const profileRows = (allProfiles ?? []) as ProfileRow[];
  const profileByUserId = new Map(profileRows.map((p) => [p.user_id, p]));
  const userIdByProfileId = new Map(profileRows.map((p) => [p.id, p.user_id]));

  const { data: allOrgs } = await admin
    .from("organisations")
    .select("id, name");
  const orgNameById = new Map(
    ((allOrgs ?? []) as Array<{ id: string; name: string | null }>).map((o) => [
      o.id,
      o.name,
    ])
  );

  // Anyone with an ACCEPTED invitation came in through a distributor/org invite
  // (vs self-signup into a personal org). Keyed by lower-cased email.
  const { data: acceptedInvites } = await db()
    .from("org_invitations")
    .select("email")
    .eq("status", "accepted");
  const invitedEmails = new Set(
    ((acceptedInvites ?? []) as Array<{ email: string | null }>)
      .map((r) => r.email?.toLowerCase())
      .filter(Boolean) as string[]
  );

  // --- Beta self-report rows (all orgs), grouped by auth user id ----------
  const { data: betaRows } = await db()
    .from("beta_feedback")
    .select("user_id, module_id, status, rating, feedback, completed_at");

  const betaByUser = new Map<string, Record<ModuleId, BetaModuleCell>>();
  for (const r of (betaRows ?? []) as Array<{
    user_id: string;
    module_id: ModuleId;
    status: BetaModuleStatus;
    rating: number | null;
    feedback: string | null;
    completed_at: string | null;
  }>) {
    if (!ALL_MODULES.includes(r.module_id)) continue;
    let modules = betaByUser.get(r.user_id);
    if (!modules) {
      modules = emptyModules();
      betaByUser.set(r.user_id, modules);
    }
    modules[r.module_id] = {
      status: r.status ?? "not_started",
      rating: r.rating,
      feedback: r.feedback,
      completedAt: r.completed_at,
    };
  }

  // --- Real AI run counts (all orgs). created_by = profile id -> user id ---
  const runCountsByUser = new Map<
    string,
    { comply: number; build: number; quote: number }
  >();
  for (const [moduleId, table] of Object.entries(RUN_TABLES) as Array<
    ["comply" | "build" | "quote", string]
  >) {
    const { data: runs } = await db().from(table).select("created_by");
    for (const run of (runs ?? []) as Array<{ created_by: string | null }>) {
      const profileId = run.created_by;
      if (!profileId) continue;
      const uid = userIdByProfileId.get(profileId);
      if (!uid) continue;
      const counts =
        runCountsByUser.get(uid) ?? { comply: 0, build: 0, quote: 0 };
      counts[moduleId] += 1;
      runCountsByUser.set(uid, counts);
    }
  }

  // --- Full auth user list (the authoritative signup set) -----------------
  type AuthUser = {
    id: string;
    email?: string | null;
    created_at?: string | null;
    last_sign_in_at?: string | null;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  };
  const authUsers: AuthUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data: authList } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    const batch = (authList?.users ?? []) as AuthUser[];
    authUsers.push(...batch);
    if (batch.length < 1000) break; // last page reached
  }

  const rows: GlobalBetaTesterRow[] = authUsers.map((u) => {
    const profile = profileByUserId.get(u.id);
    const email = (u.email ?? profile?.email ?? null)?.toLowerCase() ?? null;
    const modules = betaByUser.get(u.id) ?? emptyModules();
    const runCounts = runCountsByUser.get(u.id) ?? {
      comply: 0,
      build: 0,
      quote: 0,
    };
    const totalRuns = runCounts.comply + runCounts.build + runCounts.quote;
    const hasBetaActivity = ALL_MODULES.some(
      (m) => modules[m].status !== "not_started"
    );

    let source: SignupSource = "unknown";
    if (isOperatorEmail(email)) source = "operator";
    else if (email && invitedEmails.has(email)) source = "invited";
    else if (profile) source = "self_signup";

    return {
      userId: u.id,
      fullName: profile?.full_name ?? null,
      email,
      role: profile?.role ?? null,
      orgName: profile?.org_id ? orgNameById.get(profile.org_id) ?? null : null,
      source,
      signedUpAt: u.created_at ?? null,
      emailConfirmedAt: u.email_confirmed_at ?? u.confirmed_at ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      runCounts,
      totalRuns,
      modules,
      hasBetaActivity,
    };
  });

  // Most engaged first: anyone who ran/tested, then by last sign-in desc.
  rows.sort((a, b) => {
    const aActive = a.hasBetaActivity || a.totalRuns > 0 ? 1 : 0;
    const bActive = b.hasBetaActivity || b.totalRuns > 0 ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const at = a.lastSignInAt ? Date.parse(a.lastSignInAt) : 0;
    const bt = b.lastSignInAt ? Date.parse(b.lastSignInAt) : 0;
    return bt - at;
  });

  const funnel: GlobalBetaFunnel = {
    signedUp: rows.length,
    confirmedEmail: rows.filter((r) => r.emailConfirmedAt).length,
    signedIn: rows.filter((r) => r.lastSignInAt).length,
    ranSomething: rows.filter((r) => r.totalRuns > 0).length,
    leftFeedback: rows.filter((r) => r.hasBetaActivity).length,
  };

  return { rows, funnel };
}
