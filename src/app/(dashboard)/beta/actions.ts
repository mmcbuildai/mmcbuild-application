"use server";

import { db } from "@/lib/supabase/db";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ModuleId } from "@/lib/stripe/plans";

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
}

export async function getBetaProgress(): Promise<BetaFeedbackRow[]> {
  const { userId } = await requireUser();

  const { data } = await db()
    .from("beta_feedback")
    .select("id, module_id, status, feedback, rating, started_at, completed_at")
    .eq("user_id", userId);

  const rows = (data ?? []) as BetaFeedbackRow[];
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
      }
  );
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
    .select("id")
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .maybeSingle();

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
