"use server";

import { db } from "@/lib/supabase/db";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ModuleId } from "@/lib/stripe/plans";
import { allTasksDone, taskCount } from "@/lib/beta/testing-tasks";

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
  return { userId: user.id, orgId: profile.org_id, role: profile.role, fullName: profile.full_name };
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
  const { userId } = await requireUser();

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
