import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Multi-org membership helper (see docs/plans/MULTI_ORG_MEMBERSHIP_PLAN.md).
 *
 * `organisation_members` is the source of truth for who belongs to which org and
 * with what role; `user_active_org` records which org is "current". `profiles`
 * mirrors the active membership via a DB trigger (migration 00059), so the rest
 * of the app keeps reading `profile.org_id` / `profile.role` unchanged.
 *
 * Idempotent: safe to call on every login / signup / invite-accept.
 */
export async function ensureMembership(
  admin: AdminClient,
  userId: string,
  orgId: string,
  role: string,
  seatType: string,
  opts: { setActive?: boolean } = {},
): Promise<void> {
  // Source of truth — one row per (user, org).
  await admin
    .from("organisation_members" as never)
    .upsert(
      {
        user_id: userId,
        org_id: orgId,
        role,
        seat_type: seatType,
      } as never,
      { onConflict: "user_id,org_id" } as never,
    );

  // Set the active org only when asked (new user / first org). For an existing
  // user joining a second org we do NOT auto-switch them (OD1) — they pick it
  // from the org switcher.
  if (opts.setActive) {
    await admin
      .from("user_active_org" as never)
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
        } as never,
        { onConflict: "user_id" } as never,
      );
  }
}
