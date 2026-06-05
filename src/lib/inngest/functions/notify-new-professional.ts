import { inngest } from "../client";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";

export const notifyNewProfessional = inngest.createFunction(
  {
    id: "notify-new-professional",
    name: "Notify Karen of New MMC Direct Registration",
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

    const to = process.env.KAREN_EMAIL || "karen.engel@mmcbuild.com.au";

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `New Business Registration: ${companyName} - Approval Needed`,
      html,
    });

    if (result.error) {
      console.error("[notify-new-professional] Failed to send email:", result.error);
      throw new Error(`Failed to send email: ${result.error.message}`);
    }

    return { success: true, emailId: result.data?.id };
  }
);
