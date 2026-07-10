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

export async function updateTimeEntry(
  entryId: string,
  updates: {
    date?: string;
    hours?: number;
    stage?: string;
    deliverable?: string;
    rd_tag?: RdTag;
    description?: string;
  }
) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: entry } = await admin
    .from("rd_time_entries")
    .select("org_id")
    .eq("id", entryId)
    .single();

  if (!entry || entry.org_id !== profile.org_id) {
    throw new Error("Entry not found");
  }

  const { error } = await admin
    .from("rd_time_entries")
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq("id", entryId);

  if (error) throw new Error(`Failed to update entry: ${error.message}`);
  revalidatePath("/settings/rd-tracking");
}

export async function deleteTimeEntry(entryId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  // Cross-tenant isolation (SCRUM-343): verify the entry is the caller's org's
  // before deleting (mirrors updateTimeEntry) — regulated R&D-tax record.
  const { data: entry } = await admin
    .from("rd_time_entries")
    .select("org_id")
    .eq("id", entryId)
    .single();
  if (!entry || entry.org_id !== profile.org_id) {
    throw new Error("Entry not found");
  }

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
  const profile = await getProfile();
  const admin = createAdminClient();

  // Cross-tenant isolation (SCRUM-343): verify the experiment is the caller's
  // org's before updating (mirrors deleteExperiment) — regulated R&D record.
  const { data: experiment } = await admin
    .from("rd_experiments")
    .select("org_id")
    .eq("id", id)
    .single();
  if (!experiment || experiment.org_id !== profile.org_id) {
    throw new Error("Experiment not found");
  }

  const { error } = await admin
    .from("rd_experiments")
    .update(updates as never)
    .eq("id", id);

  if (error) throw new Error(`Failed to update experiment: ${error.message}`);
  revalidatePath("/settings/rd-tracking");
}

export async function deleteExperiment(experimentId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: experiment } = await admin
    .from("rd_experiments")
    .select("org_id")
    .eq("id", experimentId)
    .single();

  if (!experiment || experiment.org_id !== profile.org_id) {
    throw new Error("Experiment not found");
  }

  const { error } = await admin
    .from("rd_experiments")
    .delete()
    .eq("id", experimentId);

  if (error) throw new Error(`Failed to delete experiment: ${error.message}`);
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

// ============================================================
// Deployment Sync — pull commits from GitHub and backfill R&D entries
// Each deployment (push to main) = 2 hours of R&D time
// ============================================================

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
  author?: { login: string } | null;
  files?: { filename: string; status: string }[];
}

/**
 * Map a commit message to a likely R&D stage + deliverable based on keywords.
 */
function classifyCommitByMessage(message: string): {
  stage: string;
  deliverable: string;
  rd_tag: "core_rd" | "rd_supporting" | "not_eligible";
} {
  const msg = message.toLowerCase();

  // Stage/module detection
  if (msg.includes("comply") || msg.includes("compliance") || msg.includes("ncc")) {
    return { stage: "stage_1", deliverable: "ai_compliance_engine", rd_tag: "core_rd" };
  }
  if (msg.includes("rag") || msg.includes("embedding") || msg.includes("knowledge")) {
    return { stage: "stage_1", deliverable: "rag_pipeline", rd_tag: "core_rd" };
  }
  if (msg.includes("design optim") || msg.includes("mmc build")) {
    return { stage: "stage_2", deliverable: "design_optimisation", rd_tag: "core_rd" };
  }
  if (msg.includes("cost") || msg.includes("quote") || msg.includes("estimat")) {
    return { stage: "stage_3", deliverable: "cost_estimation", rd_tag: "core_rd" };
  }
  if (msg.includes("direct") || msg.includes("trade") || msg.includes("directory")) {
    return { stage: "stage_4", deliverable: "trade_matching", rd_tag: "core_rd" };
  }
  if (msg.includes("train") || msg.includes("lms") || msg.includes("course")) {
    return { stage: "stage_5", deliverable: "training_content_ai", rd_tag: "core_rd" };
  }
  if (msg.includes("billing") || msg.includes("stripe") || msg.includes("subscription")) {
    return { stage: "stage_6", deliverable: "other", rd_tag: "rd_supporting" };
  }
  if (msg.includes("ai") || msg.includes("model") || msg.includes("claude") || msg.includes("inngest")) {
    return { stage: "stage_1", deliverable: "ai_compliance_engine", rd_tag: "core_rd" };
  }
  if (msg.includes("migration") || msg.includes("schema") || msg.includes("supabase")) {
    return { stage: "stage_0", deliverable: "database_schema", rd_tag: "rd_supporting" };
  }
  if (msg.includes("auth") || msg.includes("role") || msg.includes("rls")) {
    return { stage: "stage_0", deliverable: "auth_rbac", rd_tag: "rd_supporting" };
  }
  if (msg.includes("fix") || msg.includes("bug")) {
    return { stage: "stage_0", deliverable: "testing_qa", rd_tag: "rd_supporting" };
  }

  return { stage: "stage_0", deliverable: "other", rd_tag: "rd_supporting" };
}

