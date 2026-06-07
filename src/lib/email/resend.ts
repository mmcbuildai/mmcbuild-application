import { Resend } from "resend";

let resendInstance: Resend | null = null;

export function getResend(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

// Default sender must be on a domain VERIFIED in the Resend account that owns
// RESEND_API_KEY. The live `mmcbuild` Resend account verifies the `app.` subdomain
// only — the bare apex (`mmcbuild.com.au`) is NOT verified, so sending from it is
// silently rejected by Resend. Keep this default aligned with the Supabase Auth
// SMTP sender (`noreply@app.mmcbuild.com.au`). See memory: project_auth_email_smtp_500.
export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "MMC Build <noreply@app.mmcbuild.com.au>";
