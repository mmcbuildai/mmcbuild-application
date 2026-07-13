import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  retentionDays,
  retentionEnabled,
  retentionCutoffIso,
} from "@/lib/plans/retention";

/**
 * SCRUM-333 (Phase 3): purge superseded drawing versions past the retention
 * window, to control storage cost while keeping recent history.
 *
 * DESTRUCTIVE — deletes storage files and plan rows irreversibly. It is therefore
 * OFF by default: with PLAN_RETENTION_ENABLED unset it runs a DRY RUN (counts and
 * logs what it WOULD delete, deletes nothing). Set PLAN_RETENTION_ENABLED=true
 * only once the retention window is agreed and you want live deletion.
 *
 * Only superseded versions (is_current = false, superseded_at older than the
 * window) are ever eligible — the CURRENT version of every drawing slot is never
 * touched.
 */
export const purgeSupersededPlans = inngest.createFunction(
  { id: "purge-superseded-plans", name: "Purge Superseded Plan Versions" },
  { cron: "0 3 * * *" }, // daily, 03:00 UTC
  async ({ step }) => {
    const env = process.env as {
      PLAN_RETENTION_ENABLED?: string;
      PLAN_RETENTION_DAYS?: string;
    };
    const days = retentionDays(env);
    const enabled = retentionEnabled(env);
    const cutoff = retentionCutoffIso(Date.now(), days);

    const expired = await step.run("find-expired", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("plans")
        .select("id, file_path, file_name")
        .eq("is_current", false)
        .not("superseded_at", "is", null)
        .lt("superseded_at", cutoff)
        .limit(500);
      if (error) {
        console.error(`[purgeSupersededPlans] query failed: ${error.message}`);
        return [] as { id: string; file_path: string; file_name: string }[];
      }
      return (data ?? []) as {
        id: string;
        file_path: string;
        file_name: string;
      }[];
    });

    if (!enabled) {
      console.warn(
        `[purgeSupersededPlans] DRY RUN — ${expired.length} superseded plan version(s) older than ${days}d would be deleted. Set PLAN_RETENTION_ENABLED=true to enable live deletion.`,
      );
      return { dryRun: true, wouldDelete: expired.length, retentionDays: days };
    }

    const deleted = await step.run("delete-expired", async () => {
      const admin = createAdminClient();
      let count = 0;
      for (const p of expired) {
        // Mirror deleteProject's cleanup order: embeddings, storage file, then row.
        await admin
          .from("document_embeddings")
          .delete()
          .eq("source_type", "plan")
          .eq("source_id", p.id);
        if (p.file_path) {
          await admin.storage.from("plan-uploads").remove([p.file_path]);
        }
        const { error } = await admin.from("plans").delete().eq("id", p.id);
        if (!error) count++;
      }
      return count;
    });

    if (deleted > 0) {
      console.warn(
        `[purgeSupersededPlans] deleted ${deleted} superseded plan version(s) older than ${days}d`,
      );
    }
    return { dryRun: false, deleted, retentionDays: days };
  },
);
