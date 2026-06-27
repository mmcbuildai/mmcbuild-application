import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { buildReviewNotificationEmail } from "@/lib/email/templates/review-notification";

export const sendReviewNotification = inngest.createFunction(
  {
    id: "send-review-notification",
    name: "Send Review Notification",
    retries: 3,
  },
  { event: "direct/review.submitted" },
  async ({ event, step }) => {
    const { professionalId, reviewerName, rating, companyName } = event.data;

    const admin = createAdminClient();

    const details = await step.run("load-details", async () => {
      const { data: pro } = await admin
        .from("professionals" as never)
        .select("*")
        .eq("id", professionalId)
        .single();

      if (!pro) throw new Error(`Professional ${professionalId} not found`);
      const p = pro as Record<string, unknown>;

      return {
        email: p.email as string | null,
        companyName: (p.company_name as string) || companyName,
      };
    });

    await step.run("send-email", async () => {
      if (!details.email) return;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";
      const dashboardUrl = `${appUrl}/direct/dashboard`;

      const html = buildReviewNotificationEmail({
        companyName: details.companyName,
        reviewerName,
        rating,
        dashboardUrl,
      });

      await sendEmail({
        to: details.email,
        subject: `New ${rating}-Star Review — MMC Direct`,
        html,
      });
    });

    return { success: true, professionalId };
  }
);
