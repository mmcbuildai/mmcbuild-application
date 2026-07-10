import { db } from "@/lib/supabase/db";

/**
 * Cross-tenant isolation guard for service-role (RLS-bypassing) reads/writes
 * scoped by a caller-supplied id.
 *
 * The `db()` / `createAdminClient()` helpers bypass Row-Level Security by design
 * (they exist for the few genuine cross-org reads — the sample-layout cache, the
 * public directory browse). That means for every action that queries a table by
 * a caller-supplied `projectId`, the ONLY tenant boundary is a hand-written
 * ownership check. Forgetting it is the SCRUM-340 / SCRUM-342 class of bug.
 *
 * Use this to make that check one call instead of an inlined copy per site:
 *
 *   if (!(await projectBelongsToOrg(projectId, profile.org_id))) {
 *     return { error: "Project not found" };
 *   }
 *
 * Returns true iff the project exists AND belongs to `orgId`.
 */
export async function projectBelongsToOrg(
  projectId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await db()
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle();
  return !!data && (data as { org_id: string }).org_id === orgId;
}
