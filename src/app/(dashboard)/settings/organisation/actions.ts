"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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

  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Only owners and admins can change roles" };
  }

  if (memberId === profile.id) {
    return { error: "You cannot change your own role" };
  }

  const validRoles = ["owner", "admin", "architect", "builder", "trade", "viewer"];
  if (!validRoles.includes(role)) {
    return { error: "Invalid role" };
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
