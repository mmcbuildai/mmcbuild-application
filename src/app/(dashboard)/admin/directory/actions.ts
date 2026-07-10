"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");
  if (profile.role !== "owner" && profile.role !== "admin") {
    throw new Error("Not authorised");
  }

  return profile as { id: string; org_id: string; role: string };
}

export async function getDirectoryListings(statusFilter?: string) {
  await requireAdmin();

  let query = db()
    .from("directory_listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data } = await query;
  return (data ?? []) as {
    id: string;
    company_name: string;
    abn: string | null;
    categories: string[];
    contact_name: string;
    contact_email: string;
    contact_phone: string | null;
    location: string | null;
    service_area: string[];
    licences_held: string | null;
    description: string | null;
    status: string;
    admin_notes: string | null;
    created_at: string;
  }[];
}

export async function approveDirectoryListing(listingId: string) {
  // @cross-tenant-ok: global directory-submission moderation queue (no org_id), admin-role gated operator action
  const profile = await requireAdmin();

  const { error } = await db()
    .from("directory_listings")
    .update({
      status: "published",
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
    })
    .eq("id", listingId);

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };

  // Fire event for downstream (HubSpot sync, notification)
  await inngest.send({
    name: "directory/entry.approved",
    data: { listingId },
  });

  revalidatePath("/admin/directory");
  return { success: true };
}

export async function rejectDirectoryListing(listingId: string, notes?: string) {
  // @cross-tenant-ok: global directory-submission moderation queue (no org_id), admin-role gated operator action
  const profile = await requireAdmin();

  const { error } = await db()
    .from("directory_listings")
    .update({
      status: "rejected",
      admin_notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
    })
    .eq("id", listingId);

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };

  revalidatePath("/admin/directory");
  return { success: true };
}

export async function requestInfoDirectoryListing(listingId: string, notes: string) {
  // @cross-tenant-ok: global directory-submission moderation queue (no org_id), admin-role gated operator action
  const profile = await requireAdmin();

  const { error } = await db()
    .from("directory_listings")
    .update({
      status: "info_requested",
      admin_notes: notes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
    })
    .eq("id", listingId);

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };

  revalidatePath("/admin/directory");
  return { success: true };
}
