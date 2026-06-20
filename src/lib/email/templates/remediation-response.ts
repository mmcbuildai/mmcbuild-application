interface RemediationResponseEmailData {
  recipientName: string;
  projectName: string;
  findingTitle: string;
  findingSeverity: string;
  newStatus: string;
  responseNotes: string | null;
  respondentEmail: string;
  findingUrl: string;
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

const STATUS_LABELS: Record<string, string> = {
  awaiting: "Awaiting",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  completed: "Completed",
  disputed: "Disputed",
};

// Keep the notes snippet short in the email; the full reply lives in-app.
// Exported + pure so it can be unit-tested independently of the HTML build.
export function truncateNotes(
  notes: string | null,
  maxLength = 280
): string | null {
  if (!notes) return null;
  return notes.length > maxLength ? `${notes.slice(0, maxLength)}…` : notes;
}

export function buildRemediationResponseEmail(
  data: RemediationResponseEmailData
): string {
  const severity =
    SEVERITY_COLORS[data.findingSeverity] ?? SEVERITY_COLORS.advisory;
  const severityLabel =
    SEVERITY_LABELS[data.findingSeverity] ?? data.findingSeverity;
  const statusLabel = STATUS_LABELS[data.newStatus] ?? data.newStatus;

  const notesSnippet = truncateNotes(data.responseNotes);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Remediation Response — MMC Build</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#1E293B;padding:24px 32px;">
            <h1 style="margin:0;color:#FFFFFF;font-size:20px;font-weight:600;">MMC Build</h1>
            <p style="margin:4px 0 0;color:#94A3B8;font-size:13px;">Compliance Remediation Response</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;">
              Hi ${escapeHtml(data.recipientName)},
            </p>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;">
              <strong>${escapeHtml(data.respondentEmail)}</strong> responded to a compliance finding on
              <strong>${escapeHtml(data.projectName)}</strong>.
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
                  <p style="margin:0 0 12px;font-size:13px;color:#6B7280;">
                    <strong>New status:</strong>
                    <span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:600;background:#EDE9FE;color:#5B21B6;">${escapeHtml(statusLabel)}</span>
                  </p>
                  ${notesSnippet ? `
                  <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:6px;padding:12px 16px;margin-top:8px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#5B21B6;">Their notes</p>
                    <p style="margin:0;font-size:14px;color:#4C1D95;line-height:1.5;">${escapeHtml(notesSnippet)}</p>
                  </div>` : ""}
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 24px;">
                  <a href="${escapeHtml(data.findingUrl)}"
                     style="display:inline-block;padding:14px 32px;background:#2563EB;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                    View Response in MMC Build
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#9CA3AF;font-size:13px;text-align:center;">
              Open the finding to read the full reply and download any attachment.
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
