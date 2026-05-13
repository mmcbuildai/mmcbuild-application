import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import type { LeadInput } from "@/lib/validators/lead";

export type LeadEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function notifyKarenOfNewLead(lead: LeadInput): Promise<LeadEmailResult> {
  const to = process.env.KAREN_EMAIL || "karen.engel@mmcbuild.com.au";

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  const phoneDisplay = lead.phone
    ? `${lead.phoneCountry || ""} ${lead.phone}`.trim()
    : "—";

  const subject = `New ${lead.formType} lead — ${fullName || lead.email}`;
  const text = [
    `New ${lead.formType} submission received:`,
    "",
    `Name:    ${fullName || "—"}`,
    `Email:   ${lead.email}`,
    `Phone:   ${phoneDisplay}`,
    `Company: ${lead.company || "—"}`,
    `Role:    ${lead.role || "—"}`,
    lead.interest ? `Interest: ${lead.interest}` : "",
    lead.sourcePage ? `Source:   ${lead.sourcePage}` : "",
    "",
    "Message:",
    lead.message || "(no message)",
    "",
    "— mmcbuild.com.au",
  ]
    .filter((line) => line !== "")
    .join("\n");

  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      text,
    });
    if (error) {
      return { ok: false, error: error.message || "Resend error" };
    }
    return { ok: true, id: data?.id || "" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown Resend error",
    };
  }
}
