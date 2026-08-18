import { getResend, FROM_EMAIL } from "@/lib/email/resend";

export type NotifyResult = { ok: true; id: string } | { ok: false; error: string };

interface NewUserNotification {
  email: string;
  fullName: string;
  orgName: string | null;
  /** Matches ProvisionResult["outcome"] restricted to the two "brand new profile" cases. */
  outcome: "self_signup" | "invited";
}

/**
 * Best-effort internal alert on every NEW profile provisioned (self-signup or
 * accepted invite) — never thrown, so a Resend hiccup can't break provisioning.
 * Mirrors notifyKarenOfNewLead / the beta-feedback KARTHIK_EMAIL pattern.
 */
export async function notifyKarthikOfNewUser(
  input: NewUserNotification,
): Promise<NotifyResult> {
  const to = process.env.KARTHIK_EMAIL || "karthik.rao@mmcbuild.com.au";
  const kind = input.outcome === "invited" ? "accepted an invite" : "signed up";

  const subject = `New user ${kind} — ${input.fullName || input.email}`;
  const text = [
    `A user just ${kind} on MMC Build:`,
    "",
    `Name:  ${input.fullName || "—"}`,
    `Email: ${input.email}`,
    `Org:   ${input.orgName || "—"}`,
    "",
    "— app.mmcbuild.com.au",
  ].join("\n");

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
