"use server";

import { db } from "@/lib/supabase/db";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ModuleId } from "@/lib/stripe/plans";
import {
  allTasksDone,
  taskCount,
  TASK_AUTO_SIGNALS,
  type AutoSignal,
} from "@/lib/beta/testing-tasks";

const VALID_MODULES: ModuleId[] = ["comply", "build", "quote", "direct", "train"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await db()
    .from("profiles")
    .select("id, org_id, role, full_name")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");
  return {
    userId: user.id,
    profileId: profile.id as string,
    orgId: profile.org_id,
    role: profile.role,
    fullName: profile.full_name,
  };
}

/**
 * Has the tester actually performed the action behind an auto-tickable task?
 * Best-effort + defensive: any query error (e.g. an unexpected schema) returns
 * false, so the task simply stays manual — this must NEVER throw and break the
 * dashboard load. Only a COMPLETED run counts (a row exists the moment a run is
 * queued, but the task must reflect completion, not that they picked the module).
 */
async function signalSatisfied(
  signal: AutoSignal,
  ctx: { profileId: string; orgId: string },
): Promise<boolean> {
  const { profileId, orgId } = ctx;
  try {
    switch (signal.kind) {
      case "run": {
        const { count } = await db()
          .from(signal.table)
          .select("id", { count: "exact", head: true })
          .eq("created_by", profileId)
          .eq("status", "completed");
        return (count ?? 0) > 0;
      }
      case "recheck": {
        // A re-check is a completed compliance_check chained to a parent.
        const { count } = await db()
          .from("compliance_checks")
          .select("id", { count: "exact", head: true })
          .eq("created_by", profileId)
          .eq("status", "completed")
          .not("parent_check_id", "is", null);
        return (count ?? 0) > 0;
      }
      case "finding_resolved": {
        const { data: checks } = await db()
          .from("compliance_checks")
          .select("id")
          .eq("created_by", profileId)
          .limit(200);
        const ids = ((checks ?? []) as { id: string }[]).map((c) => c.id);
        if (ids.length === 0) return false;
        const { count } = await db()
          .from("compliance_findings")
          .select("id", { count: "exact", head: true })
          .in("check_id", ids)
          .not("resolution_type", "is", null);
        return (count ?? 0) > 0;
      }
      case "systems_selected": {
        const { data } = await db()
          .from("projects")
          .select("selected_systems")
          .eq("created_by", profileId);
        return ((data ?? []) as { selected_systems: unknown }[]).some(
          (p) => Array.isArray(p.selected_systems) && p.selected_systems.length > 0,
        );
      }
      case "direct_registered": {
        const { count } = await db()
          .from("professionals")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId);
        return (count ?? 0) > 0;
      }
      case "enrolled": {
        const { count } = await db()
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId);
        return (count ?? 0) > 0;
      }
      case "lesson_completed": {
        const { count } = await db()
          .from("lesson_completions")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId);
        return (count ?? 0) > 0;
      }
    }
  } catch {
    return false; // schema mismatch / transient error → leave the task manual
  }
  return false;
}

/**
 * Auto-tick every task whose real-world action the tester has actually done —
 * so the in-module checklist ticks itself as they go (run a check, resolve a
 * finding, re-check, generate the 3D model, select systems, register a business,
 * enrol, complete a lesson). Manual tasks (searches / views / exports we don't
 * trace) the tester ticks by hand. Persisted to beta_feedback.completed_tasks.
 */
