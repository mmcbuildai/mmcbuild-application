import type { ModuleId } from "@/lib/stripe/plans";

/**
 * The per-module beta test tasks. Single source of truth shared by the beta
 * dashboard + in-context checklist (render the labels) and the server actions
 * (validate every task is ticked before a module completes; auto-tick the ones
 * the system can detect).
 *
 * Each task is a CONCRETE action the tester actually performs inside the module
 * — a doing-word, not "review/check that…". Where the action leaves a detectable
 * trace, it AUTO-TICKS (TASK_AUTO_SIGNALS, parallel-indexed) so the tester sees
 * the box tick itself the moment they do it; the rest they tick by hand.
 *
 * The index is persisted in beta_feedback.completed_tasks. Reworked 2026-06-25
 * (concrete verbs + auto-tick) — early beta, so existing partial ticks simply
 * re-derive via auto-tick on next load; the demo account resets anyway.
 */
export const TESTING_TASKS: Record<ModuleId, string[]> = {
  comply: [
    "Run a compliance check on a building plan",
    "Resolve or waive a finding in the report",
    "Re-check compliance after resolving items",
  ],
  build: [
    "Generate the 3D model of your design",
    "Select the construction systems for your project",
    "Open the System Explorer to compare the MMC build methods",
  ],
  quote: [
    "Run a cost estimate for your project",
    "Open a cost line to check its supplier rate source",
    "Export your cost report (PDF or Word)",
  ],
  direct: [
    "Search the directory by trade and state",
    "Open a business listing to view its details",
    "Register your business in the directory",
  ],
  train: [
    "Enrol in a course",
    "Complete a lesson in that course",
    "Tell us what course would help you most",
  ],
};

/**
 * How an individual task auto-ticks, parallel-indexed to TESTING_TASKS. `null`
 * means the task is manual (a search / view / export we don't trace). The server
 * (autoTickTasks) evaluates each signal best-effort — an unknown table/column
 * just leaves the task manual, never throws.
 */
export type AutoSignal =
  | { kind: "run"; table: "compliance_checks" | "design_checks" | "cost_estimates" }
  | { kind: "recheck" }
  | { kind: "finding_resolved" }
  | { kind: "systems_selected" }
  | { kind: "direct_registered" }
  | { kind: "enrolled" }
  | { kind: "lesson_completed" };

export const TASK_AUTO_SIGNALS: Record<ModuleId, (AutoSignal | null)[]> = {
  comply: [
    { kind: "run", table: "compliance_checks" },
    { kind: "finding_resolved" },
    { kind: "recheck" },
  ],
  build: [
    { kind: "run", table: "design_checks" },
    { kind: "systems_selected" },
    null,
  ],
  quote: [
    { kind: "run", table: "cost_estimates" },
    null,
    null,
  ],
  direct: [
    null,
    null,
    { kind: "direct_registered" },
  ],
  train: [
    { kind: "enrolled" },
    { kind: "lesson_completed" },
    null,
  ],
};

/** Number of tasks for a module — the bar a tester must fully tick to complete it. */
export function taskCount(moduleId: ModuleId): number {
  return TESTING_TASKS[moduleId]?.length ?? 0;
}

/** True when every task index for the module is present in `done`. */
export function allTasksDone(moduleId: ModuleId, done: number[]): boolean {
  const n = taskCount(moduleId);
  if (n === 0) return true;
  const set = new Set(done);
  for (let i = 0; i < n; i++) if (!set.has(i)) return false;
  return true;
}
