import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { buildRemediationRequestEmail } from "@/lib/email/templates/remediation-request";

export const sendRemediationEmail = inngest.createFunction(
  {
    id: "send-remediation-email",
    name: "Send Remediation Email",
    retries: 3,
  },
  { event: "finding/share.requested" },
  async ({ event, step }) => {
    const { shareTokenId, findingId, recipientEmail, recipientName } =
      event.data;

    const admin = createAdminClient();

    // Load share token + finding + project + org + sender
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

      const { data: project } = await admin
        .from("projects")
        .select("name")
        .eq("id", st.project_id as string)
        .single();

      const { data: org } = await admin
        .from("organisations")
        .select("name")
        .eq("id", st.org_id as string)
        .single();

      const { data: sender } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", st.created_by as string)
        .single();

      return {
        token: st.token as string,
        finding: {
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          ncc_citation: finding.ncc_citation,
          remediation_action: (finding as Record<string, unknown>).remediation_action as string | null,
          amended_description: (finding as Record<string, unknown>).amended_description as string | null,
          amended_action: (finding as Record<string, unknown>).amended_action as string | null,
        },
        projectName: project?.name ?? "Unknown Project",
        orgName: org?.name ?? "Unknown Organisation",
        senderName: sender?.full_name ?? "A team member",
      };
    });

    // Build and send email
    await step.run("send-email", async () => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";
      const respondUrl = `${appUrl}/respond/${details.token}`;

      const effectiveDescription =
        details.finding.amended_description ?? details.finding.description;
      const effectiveAction =
        details.finding.amended_action ?? details.finding.remediation_action;

      const html = buildRemediationRequestEmail({
        recipientName,
        projectName: details.projectName,
        findingTitle: details.finding.title,
        findingSeverity: details.finding.severity,
        findingDescription: effectiveDescription,
        nccCitation: details.finding.ncc_citation,
        remediationAction: effectiveAction,
        respondUrl,
        senderName: details.senderName,
        senderCompany: details.orgName,
      });

      const resend = getResend();
      await resend.emails.send({
        from: FROM_EMAIL,
        to: recipientEmail,
        subject: `Remediation Required: ${details.finding.title} — ${details.projectName}`,
        html,
      });
    });

    // Mark as sent
    await step.run("mark-sent", async () => {
      await admin
        .from("finding_share_tokens" as never)
        .update({ sent_at: new Date().toISOString() } as never)
        .eq("id", shareTokenId);
    });

    return { success: true, shareTokenId };
  }
);
