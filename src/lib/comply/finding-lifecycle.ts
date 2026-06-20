// Finding lifecycle — the builder-facing convergence state of a compliance
// finding in the remediation loop (Comply Phase 2).
//
//   Open      → no contributor reply yet, builder has not accepted
//   Responded → a contributor replied (remediation_status moved off 'awaiting',
//               or a responses[] entry exists) but the builder has not accepted
//   Resolved  → the builder accepted via updated drawings or evidence/cert
//   Waived    → the builder waived the finding with a recorded reason
//
// "Responded" is the CONTRIBUTOR's status (existing remediation_status);
// "Resolved"/"Waived" is the BUILDER's verdict (resolution_type/resolved_at,
// added this phase). This function is pure so it can be unit-tested and reused
// by both the server action rollup and the open-items board.

export type FindingLifecycle = "open" | "responded" | "resolved" | "waived";

/** The minimal shape the lifecycle decision reads off a finding row. */
export interface LifecycleInput {
  resolution_type?: string | null;
  resolved_at?: string | null;
  remediation_status?: string | null;
  // Phase-1 contributor replies attached by getComplianceReport. Only its
  // presence (length) is read here.
  responses?: { id: string }[] | null;
}

/**
 * Compute the convergence lifecycle of a single finding.
 *
 * Precedence (builder verdict wins over contributor reply):
 *   1. waiver  → 'waived'
 *   2. resolved_at set (non-waiver) → 'resolved'
 *   3. a contributor reply exists → 'responded'
 *   4. otherwise → 'open'
 */
export function computeFindingLifecycle(finding: LifecycleInput): FindingLifecycle {
  if (finding.resolution_type === "waiver") {
    return "waived";
  }
  if (finding.resolved_at != null) {
    return "resolved";
  }
  const hasResponse =
    (finding.responses != null && finding.responses.length > 0) ||
    (finding.remediation_status != null && finding.remediation_status !== "awaiting");
  if (hasResponse) {
    return "responded";
  }
  return "open";
}

/**
 * True once every actionable (non-compliant) finding has reached a terminal
 * builder verdict — resolved or waived. Drives the display-only readiness gate.
 */
export function allFindingsConverged(findings: LifecycleInput[]): boolean {
  if (findings.length === 0) return false;
  return findings.every((f) => {
    const l = computeFindingLifecycle(f);
    return l === "resolved" || l === "waived";
  });
}

/** Count of findings still needing a builder verdict (open + responded). */
export function unresolvedCount(findings: LifecycleInput[]): number {
  return findings.filter((f) => {
    const l = computeFindingLifecycle(f);
    return l === "open" || l === "responded";
  }).length;
}
