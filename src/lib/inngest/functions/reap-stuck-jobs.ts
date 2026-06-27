import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/supabase/db";

/**
 * Reaper — the backstop for AI jobs that never finish.
 *
 * Inngest's per-function `onFailure` only fires when a run reaches a TERMINAL
 * failure after its retries. It CANNOT catch a job that is lost entirely —
 * platform-killed mid-step, dropped before ack, or hung past the invocation
 * limit. Those leave the run-table row frozen at "processing" forever, so the
 * UI poller spins with no error (Karen's 9-minute Comply spinner, 2026-06-20;
 * a Build check sat "processing" for 26h with no completion).
 *
 * This cron sweeps every AI run table on a fixed interval and flips any row
 * that started but never completed within the stale window to "error", with an
 * honest summary the user sees. It is enum-safe across the three tables (all
 * use queued/processing/completed/error) and idempotent (only touches rows that
 * are still open AND older than the window).
 *
 * Threshold must exceed the slowest legitimate run: Comply's worst case is the
 * 300s function timeout x (1 + retries) ≈ 10 min, so 15 min leaves margin.
 */
const STALE_MINUTES = 15;

const RUN_TABLES = ["compliance_checks", "design_checks", "cost_estimates"] as const;

export const reapStuckJobs = inngest.createFunction(
  { id: "reap-stuck-jobs", name: "Reap Stuck Jobs" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
    const reaped: Record<string, number> = {};

    for (const table of RUN_TABLES) {
      reaped[table] = await step.run(`reap-${table}`, async () => {
        const admin = createAdminClient();
        const { data, error } = await admin
          .from(table)
          .update({
            status: "error",
            summary:
              "Timed out — the job did not complete (no worker result). Please re-run.",
            completed_at: new Date().toISOString(),
          } as never)
          .is("completed_at", null)
          .in("status", ["queued", "processing"])
          .lt("created_at", cutoff)
          .select("id");

        if (error) {
          console.error(`[reapStuckJobs] ${table} sweep failed: ${error.message}`);
          return 0;
        }
        return (data ?? []).length;
      });
    }

    // test_3d_jobs (the Build 3D preview) uses different columns than the three
    // RUN_TABLES — `finished_at` not `completed_at`, an `error` text column not
    // `summary`, and status enum done/error/queued/processing — so it gets its
    // own sweep. Build previews were leaving ghosts stuck at "processing" for
    // weeks (4 found 2026-06-27) because the client poll only times out the UI,
    // never the DB row.
    reaped["test_3d_jobs"] = await step.run("reap-test_3d_jobs", async () => {
      // test_3d_jobs isn't in the generated Supabase types — address it via the
      // loose db() helper (cast to any), the same way build/actions.ts does.
      const { data, error } = await db()
        .from("test_3d_jobs")
        .update({
          status: "error",
          error:
            "Timed out — the job did not complete (no worker result). Please re-run.",
          finished_at: new Date().toISOString(),
        } as never)
        .is("finished_at", null)
        .in("status", ["queued", "processing"])
        .lt("created_at", cutoff)
        .select("id");

      if (error) {
        console.error(`[reapStuckJobs] test_3d_jobs sweep failed: ${error.message}`);
        return 0;
      }
      return (data ?? []).length;
    });

    const total = Object.values(reaped).reduce((a, b) => a + b, 0);
    if (total > 0) {
      console.warn(`[reapStuckJobs] reaped ${total} stuck job(s):`, reaped);
    }
    return { reaped, total, staleMinutes: STALE_MINUTES };
  }
);