export async function syncDeployments() {
  const profile = await getProfile();
  if (!["owner", "admin"].includes(profile.role)) {
    throw new Error("Admin access required");
  }

  const admin = createAdminClient();

  // Get config
  const { data: config } = await admin
    .from("rd_tracking_config")
    .select("*")
    .eq("org_id", profile.org_id)
    .single();

  if (!config) throw new Error("R&D tracking not configured");

  const repo = config.github_repo;
  if (!repo) throw new Error("GitHub repo not set in config");

  const hoursPerDeployment = Number(config.default_hours_per_commit) || 2.0;

  // Fetch commits from GitHub API (public repo, no auth needed)
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits?sha=main&per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "MMCBuild-RD-Tracker",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const commits: GitHubCommit[] = await res.json();

  // Get existing SHAs to avoid duplicates
  const { data: existingLogs } = await admin
    .from("rd_commit_logs")
    .select("sha")
    .eq("org_id", profile.org_id);

  const existingShas = new Set(
    ((existingLogs ?? []) as { sha: string }[]).map((l) => l.sha)
  );

  let synced = 0;
  let skipped = 0;

  for (const commit of commits) {
    if (existingShas.has(commit.sha)) {
      skipped++;
      continue;
    }

    const classification = classifyCommitByMessage(commit.commit.message);
    const committedAt = commit.commit.author.date;
    const date = committedAt.split("T")[0];

    // Insert commit log
    const { data: commitLog, error: logError } = await admin
      .from("rd_commit_logs")
      .insert({
        org_id: profile.org_id,
        sha: commit.sha,
        author_name: commit.commit.author.name,
        author_email: commit.commit.author.email,
        message: commit.commit.message.slice(0, 500),
        files_changed: JSON.stringify(
          (commit.files ?? []).map((f) => ({
            path: f.filename,
            action: f.status,
          }))
        ),
        repo,
        branch: "main",
        committed_at: committedAt,
        status: "classified",
      } as never)
      .select("id")
      .single();

    if (logError || !commitLog) {
      console.error(`[RD Sync] Failed to insert commit ${commit.sha}:`, logError);
      continue;
    }

    const commitLogId = (commitLog as { id: string }).id;

    // Insert auto entry with 2h per deployment
    const { data: autoEntry, error: entryError } = await admin
      .from("rd_auto_entries")
      .insert({
        org_id: profile.org_id,
        commit_id: commitLogId,
        date,
        hours: hoursPerDeployment,
        stage: classification.stage,
        deliverable: classification.deliverable,
        rd_tag: classification.rd_tag,
        description: `[${commit.sha.slice(0, 7)}] ${commit.commit.message.slice(0, 200)}`,
        ai_reasoning: `Auto-classified from commit message keywords. Deployment-level tracking at ${hoursPerDeployment}h per deployment.`,
        confidence: 0.75,
        review_status: "approved",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();

    if (entryError) {
      console.error(`[RD Sync] Failed to insert auto entry for ${commit.sha}:`, entryError);
      continue;
    }

    // Also insert into rd_time_entries (approved entries)
    await admin.from("rd_time_entries").insert({
      profile_id: profile.id,
      org_id: profile.org_id,
      date,
      hours: hoursPerDeployment,
      stage: classification.stage,
      deliverable: classification.deliverable,
      rd_tag: classification.rd_tag,
      description: `[Auto] ${commit.sha.slice(0, 7)}: ${commit.commit.message.slice(0, 200)}`,
    } as never);

    synced++;
  }

  revalidatePath("/settings/rd-tracking");

  return {
    synced,
    skipped,
    total: commits.length,
    hoursPerDeployment,
    totalHoursAdded: synced * hoursPerDeployment,
  };
}
