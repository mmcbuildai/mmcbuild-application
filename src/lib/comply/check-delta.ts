// Check delta — the v1 -> v2 comparison between a parent compliance check and a
// re-check (Comply remediation convergence — Phase 3).
//
// When a builder re-runs compliance against an (optionally updated) design, the
// new check chains to the prior one (parent_check_id + version). This module is
// the PURE comparison logic that turns the two finding sets into a delta the
// report renders: which non-compliant items were CLEARED, which are STILL OPEN,
// and which are NEWLY INTRODUCED.
//
// It is intentionally DB-free so it is unit-testable and reusable by both the
// report page and (potentially) the pipeline. Callers are responsible for
// filtering to the actionable (non-compliant / critical) findings before passing
// them in — the delta is only meaningful for items that need remediation.

/** The minimal shape the match heuristic reads off a finding row. */
export interface DeltaFinding {
  ncc_section: string;
  category: string;
}

/** A finding row that may carry a builder waiver, for carry-forward. */
export interface WaivedParentFinding {
  ncc_section: string;
  category: string;
  resolution_type?: string | null;
  waiver_reason?: string | null;
  resolved_by?: string | null;
}

/** A just-stored child finding, addressable by id for the carry-forward UPDATE. */
export interface ChildFindingRow {
  id: string;
  ncc_section: string;
  category: string;
}

/**
 * The heuristic key used to match a finding across check versions.
 *
 * We match on (ncc_section, category), normalised for case + surrounding
 * whitespace. We deliberately do NOT match on `title`: the title is generated
 * fresh by the LLM each run and is too variable to be a stable identity (the
 * same underlying issue can be phrased differently between v1 and v2). The NCC
 * section + category pair is the most stable cross-version signal available
 * without a structural finding id the model does not produce.
 */
export function findingMatchKey(f: { ncc_section: string; category: string }): string {
  return `${f.ncc_section.trim().toLowerCase()}|${f.category.trim().toLowerCase()}`;
}

export interface CheckDelta<T extends DeltaFinding = DeltaFinding> {
  /** In the parent, not in the child — the re-check no longer flags it. */
  cleared: T[];
  /** In both — the issue persists (a regression if it was resolved via drawings). */
  stillOpen: T[];
  /** In the child, not in the parent — surfaced for the first time by the re-check. */
  newlyIntroduced: T[];
}

/**
 * Compute the v1 -> v2 delta between two sets of ACTIONABLE findings.
 *
 * Matching is by {@link findingMatchKey} (ncc_section + category,
 * case/whitespace-insensitive):
 *   - cleared          = key present in parent but absent in child
 *   - stillOpen        = key present in both
 *   - newlyIntroduced  = key present in child but absent in parent
 *
 * The caller MUST pre-filter both arrays to the non-compliant/critical findings
 * — the delta is only meaningful for items that need remediation.
 */
export function computeCheckDelta<T extends DeltaFinding>(
  parentFindings: T[],
  childFindings: T[]
): CheckDelta<T> {
  const childKeys = new Set(childFindings.map(findingMatchKey));
  const parentKeys = new Set(parentFindings.map(findingMatchKey));

  const cleared = parentFindings.filter((f) => !childKeys.has(findingMatchKey(f)));
  const stillOpen = childFindings.filter((f) => parentKeys.has(findingMatchKey(f)));
  const newlyIntroduced = childFindings.filter(
    (f) => !parentKeys.has(findingMatchKey(f))
  );

  return { cleared, stillOpen, newlyIntroduced };
}

/** A child finding paired with the parent waiver to carry forward onto it. */
export interface WaiverCarryForward {
  childFindingId: string;
  waiverReason: string | null;
  resolvedBy: string | null;
}

/**
 * Determine which child findings inherit a WAIVED parent finding's waiver.
 *
 * Carry-forward rule (LOCKED): a finding the builder WAIVED in the parent must
 * not reappear as a fresh open item in the child — the waiver follows the issue.
 * Resolutions via updated_drawings / evidence do NOT carry: those must be
 * re-verified by the new check (if they reappear, that is a still-open /
 * regression the builder needs to see).
 *
 * Matching is by {@link findingMatchKey}. Only parent findings with
 * resolution_type === 'waiver' are considered. Pure (no DB) so the caller can
 * apply the returned updates with the admin client.
 */
export function carryForwardWaivers(
  parentWaivedFindings: WaivedParentFinding[],
  childFindings: ChildFindingRow[]
): WaiverCarryForward[] {
  // Index the parent WAIVERS by match key (ignore any non-waiver rows defensively).
  const waiverByKey = new Map<string, WaivedParentFinding>();
  for (const p of parentWaivedFindings) {
    if (p.resolution_type !== "waiver") continue;
    // First waiver for a key wins (a parent should not have duplicates, but be
    // deterministic if it does).
    const key = findingMatchKey(p);
    if (!waiverByKey.has(key)) waiverByKey.set(key, p);
  }

  const out: WaiverCarryForward[] = [];
  for (const child of childFindings) {
    const match = waiverByKey.get(findingMatchKey(child));
    if (match) {
      out.push({
        childFindingId: child.id,
        waiverReason: match.waiver_reason ?? null,
        resolvedBy: match.resolved_by ?? null,
      });
    }
  }
  return out;
}
