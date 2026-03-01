"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { RdTag, ExperimentStatus } from "@/lib/supabase/types";

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
