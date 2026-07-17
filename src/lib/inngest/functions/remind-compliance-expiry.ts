import { inngest } from "../client";
import { db } from "@/lib/supabase/db";
import { sendEmail } from "@/lib/email/resend";
import {
  complianceDocTypeLabel,
  daysUntilExpiry,
  EXPIRY_REMINDER_DAYS,
} from "@/lib/direct/compliance-docs";

// SCRUM-175 — remind a supplier 30 days before a verified compliance document
// expires, so they can re-upload before it drops off their public listing.
// Daily cron; `reminder_sent_at` guards against double-sends.

interface ExpiringDoc {
  id: string;
  title: string;
  doc_type: string;
  expires_at: string;
  professionals: { company_name: string; email: string | null } | null;
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";

export const remindComplianceExpiry = inngest.createFunction(
  { id: "remind-compliance-expiry", name: "Remind Supplier Compliance Expiry" },
  { cron: "0 8 * * *" }, // daily, 08:00 UTC
  async ({ step }) => {
    const expiring = await step.run("find-expiring", async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const windowEnd = new Date(
        now.getTime() + EXPIRY_REMINDER_DAYS * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cdocs = db() as unknown as any;
      const { data, error } = await cdocs
        .from("supplier_compliance_documents")
        .select(
          "id, title, doc_type, expires_at, professionals!inner(company_name, email, status)",
        )
        .eq("verified", true)
        .is("reminder_sent_at", null)
        .not("expires_at", "is", null)
        .gte("expires_at", today)
        .lte("expires_at", windowEnd)
        .eq("professionals.status", "approved")
        .limit(200);

      if (error) {
        console.error(`[remindComplianceExpiry] query failed: ${error.message}`);
        return [] as ExpiringDoc[];
      }
      return (data ?? []) as ExpiringDoc[];
    });

    if (expiring.length === 0) {
      return { reminded: 0 };
    }

    const reminded = await step.run("send-reminders", async () => {
      let count = 0;
      for (const doc of expiring) {
        const email = doc.professionals?.email;
        const company = doc.professionals?.company_name ?? "there";
        const days = daysUntilExpiry(doc.expires_at) ?? 0;
        const typeLabel = complianceDocTypeLabel(doc.doc_type);

        if (!email) {
          // No contact email — mark reminded so we don't rescan it daily.
          await db()
            .from("supplier_compliance_documents")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", doc.id);
          continue;
        }

        const html =
          `<p>Hi ${company},</p>` +
          `<p>Your compliance document <strong>${doc.title}</strong> (${typeLabel}) ` +
          `expires on <strong>${doc.expires_at}</strong> — ${days} day${days === 1 ? "" : "s"} from now.</p>` +
          `<p>Once it expires it will be automatically hidden from your public MMC Direct listing and from Build suggestions. ` +
          `Please upload a renewed document to keep your listing compliant.</p>` +
          `<p><a href="${APP_URL}/direct/dashboard">Manage your compliance documents</a></p>` +
          `<p>— MMC Build</p>`;

        try {
          await sendEmail({
            to: email,
            subject: `Action needed: ${typeLabel} expires in ${days} day${days === 1 ? "" : "s"}`,
            html,
          });
          await db()
            .from("supplier_compliance_documents")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", doc.id);
          count++;
        } catch (err) {
          console.error(
            `[remindComplianceExpiry] send failed for doc ${doc.id}:`,
            err instanceof Error ? err.message : String(err),
          );
          // Leave reminder_sent_at null so it retries tomorrow.
        }
      }
      return count;
    });

    return { reminded };
  },
);
