import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { buildRemediationResponseEmail } from "@/lib/email/templates/remediation-response";

// Notifies the builder (the team member who shared the finding) when an external
// contributor responds. Best-effort: a notification failure must never surface to
// the contributor or block their submission — `onFailure` logs and swallows.
export const notifyRemediationResponse = inngest.createFunction(
  {
    id: "notify-remediation-response",
    name: "Notify Builder of Remediation Response",
    retries: 1,
    onFailure: async ({ error, event }) => {
      // Best-effort: log and move on. Never throw from the failure handler.
      try {
        console.error(
          "notify-remediation-response failed (best-effort):",
          error?.message,
          { shareTokenId: event?.data?.event?.data?.shareTokenId }
        );
      } catch {
        // Never throw from onFailure.
      }
    },
  },
  { event: "finding/remediation.responded" },
  async ({ event, step }) => {
    const { shareTokenId, findingId, status } = event.data;

    const admin = createAdminClient();

    const details = await step.run("load-details", async () => {
      const { data: shareToken } = await admin
        .from("finding_share_tokens" as never)
        .select("*")
        .eq("id", shareTokenId)
        .single();

      if (!shareToken) throw new Error(`Share token ${shareTokenId} not found`);
      const st = shareToken as Record<string, unknown>;

      const { data: finding } = await admin
        .from("compliance_findings")
        .select("*")
        .eq("id", findingId)
        .single();

      if (!finding) throw new Error(`Finding ${findingId} not found`);
      const f = finding as Record<string, unknown>;

      const { data: project } = await admin
        .from("projects")
        .select("id, name, created_by")
        .eq("id", st.project_id as string)
        .single();

      // The builder to notify = whoever shared the finding; fall back to the
      // project owner if that profile is missing.
      const { data: sharer } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", st.created_by as string)
        .single();

      let recipientEmail = (sharer as { email?: string } | null)?.email ?? null;
      let recipientName =
        (sharer as { full_name?: string } | null)?.full_name ?? "there";

      if (!recipientEmail && project?.created_by) {
        const { data: owner } = await admin
          .from("profiles")
          .select("email, full_name")
          .eq("id", project.created_by as string)
          .single();
        recipientEmail = (owner as { email?: string } | null)?.email ?? null;
        recipientName =
          (owner as { full_name?: string } | null)?.full_name ?? recipientName;
      }

      return {
        recipientEmail,
        recipientName,
        projectId: (project?.id as string) ?? (st.project_id as string),
        projectName: project?.name ?? "your project",
        findingTitle: (f.title as string) ?? "Compliance finding",
        findingSeverity: (f.severity as string) ?? "advisory",
        responseNotes: (st.response_notes as string | null) ?? null,
        respondentEmail: (st.email_to as string) ?? "An external contributor",
      };
    });

    if (!details.recipientEmail) {
      return { skipped: true, reason: "no recipient email resolved" };
    }

    await step.run("send-email", async () => {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";
      // Link to the project's comply page where the finding + response surface.
      const findingUrl = `${appUrl}/comply/${details.projectId}`;

      const html = buildRemediationResponseEmail({
        recipientName: details.recipientName,
        projectName: details.projectName,
        findingTitle: details.findingTitle,
        findingSeverity: details.findingSeverity,
        newStatus: status,
        responseNotes: details.responseNotes,
        respondentEmail: details.respondentEmail,
        findingUrl,
      });

      const resend = getResend();
      await resend.emails.send({
        from: FROM_EMAIL,
        to: details.recipientEmail as string,
        subject: `Response received: ${details.findingTitle} — ${details.projectName}`,
        html,
      });
    });

    return { success: true, shareTokenId };
  }
);
