interface RegistrationReceivedData {
  contactName: string;
  companyName: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Owner-facing confirmation sent to a business when it registers in the MMC
 * Direct directory (SCRUM-247). Goes to the registrant's email, from MMC Build,
 * signed by Karen Van Den Engel — so the person Karen invites actually hears
 * back, instead of only Karen getting the internal notification.
 */
export function buildRegistrationReceivedEmail(
  data: RegistrationReceivedData,
): string {
  const name = escapeHtml(data.contactName || "there");
  const company = escapeHtml(data.companyName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your MMC Direct registration — MMC Build</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#0F766E;padding:24px 32px;">
            <h1 style="margin:0;color:#FFFFFF;font-size:20px;font-weight:600;">MMC Build</h1>
            <p style="margin:4px 0 0;color:#5EEAD4;font-size:13px;">MMC Direct — trade directory</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#374151;font-size:15px;line-height:1.6;">
            <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">We've received your registration</h2>
            <p style="margin:0 0 16px;">Hi ${name},</p>
            <p style="margin:0 0 16px;">
              Thanks for registering <strong>${company}</strong> in the MMC Build
              trade directory (MMC Direct). We've received your details and your
              listing is now being reviewed.
            </p>
            <p style="margin:0 0 16px;">
              We'll be in touch as soon as it's approved and live. If anything's
              needed from you in the meantime, we'll let you know.
            </p>
            <p style="margin:28px 0 4px;color:#374151;font-size:15px;">Kind regards,</p>
            <p style="margin:0;color:#111827;font-size:15px;font-weight:600;">Karen Van Den Engel</p>
            <p style="margin:0;color:#6B7280;font-size:13px;">Director — MMC Build</p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;color:#9CA3AF;font-size:12px;">
              Questions? Contact us at
              <a href="mailto:info@mmcbuild.com.au" style="color:#0F766E;">info@mmcbuild.com.au</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
