"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/supabase/db";

// Modules that have a per-run AI table we can count real usage from.
// (Direct = directory listings, Train = lesson progress — not AI runs, so
// their activity shows only via the beta self-report status below.)
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

export interface BetaTesterRow {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  signedUpAt: string | null;
  lastSignInAt: string | null;
  /** Real AI run counts per module (comply/build/quote only). */
  runCounts: { comply: number; build: number; quote: number };
  totalRuns: number;
  /** Beta self-report progress per module. */
  modules: Record<ModuleId, BetaModuleCell>;
  /** Any beta module they reached in_progress or completed. */
  hasBetaActivity: boolean;
}

export interface BetaActivityResult {
  orgName: string;
  rows: BetaTesterRow[];
}

function emptyCell(): BetaModuleCell {
  return { status: "not_started", rating: null, feedback: null, completedAt: null };
}

/**
 * Per-tester beta activity for the admin's OWN organisation: who they are,
 * when they last signed in, what they self-reported testing (status + rating +
 * written feedback) and how many real AI runs they actually fired per module.
 * Owner/admin only; org-scoped (never crosses org boundaries).
 */
export async function getBetaActivity(): Promise<BetaActivityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  const { data: me } = await admin
    .from("profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    throw new Error("Not authorised");
  }
  const orgId = me.org_id;

  // Org name (for the header).
  const { data: org } = await admin
    .from("organisations")
    .select("name")
    .eq("id", orgId)
    .single();

  // Two id conventions exist in this schema and they are NOT interchangeable:
  //   - beta_feedback.user_id  = the AUTH user id (profiles.user_id)
  //   - run tables.created_by  = the PROFILE PK   (profiles.id)
  // We key everything on the auth user id, translating run created_by → user_id
  // via the profile map below. Confirmed against the live DB 2026-06-17.
  const { data: allProfiles } = await admin
    .from("profiles")
    .select("id, user_id, full_name, email, role, created_at, org_id");

  type ProfileRow = {
    id: string;
    user_id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    created_at: string | null;
    org_id: string | null;
  };
  const profileRows = (allProfiles ?? []) as ProfileRow[];
  const identityByUserId = new Map(profileRows.map((p) => [p.user_id, p]));
  const userIdByProfileId = new Map(profileRows.map((p) => [p.id, p.user_id]));

  // Build the candidate tester set as the UNION of anyone who acted in THIS
  // org: profile-members, plus anyone who left beta feedback or fired a run
  // while this org was active. The multi-org model stamps activity with the
  // active org, which is not always the actor's home org — listing by
  // profiles.org_id alone would orphan real activity, so we union the actors.
  const candidateIds = new Set<string>();

  // Home members of this org (so people who joined but did nothing still show).
  for (const p of profileRows) {
    if (p.org_id === orgId) candidateIds.add(p.user_id);
  }

  // Beta self-report rows for this org (keyed by auth user id directly).
  const { data: betaRows } = await db()
    .from("beta_feedback")
    .select("user_id, module_id, status, rating, feedback, completed_at")
    .eq("org_id", orgId);

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
    candidateIds.add(r.user_id);
    let modules = betaByUser.get(r.user_id);
    if (!modules) {
      modules = Object.fromEntries(
        ALL_MODULES.map((m) => [m, emptyCell()])
      ) as Record<ModuleId, BetaModuleCell>;
      betaByUser.set(r.user_id, modules);
    }
    modules[r.module_id] = {
      status: r.status ?? "not_started",
      rating: r.rating,
      feedback: r.feedback,
      completedAt: r.completed_at,
    };
  }

  // Real AI run counts per module. created_by is a PROFILE id, so translate it
  // to the auth user id before attributing — otherwise counts hit phantom keys.
  const runCountsByUser = new Map<
    string,
    { comply: number; build: number; quote: number }
  >();
  for (const [moduleId, table] of Object.entries(RUN_TABLES) as Array<
    ["comply" | "build" | "quote", string]
  >) {
    const { data: runs } = await db()
      .from(table)
      .select("created_by")
      .eq("org_id", orgId);
    for (const run of (runs ?? []) as Array<{ created_by: string | null }>) {
      const profileId = run.created_by;
      if (!profileId) continue;
      const uid = userIdByProfileId.get(profileId);
      if (!uid) continue; // orphaned/deleted actor — skip rather than show a ghost
      candidateIds.add(uid);
      const counts =
        runCountsByUser.get(uid) ?? { comply: 0, build: 0, quote: 0 };
      counts[moduleId] += 1;
      runCountsByUser.set(uid, counts);
    }
  }

  if (candidateIds.size === 0) {
    return { orgName: org?.name ?? "Your organisation", rows: [] };
  }

  const idList = [...candidateIds];
  const identityById = identityByUserId;

  // Last sign-in timestamps from auth.users (one listUsers call, mapped by id).
  const lastSignInById = new Map<string, string | null>();
  try {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    for (const u of authList?.users ?? []) {
      lastSignInById.set(u.id, u.last_sign_in_at ?? null);
    }
  } catch {
    // Non-fatal: if the auth lookup fails we simply show no sign-in data
    // rather than failing the whole page.
  }

  const rows: BetaTesterRow[] = idList
    .map((userId) => {
      const ident = identityById.get(userId);
      const modules =
        betaByUser.get(userId) ??
        (Object.fromEntries(
          ALL_MODULES.map((m) => [m, emptyCell()])
        ) as Record<ModuleId, BetaModuleCell>);
      const runCounts =
        runCountsByUser.get(userId) ?? { comply: 0, build: 0, quote: 0 };
      const totalRuns = runCounts.comply + runCounts.build + runCounts.quote;
      const hasBetaActivity = ALL_MODULES.some(
        (m) => modules[m].status !== "not_started"
      );
      return {
        userId,
        fullName: ident?.full_name ?? null,
        email: ident?.email ?? null,
        role: ident?.role ?? null,
        signedUpAt: ident?.created_at ?? null,
        lastSignInAt: lastSignInById.get(userId) ?? null,
        runCounts,
        totalRuns,
        modules,
        hasBetaActivity,
      };
    })
    // Most active first: anyone with beta activity or real runs, by last sign-in.
    .sort((a, b) => {
      const aActive = a.hasBetaActivity || a.totalRuns > 0 ? 1 : 0;
      const bActive = b.hasBetaActivity || b.totalRuns > 0 ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const at = a.lastSignInAt ? Date.parse(a.lastSignInAt) : 0;
      const bt = b.lastSignInAt ? Date.parse(b.lastSignInAt) : 0;
      return bt - at;
    });

  return { orgName: org?.name ?? "Your organisation", rows };
}
