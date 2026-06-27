"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";

type RunKind = "comply" | "quote" | "optimisation";

const TABLE: Record<RunKind, string> = {
  comply: "compliance_checks",
  quote: "cost_estimates",
  optimisation: "design_checks",
};

/**
 * Records the "Notify me when it's ready" opt-in for a run, so the completion
 * email (notify-run-complete) fires only when the user asked for it. Ownership-
 * checked: the caller must own the row (created_by = their profile). Best-effort
 * from the UI — failing to set the flag must never block the run.
 */
export async function requestRunNotify(
  kind: RunKind,
  rowId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile?.id) return { error: "Profile not found" };

  const table = TABLE[kind];
  const { error } = await db()
    .from(table)
    .update({ notify_email: true } as never)
    .eq("id", rowId)
    .eq("created_by", profile.id);

  if (error) return { error: error.message };
  return { ok: true };
}
