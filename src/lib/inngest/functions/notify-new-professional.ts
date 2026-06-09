import { inngest } from "../client";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { buildRegistrationReceivedEmail } from "@/lib/email/templates/registration-received";

export const notifyNewProfessional = inngest.createFunction(
  {
    id: "notify-new-professional",
    name: "MMC Direct registration — confirm owner + notify Karen",
    retries: 2,
  },
  { event: "direct/professional.registered" },
  async ({ event }) => {
    const resend = getResend();

    const {
      companyName,
      tradeType,
      contactName,
      contactEmail,
      regions,
      specialisations,
    } = event.data;

    const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://mmcbuild.com.au"}/admin/directory`;

    const html = `
      <h2>New MMC Direct Business Registration</h2>
      
      <p><strong>Company:</strong> ${companyName}</p>
      <p><strong>Trade Type:</strong> ${tradeType}</p>
      <p><strong>Contact:</strong> ${contactName} (${contactEmail})</p>
      <p><strong>Regions:</strong> ${regions?.join(", ") || "Not specified"}</p>
      <p><strong>Specialisations:</strong> ${specialisations?.join(", ") || "None"}</p>
      
      <p style="margin-top: 20px;">
        <a href="${approvalUrl}" style="background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Review & Approve
        </a>
      </p>
      
      <p style="margin-top: 20px; color: #666; font-size: 12px;">
        Or go directly to: ${approvalUrl}
      </p>
    `;

    // 1. Owner-facing confirmation (SCRUM-247) — the person Karen invited gets
    //    a branded "we've received your registration" email, not just Karen.
    //    This is the one Karen relies on, so a failure throws → Inngest retries.
    let ownerEmailId: string | undefined;
    if (contactEmail) {
      const ownerResult = await resend.emails.send({
        from: FROM_EMAIL,
        to: [contactEmail],
        subject: "We've received your MMC Direct registration",
        html: buildRegistrationReceivedEmail({ contactName, companyName }),
      });
      if (ownerResult.error) {
        console.error(
          "[notify-new-professional] owner confirmation failed:",
          ownerResult.error,
        );
        throw new Error(
          `Owner confirmation email failed: ${ownerResult.error.message}`,
        );
      }
      ownerEmailId = ownerResult.data?.id;
    } else {
      console.warn(
        "[notify-new-professional] no contactEmail on event — skipped owner confirmation",
      );
    }

    // 2. Internal approval notification to Karen. Best-effort: log on failure
    //    but don't throw, so a Karen-side hiccup can't trigger a retry that
    //    re-sends the owner a duplicate confirmation.
    const to = process.env.KAREN_EMAIL || "karen.engel@mmcbuild.com.au";
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `New Business Registration: ${companyName} - Approval Needed`,
      html,
    });
    if (result.error) {
      console.error(
        "[notify-new-professional] Karen notification failed:",
        result.error,
      );
    }

    return {
      success: true,
      ownerEmailId,
      karenEmailId: result.data?.id,
    };
  }
);
