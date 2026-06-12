"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { canManageMembers, canAssignRole } from "@/lib/auth/roles";
import {
  getOrgSeatUsage,
  type SeatType,
} from "@/lib/auth/seats";
import { getSubscriptionStatus } from "@/lib/stripe/subscription";

async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id, role, full_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");
  return profile as { id: string; org_id: string; role: string; full_name: string; email: string };
}

// ============================================================
// Organisation Details
// ============================================================

export async function getOrganisation() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organisations")
    .select("id, name, abn, created_at, updated_at")
    .eq("id", profile.org_id)
    .single();

  return org as { id: string; name: string; abn: string | null; created_at: string; updated_at: string } | null;
}

export async function updateOrganisation(data: {
  name?: string;
  abn?: string;
}) {
  const profile = await getProfile();

  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Only owners and admins can update organisation details" };
  }

  if (data.name !== undefined && !data.name.trim()) {
    return { error: "Organisation name cannot be empty" };
  }

  const admin = createAdminClient();
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.abn !== undefined) updateData.abn = data.abn.trim() || null;

  const { error } = await admin
    .from("organisations")
    .update(updateData as never)
    .eq("id", profile.org_id);

  if (error) return { error: `Failed to update organisation: ${error.message}` };

  revalidatePath("/settings/organisation");
  return { success: true };
}

// ============================================================
// Members
// ============================================================

export async function getMembers() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("profiles")
    .select("id, full_name, email, role, seat_type, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  const subscription = await getSubscriptionStatus(profile.org_id);
  const seatUsage = await getOrgSeatUsage(profile.org_id, subscription.tier);

  return {
    members: (members ?? []) as {
      id: string;
      full_name: string;
      email: string;
      role: string;
      seat_type: "internal" | "external" | "viewer";
      created_at: string;
    }[],
    currentProfileId: profile.id,
    currentRole: profile.role,
    seatUsage,
  };
}

export async function listOrgProjectsForInvite() {
  const profile = await getProfile();
  if (!canManageMembers(profile.role)) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id, name, status")
    .eq("org_id", profile.org_id)
    .order("name", { ascending: true });

  return (data ?? []) as { id: string; name: string; status: string }[];
}

export async function updateMemberRole(memberId: string, role: string) {
  const profile = await getProfile();

  if (!canManageMembers(profile.role)) {
    return { error: "Only owners and admins can change roles" };
  }

  if (memberId === profile.id) {
    return { error: "You cannot change your own role" };
  }

  const validRoles = ["owner", "admin", "project_manager", "architect", "builder", "trade", "viewer"];
  if (!validRoles.includes(role)) {
    return { error: "Invalid role" };
  }

  if (!canAssignRole(profile.role, role)) {
    return { error: "You cannot assign a role equal to or above your own" };
  }

  const admin = createAdminClient();

  // Verify member belongs to same org
  const { data: member } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", memberId)
    .single();

  if (!member || member.org_id !== profile.org_id) {
    return { error: "Member not found" };
  }

  const { error } = await admin
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() } as never)
    .eq("id", memberId);

  if (error) return { error: `Failed to update role: ${error.message}` };

  revalidatePath("/settings/organisation");
  return { success: true };
}

export async function removeMember(memberId: string) {
  const profile = await getProfile();

  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Only owners and admins can remove members" };
  }

  if (memberId === profile.id) {
    return { error: "You cannot remove yourself" };
  }

  const admin = createAdminClient();

  // Verify member belongs to same org
  const { data: member } = await admin
    .from("profiles")
    .select("org_id, role")
    .eq("id", memberId)
    .single();

  if (!member || member.org_id !== profile.org_id) {
    return { error: "Member not found" };
  }

  if (member.role === "owner" && profile.role !== "owner") {
    return { error: "Only owners can remove other owners" };
  }

  const { error } = await admin
    .from("profiles")
    .delete()
    .eq("id", memberId);

  if (error) return { error: `Failed to remove member: ${error.message}` };

  revalidatePath("/settings/organisation");
  return { success: true };
}

// ============================================================
// Invitations
// ============================================================

