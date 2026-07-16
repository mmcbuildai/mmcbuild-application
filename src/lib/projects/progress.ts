import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-project module progress (SCRUM-46). A project advances through the three
 * module stages — Comply, Build, Quote — each of which has its own results
 * table keyed by project_id with a shared status enum
 * ("queued" | "processing" | "completed" | "error"). A stage counts as done
 * once it has at least one "completed" row.
 */
export interface ProjectStageProgress {
  comply: boolean;
  build: boolean;
  quote: boolean;
}

export const PROJECT_STAGE_COUNT = 3;

export function stageDoneCount(p: ProjectStageProgress): number {
  return (p.comply ? 1 : 0) + (p.build ? 1 : 0) + (p.quote ? 1 : 0);
}

export function stageProgressPct(p: ProjectStageProgress): number {
  return Math.round((stageDoneCount(p) / PROJECT_STAGE_COUNT) * 100);
}

/**
 * Batch-computes stage progress for a set of projects in three queries (one per
 * stage table) rather than N-per-project, so it is safe to call for a whole
 * project list.
 */
export async function getProjectsStageProgress(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, ProjectStageProgress>> {
  const map = new Map<string, ProjectStageProgress>();
  for (const id of projectIds) {
    map.set(id, { comply: false, build: false, quote: false });
  }
  if (projectIds.length === 0) return map;

  const completed = (table: string) =>
    supabase
      .from(table)
      .select("project_id")
      .in("project_id", projectIds)
      .eq("status", "completed");

  const [comply, build, quote] = await Promise.all([
    completed("compliance_checks"),
    completed("design_checks"),
    completed("cost_estimates"),
  ]);

  for (const row of comply.data ?? []) {
    const entry = map.get((row as { project_id: string }).project_id);
    if (entry) entry.comply = true;
  }
  for (const row of build.data ?? []) {
    const entry = map.get((row as { project_id: string }).project_id);
    if (entry) entry.build = true;
  }
  for (const row of quote.data ?? []) {
    const entry = map.get((row as { project_id: string }).project_id);
    if (entry) entry.quote = true;
  }
  return map;
}
