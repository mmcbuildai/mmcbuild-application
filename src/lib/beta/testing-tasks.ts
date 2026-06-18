import type { ModuleId } from "@/lib/stripe/plans";

/**
 * The per-module beta test tasks. Single source of truth shared by the beta
 * dashboard (renders them as a checklist) and the server actions (validate that
 * EVERY task is ticked before a module can be marked complete). The order is the
 * task index persisted in beta_feedback.completed_tasks, so DO NOT reorder or
 * remove entries without a data migration — append only.
 */
export const TESTING_TASKS: Record<ModuleId, string[]> = {
  comply: [
    "Upload a PDF building plan and run a compliance check",
    "Review the generated NCC findings report",
    "Check that citations reference specific NCC clauses",
    "Try exporting the report as PDF",
  ],
  build: [
    "Open an existing project and view design suggestions",
    "Check the 3D viewer loads correctly",
    "Review material and system selection options",
    "Verify suggestions are relevant to your project type",
  ],
  quote: [
    "Generate a cost estimate for a project",
    "Compare traditional vs MMC cost breakdown",
    "Check that rate benchmarks look reasonable",
    "Try exporting the quote as PDF or Word",
  ],
  direct: [
    "Search for trades by state and category",
    "Open a company profile and check all fields display",
    "Try filtering by certification status",
    "Test the enquiry form on a listing",
  ],
  train: [
    "Browse available training modules",
    "Start a module and complete at least one lesson",
    "Check that progress is tracked on the dashboard",
    "Try a quiz and verify scoring works",
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
