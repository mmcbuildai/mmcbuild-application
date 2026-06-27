import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { buildEnquiryNotificationEmail } from "@/lib/email/templates/enquiry-notification";

export const sendEnquiryNotification = inngest.createFunction(
  {
    id: "send-enquiry-notification",
    name: "Send Enquiry Notification",
    retries: 3,
  },
  { event: "direct/enquiry.sent" },
  async ({ event, step }) => {
    const {
      enquiryId,
      professionalId,
      recipientEmail,
      companyName,
      senderName,
      subject,
    } = event.data;

    const admin = createAdminClient();

    const details = await step.run("load-details", async () => {
      const { data: enquiry } = await admin
        .from("directory_enquiries" as never)
        .select("*")
        .eq("id", enquiryId)
        .single();

      if (!enquiry) throw new Error(`Enquiry ${enquiryId} not found`);
      const e = enquiry as Record<string, unknown>;

      return {
        message: e.message as string,
        subject: (e.subject as string) || subject,
        recipientEmail: recipientEmail as string,
        companyName: companyName as string,
        senderName: senderName as string,
      };
    });

    await step.run("send-email", async () => {
      if (!details.recipientEmail) return;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";
      const dashboardUrl = `${appUrl}/direct/dashboard`;

      const html = buildEnquiryNotificationEmail({
        companyName: details.companyName,
        senderName: details.senderName,
        subject: details.subject,
        message: details.message,
        dashboardUrl,
      });

      await sendEmail({
        to: details.recipientEmail,
        subject: `New Enquiry: ${details.subject} — MMC Direct`,
        html,
      });
    });

    return { success: true, enquiryId };
  }
);
