"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { canManageMembers, canAssignRole } from "@/lib/auth/roles";

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
    .select("id, full_name, email, role, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  return {
    members: (members ?? []) as { id: string; full_name: string; email: string; role: string; created_at: string }[],
    currentProfileId: profile.id,
    currentRole: profile.role,
  };
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

export async function inviteUser(email: string, role: string) {
  const profile = await getProfile();

  if (!canManageMembers(profile.role)) {
    return { error: "Only owners and admins can invite members" };
  }

  if (!email?.trim() || !email.includes("@")) {
    return { error: "Valid email is required" };
  }

  if (!canAssignRole(profile.role, role)) {
    return { error: "You cannot invite someone with a role equal to or above your own" };
  }

  const admin = createAdminClient();

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
  const { error: insertError } = await admin
    .from("org_invitations")
    .insert({
      org_id: profile.org_id,
      email: email.trim().toLowerCase(),
      role,
      invited_by: profile.id,
    } as never);

  if (insertError) {
    return { error: `Failed to create invitation: ${insertError.message}` };
  }

  // Send Supabase auth invite email
  try {
    await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase());
  } catch {
    // User may already have an account — that's OK, they'll join on next login
  }

  revalidatePath("/settings/organisation");
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
    .select("id, email, role, status, expires_at, created_at")
    .eq("org_id", profile.org_id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (data ?? []) as {
    id: string;
    email: string;
    role: string;
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

  const { error } = await admin
    .from("org_invitations")
    .update({ status: "revoked" } as never)
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

  // Re-send auth invite
  try {
    await admin.auth.admin.inviteUserByEmail(inv.email);
  } catch {
    // User may already exist
  }

  revalidatePath("/settings/organisation");
  return { success: true };
}
