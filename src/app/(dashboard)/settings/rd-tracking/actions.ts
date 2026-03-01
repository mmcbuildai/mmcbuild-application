"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { RdTag, ExperimentStatus, ReviewStatus } from "@/lib/supabase/types";
import { randomBytes } from "crypto";

async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");
  return profile as { id: string; org_id: string; role: string };
}

export async function logTimeEntry(formData: FormData) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { error } = await admin.from("rd_time_entries").insert({
    profile_id: profile.id,
    org_id: profile.org_id,
    date: formData.get("date") as string,
    hours: parseFloat(formData.get("hours") as string),
    stage: formData.get("stage") as string,
    deliverable: formData.get("deliverable") as string,
    rd_tag: (formData.get("rd_tag") as RdTag) || "not_eligible",
    description: (formData.get("description") as string) || null,
  } as never);

  if (error) throw new Error(`Failed to log time: ${error.message}`);
  revalidatePath("/settings/rd-tracking");
}

export async function listTimeEntries(filters?: {
  startDate?: string;
  endDate?: string;
  stage?: string;
  rdTag?: RdTag;
}) {
  const profile = await getProfile();
  const admin = createAdminClient();

  let query = admin
    .from("rd_time_entries")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("date", { ascending: false });

  if (filters?.startDate) {
    query = query.gte("date", filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte("date", filters.endDate);
  }
  if (filters?.stage) {
    query = query.eq("stage", filters.stage);
  }
  if (filters?.rdTag) {
    query = query.eq("rd_tag", filters.rdTag);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list entries: ${error.message}`);
  return data ?? [];
}

export async function deleteTimeEntry(entryId: string) {
  await getProfile();
  const admin = createAdminClient();

  const { error } = await admin
    .from("rd_time_entries")
    .delete()
    .eq("id", entryId);

  if (error) throw new Error(`Failed to delete entry: ${error.message}`);
  revalidatePath("/settings/rd-tracking");
}

export async function getTimeSummary() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("rd_time_entries")
    .select("hours, stage, rd_tag")
    .eq("org_id", profile.org_id);

  if (error) throw new Error(`Failed to get summary: ${error.message}`);

  const entries = data ?? [];
  const byStage: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  let totalHours = 0;

  for (const entry of entries) {
    const hours = Number(entry.hours);
    totalHours += hours;
    byStage[entry.stage] = (byStage[entry.stage] ?? 0) + hours;
    byTag[entry.rd_tag] = (byTag[entry.rd_tag] ?? 0) + hours;
  }

  return {
    totalHours,
    byStage,
    byTag,
    eligibleHours: (byTag["core_rd"] ?? 0) + (byTag["rd_supporting"] ?? 0),
  };
}

export async function createExperiment(formData: FormData) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { error } = await admin.from("rd_experiments").insert({
    org_id: profile.org_id,
    title: formData.get("title") as string,
    hypothesis: formData.get("hypothesis") as string,
    methodology: (formData.get("methodology") as string) || null,
    stage: (formData.get("stage") as string) || null,
    created_by: profile.id,
  } as never);

  if (error) throw new Error(`Failed to create experiment: ${error.message}`);
  revalidatePath("/settings/rd-tracking");
}

export async function updateExperiment(
  id: string,
  updates: { outcome?: string; status?: ExperimentStatus }
) {
  await getProfile();
  const admin = createAdminClient();

  const { error } = await admin
    .from("rd_experiments")
    .update(updates as never)
    .eq("id", id);

  if (error) throw new Error(`Failed to update experiment: ${error.message}`);
  revalidatePath("/settings/rd-tracking");
}

export async function listExperiments() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("rd_experiments")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list experiments: ${error.message}`);
  return data ?? [];
}

export async function exportTimeEntriesCsv() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("rd_time_entries")
    .select("date, hours, stage, deliverable, rd_tag, description")
    .eq("org_id", profile.org_id)
    .order("date", { ascending: true });

  if (error) throw new Error(`Failed to export: ${error.message}`);

  const entries = data ?? [];
  const header = "Date,Hours,Stage,Deliverable,R&D Tag,Description";
  const rows = entries.map(
    (e) =>
      `${e.date},${e.hours},"${e.stage}","${e.deliverable}","${e.rd_tag}","${(e.description ?? "").replace(/"/g, '""')}"`
  );

  return [header, ...rows].join("\n");
}

// ============================================================
// Auto-Tracking Actions
// ============================================================

export async function getAutoTrackingConfig() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data } = await admin
    .from("rd_tracking_config")
    .select("*")
    .eq("org_id", profile.org_id)
    .single();

  return data;
}

export async function updateAutoTrackingConfig(updates: {
  enabled?: boolean;
  github_repo?: string | null;
  webhook_secret?: string | null;
  default_hours_per_commit?: number;
  auto_approve_threshold?: number;
}) {
  const profile = await getProfile();
  if (!["owner", "admin"].includes(profile.role)) {
    throw new Error("Admin access required");
  }

  const admin = createAdminClient();

  // Upsert — create if doesn't exist
  const { data: existing } = await admin
    .from("rd_tracking_config")
    .select("id")
    .eq("org_id", profile.org_id)
    .single();

  if (existing) {
    const { error } = await admin
      .from("rd_tracking_config")
      .update(updates as never)
      .eq("org_id", profile.org_id);
    if (error) throw new Error(`Failed to update config: ${error.message}`);
  } else {
    const { error } = await admin.from("rd_tracking_config").insert({
      org_id: profile.org_id,
      webhook_secret: randomBytes(32).toString("hex"),
      ...updates,
    } as never);
    if (error) throw new Error(`Failed to create config: ${error.message}`);
  }

  revalidatePath("/settings/rd-tracking");
}

