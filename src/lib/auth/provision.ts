import type { createAdminClient } from "@/lib/supabase/admin";
import { ensureMembership } from "./membership";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ProvisionUserInput {
  id: string;
  email: string;
  fullName?: string | null;
  /** user_metadata.org_name, used only when creating a fresh personal org. */
  orgNameFallback?: string | null;
}

export interface ProvisionResult {
  profileId: string | null;
  /** "existing" = already provisioned; otherwise how the profile was created. */
  outcome: "existing" | "invited" | "self_signup" | "joined_additional_org" | "failed";
}

/**
 * THE single, idempotent user-provisioning path: ensure a user has an org +
 * profile + membership, joining a pending-invitation org when one exists or
 * creating a fresh personal org otherwise.
 *
 * Extracted from the auth callback so the SAME logic runs from three places:
 *   1. the auth callback (every successful confirm / magic-link / invite click),
 *   2. the dashboard layout as a safety net (any authenticated user who somehow
 *      reaches the app without a profile gets repaired on the spot), and
 *   3. the backfill script for already-stranded accounts.
 *
 * Why the safety net matters: email security scanners (Yahoo!, Outlook Safe
 * Links) pre-fetch the one-time {{ .ConfirmationURL }} link, which makes GoTrue
 * mark the email confirmed but burns the token before the human clicks — so the
 * human lands authenticated (or can later sign in) with NO profile. Calling this
 * whenever a profile is missing closes that gap.
 *
 * Idempotent and safe to call on every login.
 */
export async function provisionUser(
  admin: AdminClient,
  user: ProvisionUserInput,
): Promise<ProvisionResult> {
  const userId = user.id;
  const email = user.email.toLowerCase();
  const fullName = user.fullName || email.split("@")[0] || "User";

  // Identity row (one per user). Its absence => not yet provisioned.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  // A pending invitation is processed for BOTH new AND existing users, so an
  // existing user can join a SECOND org (multi-org) instead of colliding on the
  // single profile row.
  const { data: invite } = await admin
    .from("org_invitations")
    .select("id, org_id, role, seat_type, project_ids")
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (invite) {
    const inv = invite as {
      id: string;
      org_id: string;
      role: string;
      seat_type?: string | null;
      project_ids?: string[] | null;
    };
    const seatType = inv.seat_type ?? "internal";

    // Source-of-truth membership in the invited org. New user => make it active;
    // existing user => leave their current active org (OD1, no auto-switch).
    await ensureMembership(admin, userId, inv.org_id, inv.role, seatType, {
      setActive: !existingProfile,
    });

    let profileId: string | null = existingProfile
      ? (existingProfile as { id: string }).id
      : null;
    if (!existingProfile) {
      const { data: createdProfile } = await admin
        .from("profiles")
        .insert({
          org_id: inv.org_id,
          user_id: userId,
          // role + seat_type enums include 'beta' on live; generated types lag.
          role: inv.role as never,
          seat_type: seatType as never,
          full_name: fullName,
          email,
        })
        .select("id")
        .single();
      profileId = createdProfile ? (createdProfile as { id: string }).id : null;
    }

    // External / viewer invites: grant project-scoped access rows.
    if (
      profileId &&
      (seatType === "external" || seatType === "viewer") &&
      inv.project_ids &&
      inv.project_ids.length > 0
    ) {
      const accessRows = inv.project_ids.map((projectId) => ({
        project_id: projectId,
        profile_id: profileId,
        org_id: inv.org_id,
        role: seatType,
      }));
      await admin.from("project_user_access").insert(accessRows as never);
    }

    await admin
      .from("org_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      } as never)
      .eq("id", inv.id);

    return {
      profileId,
      outcome: existingProfile ? "joined_additional_org" : "invited",
    };
  }

  if (existingProfile) {
    // Already provisioned and no pending invite — nothing to do.
    return { profileId: (existingProfile as { id: string }).id, outcome: "existing" };
  }

  // No invite + no profile => fresh org + owner profile + membership.
  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({ name: user.orgNameFallback || "My Organisation" })
    .select("id")
    .single();

  if (orgError || !org) return { profileId: null, outcome: "failed" };

  const orgId = (org as { id: string }).id;
  const { data: createdProfile } = await admin
    .from("profiles")
    .insert({
      org_id: orgId,
      user_id: userId,
      role: "owner",
      full_name: fullName,
      email,
    })
    .select("id")
    .single();
  await ensureMembership(admin, userId, orgId, "owner", "internal", {
    setActive: true,
  });

  return {
    profileId: createdProfile ? (createdProfile as { id: string }).id : null,
    outcome: "self_signup",
  };
}