export async function inviteUser(
  email: string,
  role: string,
  options: { seatType?: SeatType; projectIds?: string[] } = {},
) {
  const profile = await getProfile();
  const seatType: SeatType = options.seatType ?? "internal";
  const projectIds = options.projectIds ?? [];

  if (!canManageMembers(profile.role)) {
    return { error: "Only owners and admins can invite members" };
  }

  if (!email?.trim() || !email.includes("@")) {
    return { error: "Valid email is required" };
  }

  if (!canAssignRole(profile.role, role)) {
    return { error: "You cannot invite someone with a role equal to or above your own" };
  }

  // External and viewer invites must be scoped to at least one project.
  // Internal and beta invites must NOT carry a project list — they get full org access.
  if ((seatType === "internal" || seatType === "beta") && projectIds.length > 0) {
    return { error: "Internal team members already have access to all projects" };
  }
  if (seatType === "external" && projectIds.length === 0) {
    return { error: "External invites must specify at least one project" };
  }
  if (seatType === "viewer" && projectIds.length === 0) {
    return { error: "Viewer invites must specify at least one project" };
  }

  // Enforce seat cap for internal invites only (beta doesn't count against cap).
  if (seatType === "internal") {
    const subscription = await getSubscriptionStatus(profile.org_id);
    const usage = await getOrgSeatUsage(profile.org_id, subscription.tier);
    if (!usage.canAddInternal) {
      return {
        error: `Seat limit reached (${usage.used + usage.pendingInvites} / ${usage.limit}). Upgrade your plan or invite external/viewer collaborators instead.`,
      };
    }
  }

  const admin = createAdminClient();

  // Verify the requested project_ids belong to this org
  if (projectIds.length > 0) {
    const { data: projectRows } = await admin
      .from("projects")
      .select("id")
      .eq("org_id", profile.org_id)
      .in("id", projectIds);
    const validIds = new Set((projectRows ?? []).map((p) => p.id));
    const invalid = projectIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return { error: "One or more projects do not belong to your organisation" };
    }
  }

  // Check no existing member with this email in the org
  const { data: existingMember } = await admin
    .from("profiles")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("email", email.trim().toLowerCase())
    .single();

  if (existingMember) {
    return { error: "This email is already a member of your organisation" };
  }

  // Check no pending invite for this email
  const { data: existingInvite } = await admin
    .from("org_invitations")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("email", email.trim().toLowerCase())
    .eq("status", "pending")
    .single();

  if (existingInvite) {
    return { error: "A pending invitation already exists for this email" };
  }

  // Create invitation record
  const { data: createdInvite, error: insertError } = await admin
    .from("org_invitations")
    .insert({
      org_id: profile.org_id,
      email: email.trim().toLowerCase(),
      role,
      seat_type: seatType,
      project_ids: projectIds,
      invited_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (insertError || !createdInvite) {
    return { error: `Failed to create invitation: ${insertError?.message ?? "unknown error"}` };
  }
  const createdInviteId = (createdInvite as { id: string }).id;

  // Send the Supabase auth invitation email (magic link). inviteUserByEmail only
  // succeeds for a BRAND-NEW user; an existing account returns `email_exists`.
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    email.trim().toLowerCase(),
  );
  if (inviteErr) {
    const alreadyExists =
      (inviteErr as { code?: string }).code === "email_exists" || inviteErr.status === 422;
    if (alreadyExists) {
      // The invitee already has an account. inviteUserByEmail won't email them,
      // but they CAN join this org now (multi-org): keep the pending invite and
      // send a magic link — on login the auth callback adds the membership.
      const supa = await createClient();
      await supa.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback`,
        },
      });
      revalidatePath("/settings/organisation");
      // Existing account: a SIGN-IN link was sent, not an invite. Flag it so the
      // UI tells the admin what to expect (they were waiting for the wrong email).
      return { success: true, existingAccount: true };
    }
    // Other failure — roll back the dangling invite row and surface it.
    await admin.from("org_invitations").delete().eq("id", createdInviteId);
    revalidatePath("/settings/organisation");
    return { error: `Could not send the invitation email: ${inviteErr.message}` };
  }

  revalidatePath("/settings/organisation");
  return { success: true, existingAccount: false };
}

// ============================================================
// Active-org switching (multi-org)
// ============================================================

export type OrgMembership = {
  orgId: string;
  name: string;
  role: string;
  seatType: string;
  active: boolean;
};

/** All orgs the current user belongs to, with which one is active. */
export async function getUserMemberships(): Promise<OrgMembership[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("organisation_members" as never)
    .select("org_id, role, seat_type, organisations(name)")
    .eq("user_id", user.id);

  const { data: active } = await admin
    .from("user_active_org" as never)
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const activeOrgId = (active as { org_id: string } | null)?.org_id ?? null;

  return ((rows as unknown as Array<{
    org_id: string;
    role: string;
    seat_type: string;
    organisations: { name: string } | null;
  }>) ?? []).map((m) => ({
    orgId: m.org_id,
    name: m.organisations?.name ?? "Organisation",
    role: m.role,
    seatType: m.seat_type,
    active: m.org_id === activeOrgId,
  }));
}

/** Switch the current user's active org. Validates membership; the DB trigger
 *  mirrors profiles.org_id/role to match (migration 00059). */
export async function switchActiveOrg(orgId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("organisation_members" as never)
    .select("id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (!membership) {
    return { error: "You are not a member of that organisation" };
  }

  const { error } = await admin
    .from("user_active_org" as never)
    .upsert(
      { user_id: user.id, org_id: orgId, updated_at: new Date().toISOString() } as never,
      { onConflict: "user_id" } as never,
    );

  if (error) return { error: `Failed to switch organisation: ${error.message}` };

  // Re-render every authenticated surface against the new active org.
  revalidatePath("/", "layout");
  return { success: true };
}

export async function listInvitations() {
  const profile = await getProfile();

  if (!canManageMembers(profile.role)) {
    return [];
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("org_invitations")
    .select("id, email, role, seat_type, project_ids, status, expires_at, created_at")
    .eq("org_id", profile.org_id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (data ?? []) as {
    id: string;
    email: string;
    role: string;
    seat_type: "internal" | "external" | "viewer";
    project_ids: string[] | null;
    status: string;
    expires_at: string;
    created_at: string;
  }[];
}

export async function revokeInvitation(invitationId: string) {
  const profile = await getProfile();

  if (!canManageMembers(profile.role)) {
    return { error: "Only owners and admins can revoke invitations" };
  }

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("org_invitations")
    .select("org_id")
    .eq("id", invitationId)
    .single();

  if (!invite || (invite as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Invitation not found" };
  }

  // Hard-delete the invitation so it visibly clears from the pending list (a
  // soft status flip left a lingering row that looked unresolved).
  const { error } = await admin
    .from("org_invitations")
    .delete()
    .eq("id", invitationId);

  if (error) return { error: `Failed to revoke invitation: ${error.message}` };

  revalidatePath("/settings/organisation");
  return { success: true };
}

export async function resendInvitation(invitationId: string) {
  const profile = await getProfile();

  if (!canManageMembers(profile.role)) {
    return { error: "Only owners and admins can resend invitations" };
  }

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("org_invitations")
    .select("org_id, email, status")
    .eq("id", invitationId)
    .single();

  if (!invite) {
    return { error: "Invitation not found" };
  }

  const inv = invite as { org_id: string; email: string; status: string };
  if (inv.org_id !== profile.org_id) {
    return { error: "Invitation not found" };
  }

  if (inv.status !== "pending") {
    return { error: "Can only resend pending invitations" };
  }

  // Regenerate token and extend expiry
  const { error: updateError } = await admin
    .from("org_invitations")
    .update({
      token: crypto.randomUUID(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    } as never)
    .eq("id", invitationId);

  if (updateError) return { error: `Failed to resend: ${updateError.message}` };

  // Re-send the auth email. inviteUserByEmail only emails brand-new accounts; an
  // existing account returns `email_exists`. With multi-org membership available,
  // an existing user CAN still join — send them a sign-in (magic) link instead,
  // mirroring inviteUser, rather than erroring.
  const { error: resendErr } = await admin.auth.admin.inviteUserByEmail(inv.email);
  if (resendErr) {
    const alreadyExists =
      (resendErr as { code?: string }).code === "email_exists" || resendErr.status === 422;
    if (alreadyExists) {
      const supa = await createClient();
      await supa.auth.signInWithOtp({
        email: inv.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback`,
        },
      });
      revalidatePath("/settings/organisation");
      return { success: true, existingAccount: true };
    }
    return { error: `Could not resend the invitation email: ${resendErr.message}` };
  }

  revalidatePath("/settings/organisation");
  return { success: true, existingAccount: false };
}