export async function generateWebhookSecret() {
  const profile = await getProfile();
  if (!["owner", "admin"].includes(profile.role)) {
    throw new Error("Admin access required");
  }

  const secret = randomBytes(32).toString("hex");
  const admin = createAdminClient();

  const { error } = await admin
    .from("rd_tracking_config")
    .update({ webhook_secret: secret } as never)
    .eq("org_id", profile.org_id);

  if (error) throw new Error(`Failed to generate secret: ${error.message}`);
  revalidatePath("/settings/rd-tracking");
  return secret;
}

export async function listAutoEntries(filters?: {
  reviewStatus?: ReviewStatus;
  startDate?: string;
  endDate?: string;
}) {
  const profile = await getProfile();
  const admin = createAdminClient();

  let query = admin
    .from("rd_auto_entries")
    .select(
      "*, rd_commit_logs(sha, message, repo, branch, author_name, committed_at, files_changed)"
    )
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (filters?.reviewStatus) {
    query = query.eq("review_status", filters.reviewStatus);
  }
  if (filters?.startDate) {
    query = query.gte("date", filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte("date", filters.endDate);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list auto entries: ${error.message}`);
  return data ?? [];
}

export async function approveAutoEntry(entryId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  // Get the entry
  const { data: entry, error: fetchError } = await admin
    .from("rd_auto_entries")
    .select("*")
    .eq("id", entryId)
    .eq("org_id", profile.org_id)
    .single();

  if (fetchError || !entry) {
    throw new Error("Entry not found");
  }

  // Update review status
  await admin
    .from("rd_auto_entries")
    .update({
      review_status: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id", entryId);

  // Copy to rd_time_entries
  await admin.from("rd_time_entries").insert({
    profile_id: profile.id,
    org_id: profile.org_id,
    date: entry.date,
    hours: entry.hours,
    stage: entry.stage,
    deliverable: entry.deliverable,
    rd_tag: entry.rd_tag as RdTag,
    description: entry.description,
  } as never);

  revalidatePath("/settings/rd-tracking");
}

export async function rejectAutoEntry(entryId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { error } = await admin
    .from("rd_auto_entries")
    .update({
      review_status: "rejected",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id", entryId)
    .eq("org_id", profile.org_id);

  if (error) throw new Error(`Failed to reject entry: ${error.message}`);
  revalidatePath("/settings/rd-tracking");
}

export async function bulkApproveEntries(entryIds: string[]) {
  const profile = await getProfile();
  const admin = createAdminClient();

  // Fetch all entries
  const { data: entries, error: fetchError } = await admin
    .from("rd_auto_entries")
    .select("*")
    .in("id", entryIds)
    .eq("org_id", profile.org_id)
    .eq("review_status", "pending");

  if (fetchError || !entries) {
    throw new Error("Failed to fetch entries");
  }

  // Update all to approved
  await admin
    .from("rd_auto_entries")
    .update({
      review_status: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .in("id", entryIds)
    .eq("org_id", profile.org_id);

  // Copy all to rd_time_entries
  const timeEntries = entries.map((e) => ({
    profile_id: profile.id,
    org_id: profile.org_id,
    date: e.date,
    hours: e.hours,
    stage: e.stage,
    deliverable: e.deliverable,
    rd_tag: e.rd_tag as RdTag,
    description: e.description,
  }));

  if (timeEntries.length > 0) {
    await admin.from("rd_time_entries").insert(timeEntries as never);
  }

  revalidatePath("/settings/rd-tracking");
}

export async function listFileMappings() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("rd_file_mappings")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("priority", { ascending: false });

  if (error) throw new Error(`Failed to list mappings: ${error.message}`);
  return data ?? [];
}

export async function saveFileMappings(
  mappings: Array<{
    id?: string;
    pattern: string;
    stage: string;
    deliverable: string;
    rd_tag: RdTag;
    priority: number;
  }>
) {
  const profile = await getProfile();
  if (!["owner", "admin"].includes(profile.role)) {
    throw new Error("Admin access required");
  }

  const admin = createAdminClient();

  // Delete existing mappings for this org
  await admin
    .from("rd_file_mappings")
    .delete()
    .eq("org_id", profile.org_id);

  // Insert new mappings
  if (mappings.length > 0) {
    const rows = mappings.map((m) => ({
      org_id: profile.org_id,
      pattern: m.pattern,
      stage: m.stage,
      deliverable: m.deliverable,
      rd_tag: m.rd_tag,
      priority: m.priority,
    }));

    const { error } = await admin
      .from("rd_file_mappings")
      .insert(rows as never);

    if (error) throw new Error(`Failed to save mappings: ${error.message}`);
  }

  revalidatePath("/settings/rd-tracking");
}

export async function getAutoTrackingStats() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: autoEntries, error } = await admin
    .from("rd_auto_entries")
    .select("hours, review_status")
    .eq("org_id", profile.org_id);

  if (error) throw new Error(`Failed to get stats: ${error.message}`);

  const entries = autoEntries ?? [];
  let totalAutoHours = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;

  for (const e of entries) {
    totalAutoHours += Number(e.hours);
    if (e.review_status === "pending") pendingCount++;
    else if (e.review_status === "approved") approvedCount++;
    else if (e.review_status === "rejected") rejectedCount++;
  }

  const totalReviewed = approvedCount + rejectedCount;
  const approvalRate = totalReviewed > 0 ? approvedCount / totalReviewed : 0;

  return {
    totalAutoHours,
    pendingCount,
    approvedCount,
    rejectedCount,
    approvalRate,
  };
}
