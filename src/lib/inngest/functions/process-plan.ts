import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestPlan } from "@/lib/comply/ingestion";

export const processPlan = inngest.createFunction(
  {
    id: "process-plan",
    name: "Process Plan Upload",
    retries: 2,
    onFailure: async ({ error, event }) => {
      const admin = createAdminClient();
      const { projectId, fileName, uploadedBy, planId } = event.data.event.data;

      // Try to find the plan and mark it as error
      if (planId) {
        await admin
          .from("plans")
          .update({
            status: "error",
          } as never)
          .eq("id", planId);
      } else if (projectId && fileName && uploadedBy) {
        const { data: plan } = await admin
          .from("plans")
          .select("id")
          .eq("project_id", projectId)
          .eq("file_name", fileName)
          .eq("created_by", uploadedBy)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (plan) {
          await admin
            .from("plans")
            .update({
              status: "error",
            } as never)
            .eq("id", plan.id);
        }
      }

      console.error(`[processPlan] Failed: ${error.message}`);
    },
  },
  { event: "plan/uploaded" },
  async ({ event, step }) => {
    const { projectId, fileName, uploadedBy, planId: eventPlanId } = event.data;

    // 1. Find the plan record
    const plan = await step.run("find-plan-record", async () => {
      const admin = createAdminClient();

      // Prefer direct ID lookup if available
      if (eventPlanId) {
        const { data, error } = await admin
          .from("plans")
          .select("id, org_id, file_path")
          .eq("id", eventPlanId)
          .single();

        if (error || !data) {
          throw new Error(`Plan record not found for ID ${eventPlanId}: ${error?.message}`);
        }
        return data as { id: string; org_id: string; file_path: string };
      }

      // Fallback to composite lookup
      const { data, error } = await admin
        .from("plans")
        .select("id, org_id, file_path")
        .eq("project_id", projectId)
        .eq("file_name", fileName)
        .eq("created_by", uploadedBy)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        throw new Error(`Plan record not found for ${fileName}: ${error?.message}`);
      }

      return data as { id: string; org_id: string; file_path: string };
    });

    // 2. Update status to processing
    await step.run("update-status-processing", async () => {
      const admin = createAdminClient();
      await admin
        .from("plans")
        .update({ status: "processing" } as never)
        .eq("id", plan.id);
    });

    // 3. Download PDF from storage
    const pdfBuffer = await step.run("download-pdf", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("plan-uploads")
        .download(plan.file_path);

      if (error || !data) {
        throw new Error(`Failed to download PDF: ${error?.message}`);
      }

      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer).toString("base64");
    });

    // 4. Parse, chunk, and embed
    const result = await step.run("ingest-plan", async () => {
      const buffer = Buffer.from(pdfBuffer, "base64");
      return await ingestPlan(plan.org_id, plan.id, buffer);
    });

    // 5. Update status to ready
    await step.run("update-status-ready", async () => {
      const admin = createAdminClient();
      await admin
        .from("plans")
        .update({
          status: "ready",
          page_count: result.pageCount,
        } as never)
        .eq("id", plan.id);
    });

    return {
      planId: plan.id,
      pageCount: result.pageCount,
      chunkCount: result.chunkCount,
    };
  }
);
