import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyCommit } from "@/lib/rd/classifier";
import { matchFiles, type FileMapping } from "@/lib/rd/mapper";
import type { RdTag } from "@/lib/supabase/types";

export const classifyRdCommit = inngest.createFunction(
  {
    id: "classify-rd-commit",
    name: "Classify R&D Commit",
    retries: 2,
  },
  { event: "rd/commit.detected" },
  async ({ event, step }) => {
    const { commitLogId, orgId } = event.data;

    // 1. Load commit log
    const commit = await step.run("load-commit", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("rd_commit_logs")
        .select("*")
        .eq("id", commitLogId)
        .single();

      if (error || !data) {
        throw new Error(`Commit log not found: ${error?.message}`);
      }

      return data;
    });

    // 2. Update status to processing
    await step.run("update-status-processing", async () => {
      const admin = createAdminClient();
      await admin
        .from("rd_commit_logs")
        .update({ status: "processing" } as never)
        .eq("id", commitLogId);
    });

    // 3. Load org config and file mappings
    const { mappings, config } = await step.run(
      "load-config-and-mappings",
      async () => {
        const admin = createAdminClient();

        const [mappingsResult, configResult] = await Promise.all([
          admin
            .from("rd_file_mappings")
            .select("pattern, stage, deliverable, rd_tag, priority")
            .eq("org_id", orgId)
            .order("priority", { ascending: false }),
          admin
            .from("rd_tracking_config")
            .select("default_hours_per_commit, auto_approve_threshold")
            .eq("org_id", orgId)
            .single(),
        ]);

        return {
          mappings: (mappingsResult.data ?? []) as FileMapping[],
          config: configResult.data as {
            default_hours_per_commit: number;
            auto_approve_threshold: number;
          },
        };
      }
    );

    // 4. Classify with AI + file mapping check
    const classification = await step.run("classify-with-ai", async () => {
      const filesChanged = commit.files_changed as
        | Array<{ path: string; action: string }>
        | null;
      const filePaths = filesChanged?.map((f) => f.path) ?? [];

      // Check file mappings first
      const mappingMatch = matchFiles(filePaths, mappings);

      // Always call AI for confidence/reasoning
      const aiResult = await classifyCommit({
        sha: commit.sha,
        message: commit.message ?? "",
        filesChanged: commit.files_changed,
        branch: commit.branch ?? "main",
        fileMappings: mappings,
      });

      // File mapping overrides AI for stage/deliverable/tag, but AI provides reasoning
      if (mappingMatch) {
        return {
          ...aiResult,
          stage: mappingMatch.stage,
          deliverable: mappingMatch.deliverable,
          rd_tag: mappingMatch.rd_tag,
        };
      }

      return aiResult;
    });

    // 5. Determine review status based on confidence threshold
    const autoApproved =
      classification.confidence >= (config?.auto_approve_threshold ?? 0.85);

    const reviewStatus = autoApproved ? "approved" : "pending";

    // 6. Insert auto entry
    const autoEntry = await step.run("insert-auto-entry", async () => {
      const admin = createAdminClient();

      const commitDate = commit.committed_at
        ? new Date(commit.committed_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const { data, error } = await admin
        .from("rd_auto_entries")
        .insert({
          org_id: orgId,
          commit_id: commitLogId,
          date: commitDate,
          hours:
            classification.estimated_hours ??
            (config?.default_hours_per_commit ?? 0.5),
          stage: classification.stage,
          deliverable: classification.deliverable,
          rd_tag: classification.rd_tag as RdTag,
          description: `[${commit.sha.slice(0, 7)}] ${commit.message?.slice(0, 200) ?? ""}`,
          ai_reasoning: classification.reasoning,
          confidence: classification.confidence,
          review_status: reviewStatus,
        } as never)
        .select("id")
        .single();

      if (error) {
        throw new Error(`Failed to insert auto entry: ${error.message}`);
      }

      return data;
    });

    // 7. Auto-promote to rd_time_entries if approved
    if (autoApproved) {
      await step.run("auto-promote", async () => {
        const admin = createAdminClient();

        const commitDate = commit.committed_at
          ? new Date(commit.committed_at).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        // Use a system profile or the first admin profile in the org
        const { data: adminProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("org_id", orgId)
          .in("role", ["owner", "admin"])
          .limit(1)
          .single();

        if (!adminProfile) return;

        await admin.from("rd_time_entries").insert({
          profile_id: adminProfile.id,
          org_id: orgId,
          date: commitDate,
          hours:
            classification.estimated_hours ??
            (config?.default_hours_per_commit ?? 0.5),
          stage: classification.stage,
          deliverable: classification.deliverable,
          rd_tag: classification.rd_tag as RdTag,
          description: `[Auto] ${commit.sha.slice(0, 7)}: ${commit.message?.slice(0, 180) ?? ""}`,
        } as never);
      });
    }

    // 8. Update commit status to classified
    await step.run("update-commit-classified", async () => {
      const admin = createAdminClient();
      await admin
        .from("rd_commit_logs")
        .update({ status: "classified" } as never)
        .eq("id", commitLogId);
    });

    return {
      commitLogId,
      autoEntryId: autoEntry?.id,
      classification: classification.rd_tag,
      confidence: classification.confidence,
      autoApproved,
    };
  }
);