async function autoTickTasks(
  userId: string,
  orgId: string,
  profileId: string,
) {
  for (const moduleId of VALID_MODULES) {
    const signals = TASK_AUTO_SIGNALS[moduleId];
    const satisfied: number[] = [];
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      if (s && (await signalSatisfied(s, { profileId, orgId }))) satisfied.push(i);
    }
    if (satisfied.length === 0) continue;

    const { data: row } = await db()
      .from("beta_feedback")
      .select("id, status, completed_tasks")
      .eq("user_id", userId)
      .eq("module_id", moduleId)
      .maybeSingle();

    if (row) {
      const done: number[] = Array.isArray(row.completed_tasks)
        ? (row.completed_tasks as number[])
        : [];
      const next = Array.from(new Set([...done, ...satisfied])).sort(
        (a, b) => a - b,
      );
      if (next.length === done.length) continue; // nothing new
      await db()
        .from("beta_feedback")
        .update({
          completed_tasks: next,
          status: row.status === "not_started" ? "in_progress" : row.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } else {
      await db().from("beta_feedback").insert({
        user_id: userId,
        module_id: moduleId,
        org_id: orgId,
        status: "in_progress",
        completed_tasks: satisfied.sort((a, b) => a - b),
        started_at: new Date().toISOString(),
      });
    }
  }
}

export interface BetaFeedbackRow {
  id: string;
  module_id: ModuleId;
  status: "not_started" | "in_progress" | "completed";
  feedback: string | null;
  rating: number | null;
  started_at: string | null;
  completed_at: string | null;
  /** Indices (per src/lib/beta/testing-tasks.ts) of the tasks ticked off. */
  completed_tasks: number[];
}

export async function getBetaProgress(): Promise<BetaFeedbackRow[]> {
  const { userId, orgId, profileId } = await requireUser();

  // Auto-tick "ran the module" tasks from the run tables before reading back.
  await autoTickTasks(userId, orgId, profileId);

  const { data } = await db()
    .from("beta_feedback")
    .select(
      "id, module_id, status, feedback, rating, started_at, completed_at, completed_tasks"
    )
    .eq("user_id", userId);

  const raw = (data ?? []) as Array<
    BetaFeedbackRow & { completed_tasks?: unknown }
  >;
  const rows: BetaFeedbackRow[] = raw.map((r) => ({
    ...r,
    completed_tasks: Array.isArray(r.completed_tasks)
      ? (r.completed_tasks as number[])
      : [],
  }));
  const map = new Map(rows.map((r) => [r.module_id, r]));

  // Return one entry per module, defaulting to not_started
  return VALID_MODULES.map(
    (moduleId) =>
      map.get(moduleId) ?? {
        id: "",
        module_id: moduleId,
        status: "not_started" as const,
        feedback: null,
        rating: null,
        started_at: null,
        completed_at: null,
        completed_tasks: [],
      }
  );
}

/**
 * Toggle a single test task on/off for a module. Creates the beta_feedback row
 * (status in_progress) on first tick so partial progress is always persisted.
 * Returns the new completed_tasks array.
 */
export async function toggleTask(
  moduleId: string,
  taskIndex: number
): Promise<{ error?: string; completed_tasks?: number[]; status?: string }> {
  if (!VALID_MODULES.includes(moduleId as ModuleId)) {
    return { error: "Invalid module" };
  }
  const n = taskCount(moduleId as ModuleId);
  if (!Number.isInteger(taskIndex) || taskIndex < 0 || taskIndex >= n) {
    return { error: "Invalid task" };
  }

  const { userId, orgId } = await requireUser();

  const { data: existing } = await db()
    .from("beta_feedback")
    .select("id, status, completed_tasks")
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .maybeSingle();

  const current: number[] = Array.isArray(existing?.completed_tasks)
    ? (existing!.completed_tasks as number[])
    : [];
  const next = current.includes(taskIndex)
    ? current.filter((i) => i !== taskIndex)
    : [...current, taskIndex].sort((a, b) => a - b);

  if (existing) {
    // Ticking the first task moves a not_started module into in_progress.
    const nextStatus =
      existing.status === "not_started" && next.length > 0
        ? "in_progress"
        : existing.status;
    const { error } = await db()
      .from("beta_feedback")
      .update({
        completed_tasks: next,
        status: nextStatus,
        started_at:
          existing.status === "not_started" && next.length > 0
            ? new Date().toISOString()
            : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    revalidatePath("/beta");
    return { completed_tasks: next, status: nextStatus };
  }

  const { error } = await db().from("beta_feedback").insert({
    user_id: userId,
    module_id: moduleId,
    org_id: orgId,
    status: "in_progress",
    completed_tasks: next,
    started_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath("/beta");
  return { completed_tasks: next, status: "in_progress" };
}

export async function startTesting(moduleId: string) {
  if (!VALID_MODULES.includes(moduleId as ModuleId)) {
    return { error: "Invalid module" };
  }

  const { userId, orgId } = await requireUser();

  // Check if already exists
  const { data: existing } = await db()
    .from("beta_feedback")
    .select("id, status")
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (existing) {
    // Only update if not_started
    if (existing.status === "not_started") {
      const { error } = await db()
        .from("beta_feedback")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) return { error: error.message };
    }
  } else {
    const { error } = await db()
      .from("beta_feedback")
      .insert({
        user_id: userId,
        module_id: moduleId,
        org_id: orgId,
        status: "in_progress",
        started_at: new Date().toISOString(),
      });
    if (error) return { error: error.message };
  }

  revalidatePath("/beta");
  return { success: true };
}

export async function submitFeedback(
  moduleId: string,
  feedback: string,
  rating: number
) {
  if (!VALID_MODULES.includes(moduleId as ModuleId)) {
    return { error: "Invalid module" };
  }
  if (!feedback.trim()) return { error: "Feedback is required" };
  if (rating < 1 || rating > 5) return { error: "Rating must be 1-5" };

  const { userId, orgId } = await requireUser();

  // Check if exists
  const { data: existing } = await db()
    .from("beta_feedback")
    .select("id, completed_tasks")
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .maybeSingle();

  // A module is only "fully complete" when every test task is ticked AND a
  // review (rating) + comment are provided. Guard the tasks half here.
  const done: number[] = Array.isArray(existing?.completed_tasks)
    ? (existing!.completed_tasks as number[])
    : [];
  if (!allTasksDone(moduleId as ModuleId, done)) {
    return {
      error: `Tick off all ${taskCount(moduleId as ModuleId)} test tasks before completing this module.`,
    };
  }

  if (existing) {
    const { error } = await db()
      .from("beta_feedback")
      .update({
        status: "completed",
        feedback,
        rating,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await db()
      .from("beta_feedback")
      .insert({
        user_id: userId,
        module_id: moduleId,
        org_id: orgId,
        status: "completed",
        feedback,
        rating,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    if (error) return { error: error.message };
  }

  revalidatePath("/beta");
  return { success: true };
}
