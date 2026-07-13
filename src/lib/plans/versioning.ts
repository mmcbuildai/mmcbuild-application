// SCRUM-333 (Phase 2): decide what happens when a drawing is uploaded to a slot
// (project_id, file_name) that may already hold a current version. Pure so the
// registerPlan behaviour is unit-testable without a DB.
//
// Old behaviour: a duplicate filename was rejected. New behaviour: a settled
// current version is SUPERSEDED by the new upload (a new version), so "compile
// latest versions" always has the newest drawing and prior versions are
// retained. An in-flight current upload (still uploading/processing) still
// blocks, so a double-submit can't fork two versions.

export interface CurrentPlanRow {
  id: string;
  status: string;
  version: number | null;
}

export type PlanVersionDecision =
  | { action: "reject-in-flight" }
  | { action: "create"; version: number; supersedeId: string | null };

export function decidePlanVersion(
  current: CurrentPlanRow | null | undefined,
): PlanVersionDecision {
  if (!current) {
    return { action: "create", version: 1, supersedeId: null };
  }
  if (current.status === "uploading" || current.status === "processing") {
    return { action: "reject-in-flight" };
  }
  return {
    action: "create",
    version: (current.version ?? 1) + 1,
    supersedeId: current.id,
  };
}
