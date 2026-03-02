interface RemediationEmailData {
  recipientName: string;
  projectName: string;
  findingTitle: string;
  findingSeverity: string;
  findingDescription: string;
  nccCitation: string | null;
  remediationAction: string | null;
  respondUrl: string;
  senderName: string;
  senderCompany: string;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: "#FEE2E2", text: "#991B1B" },
  non_compliant: { bg: "#FEF3C7", text: "#92400E" },
  advisory: { bg: "#DBEAFE", text: "#1E40AF" },
  compliant: { bg: "#D1FAE5", text: "#065F46" },
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  non_compliant: "Non-Compliant",
  advisory: "Advisory",
  compliant: "Compliant",
};

export function buildRemediationRequestEmail(data: RemediationEmailData): string {
  const severity = SEVERITY_COLORS[data.findingSeverity] ?? SEVERITY_COLORS.advisory;
  const severityLabel = SEVERITY_LABELS[data.findingSeverity] ?? data.findingSeverity;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Remediation Request — MMC Build</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#1E293B;padding:24px 32px;">
            <h1 style="margin:0;color:#FFFFFF;font-size:20px;font-weight:600;">MMC Build</h1>
            <p style="margin:4px 0 0;color:#94A3B8;font-size:13px;">Compliance Remediation Request</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;">
              Hi ${escapeHtml(data.recipientName)},
            </p>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;">
              <strong>${escapeHtml(data.senderName)}</strong> from <strong>${escapeHtml(data.senderCompany)}</strong> has
              flagged a compliance finding on <strong>${escapeHtml(data.projectName)}</strong> that requires your attention.
            </p>

            <!-- Finding card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #E5E7EB;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <h2 style="margin:0;font-size:16px;color:#111827;">${escapeHtml(data.findingTitle)}</h2>
                      </td>
                      <td align="right">
                        <span style="display:inline-block;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;background:${severity.bg};color:${severity.text};">
                          ${severityLabel}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 12px;color:#4B5563;font-size:14px;line-height:1.5;">
                    ${escapeHtml(data.findingDescription)}
                  </p>
                  ${data.nccCitation ? `
                  <p style="margin:0 0 12px;font-size:12px;color:#6B7280;">
                    <strong>NCC Reference:</strong> ${escapeHtml(data.nccCitation)}
                  </p>` : ""}
                  ${data.remediationAction ? `
                  <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:12px 16px;margin-top:12px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#1E40AF;">Required Action</p>
                    <p style="margin:0;font-size:14px;color:#1E3A5F;line-height:1.5;">${escapeHtml(data.remediationAction)}</p>
                  </div>` : ""}
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 24px;">
                  <a href="${escapeHtml(data.respondUrl)}"
                     style="display:inline-block;padding:14px 32px;background:#2563EB;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                    Respond to Finding
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#9CA3AF;font-size:13px;text-align:center;">
              This link expires in 30 days. No login required.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;color:#9CA3AF;font-size:12px;text-align:center;">
              Sent via MMC Build Compliance Platform
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
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
