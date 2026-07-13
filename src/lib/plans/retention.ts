// SCRUM-333 (Phase 3): retention policy for superseded drawing versions. Pure
// helpers so the policy (window + the safety gate) is unit-testable and the cron
// stays thin.
//
// SAFETY: deletion is DESTRUCTIVE and irreversible, so it is OFF by default. The
// cron runs in DRY-RUN mode (logs what it would delete, deletes nothing) until
// PLAN_RETENTION_ENABLED=true is set in the environment — a deliberate,
// operator-controlled switch, never enabled automatically.

export const DEFAULT_RETENTION_DAYS = 90;

interface RetentionEnv {
  PLAN_RETENTION_ENABLED?: string;
  PLAN_RETENTION_DAYS?: string;
}

/** How long a superseded version is retained before it may be purged. */
export function retentionDays(env: RetentionEnv): number {
  const n = Number(env.PLAN_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_RETENTION_DAYS;
}

/** Live deletion only happens when explicitly enabled; otherwise dry-run. */
export function retentionEnabled(env: RetentionEnv): boolean {
  return env.PLAN_RETENTION_ENABLED === "true";
}

/** ISO cutoff — superseded strictly before this is eligible for purge. */
export function retentionCutoffIso(nowMs: number, days: number): string {
  return new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
}
