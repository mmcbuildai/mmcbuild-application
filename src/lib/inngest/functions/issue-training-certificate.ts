import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCertificatePdf } from "@/lib/train/certificate-pdf";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { buildCertificateIssuedEmail } from "@/lib/email/templates/certificate-issued";
import { COURSE_CATEGORY_LABELS, DIFFICULTY_LABELS } from "@/lib/train/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function db() {
  return createAdminClient() as unknown as AnyDb;
}

export const issueTrainingCertificate = inngest.createFunction(
  {
    id: "issue-training-certificate",
    name: "Issue Training Certificate",
    retries: 2,
  },
  { event: "train/certificate.issue" },
  async ({ event, step }) => {
    const { enrollmentId, courseId, profileId, profileName } = event.data;

    // Generate cert number
    const certNumber = await step.run("generate-cert-number", async () => {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `MMC-TRAIN-${timestamp}-${random}`;
    });

    // Load course details
    const courseDetails = await step.run("load-course", async () => {
      const { data: course } = await db()
        .from("courses")
        .select("id, title, category, difficulty")
        .eq("id", courseId)
        .single();

      if (!course) throw new Error("Course not found");
      return course as { id: string; title: string; category: string; difficulty: string };
    });

    // Generate PDF
    const pdfBuffer = await step.run("generate-pdf", async () => {
      const buffer = generateCertificatePdf({
        recipientName: profileName,
        courseTitle: courseDetails.title,
        certNumber,
        issuedAt: new Date().toISOString(),
        courseDifficulty: DIFFICULTY_LABELS[courseDetails.difficulty] ?? courseDetails.difficulty,
        courseCategory: COURSE_CATEGORY_LABELS[courseDetails.category] ?? courseDetails.category,
      });
      // Return as base64 for serialization between steps
      return buffer.toString("base64");
    });

    // Upload to storage
    const pdfUrl = await step.run("upload-to-storage", async () => {
      const admin = createAdminClient();
      const fileName = `${certNumber}.pdf`;
      const buffer = Buffer.from(pdfBuffer, "base64");

      const { error: uploadError } = await admin.storage
        .from("training-certs")
        .upload(fileName, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.error("[Certificate] Upload failed:", uploadError);
        throw uploadError;
      }

      const { data: urlData } = admin.storage
        .from("training-certs")
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    });

    // Save certificate record
    await step.run("save-record", async () => {
      const { error } = await db()
        .from("certificates")
        .insert({
          enrollment_id: enrollmentId,
          profile_id: profileId,
          course_id: courseId,
          cert_number: certNumber,
          pdf_url: pdfUrl,
          issued_at: new Date().toISOString(),
        });

      if (error) {
        console.error("[Certificate] Failed to save record:", error);
        throw error;
      }
    });

    // Send email notification
    await step.run("send-email", async () => {
      // Get user email
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("user_id")
        .eq("id", profileId)
        .single();

      if (!profile) return;

      const { data: authData } = await admin.auth.admin.getUserById(
        (profile as { user_id: string }).user_id
      );

      if (!authData?.user?.email) return;

      const html = buildCertificateIssuedEmail({
        recipientName: profileName,
        courseTitle: courseDetails.title,
        certNumber,
        downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/train/dashboard`,
      });

      const resend = getResend();
      await resend.emails.send({
        from: FROM_EMAIL,
        to: authData.user.email,
        subject: `Certificate Issued: ${courseDetails.title} — MMC Train`,
        html,
      });
    });

    return { certNumber, pdfUrl };
  }
);
