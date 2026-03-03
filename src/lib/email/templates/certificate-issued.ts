interface CertificateEmailData {
  recipientName: string;
  courseTitle: string;
  certNumber: string;
  downloadUrl: string;
}

export function buildCertificateIssuedEmail(data: CertificateEmailData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Certificate Issued — MMC Train</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:32px auto;">
    <tr>
      <td style="background:linear-gradient(135deg,#7C3AED,#6366F1);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">MMC Train</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Certificate of Completion</p>
      </td>
    </tr>
    <tr>
      <td style="background:#fff;padding:32px 24px;">
        <p style="font-size:16px;color:#1F2937;margin:0 0 16px;">
          Congratulations, <strong>${escapeHtml(data.recipientName)}</strong>!
        </p>
        <p style="font-size:14px;color:#4B5563;margin:0 0 24px;line-height:1.6;">
          You have successfully completed the course <strong>${escapeHtml(data.courseTitle)}</strong>
          and earned your certificate of completion.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;margin:0 0 24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="font-size:12px;color:#6B7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Certificate Number</p>
              <p style="font-size:16px;color:#7C3AED;font-weight:600;margin:0;font-family:monospace;">${escapeHtml(data.certNumber)}</p>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
          <tr>
            <td style="background:#7C3AED;border-radius:8px;">
              <a href="${escapeHtml(data.downloadUrl)}" style="display:inline-block;padding:12px 32px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">
                View &amp; Download Certificate
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size:12px;color:#9CA3AF;margin:0;text-align:center;line-height:1.5;">
          Your certificate PDF is available for download from your MMC Train dashboard.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background:#F9FAFB;padding:16px 24px;border-radius:0 0 12px 12px;border-top:1px solid #E5E7EB;text-align:center;">
        <p style="font-size:11px;color:#9CA3AF;margin:0;">
          MMC Build Pty Ltd | ABN 99 691 530 426 | mmcbuild.com.au
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
