import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Daily founder report — PDF.
 *
 * Styled to match the existing report generators (comply/report-pdf.ts,
 * quote/report-pdf.ts): same margins, same grey autoTable header fills, same
 * type scale. The one thing those don't do that this does is embed the logo —
 * none of them needed a masthead before.
 *
 * Read from public/mmcbuildlogo.png via fs, not imported as a module — this
 * runs inside an Inngest step (Node, not a React render), so it needs the
 * file's actual bytes, not a Next.js static-asset URL.
 */

export interface DailyReportData {
  dateLabel: string;
  signups: { name: string; org: string }[];
  newSubscriptions: { org: string; plan: string; status: string }[];
  cancellations: { org: string; plan: string }[];
  activeSubs: number;
  trialingSubs: number;
  mrrAud: number;
  aiSpendUsd: number;
  userActivity: {
    user: string;
    org: string;
    complianceRuns: number;
    buildRuns: number;
    quoteRuns: number;
    projectsCreated: number;
  }[];
  orgAiUsage: {
    org: string;
    calls: number;
    tokens: number;
    costByProvider: { provider: string; cost: number }[];
  }[];
  stuckUploads: { org: string; fileName: string; reason: string }[];
  pastDue: { org: string; plan: string }[];
}

const INK: [number, number, number] = [20, 24, 31];
const GREY: [number, number, number] = [100, 100, 100];
const HEAD_FILL: [number, number, number] = [30, 30, 30];

function loadLogoBase64(): string | null {
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "mmcbuildlogo.png"));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (err) {
    console.warn("[daily-report-pdf] could not load logo, continuing without it:", err);
    return null;
  }
}

export function generateDailyReportPdf(data: DailyReportData): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // --- Masthead ---
  const logo = loadLogoBase64();
  if (logo) {
    doc.addImage(logo, "PNG", margin, y, 16, 16);
  }
  const textX = logo ? margin + 22 : margin;

  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text("MMC Build — Daily Report", textX, y + 7);
  doc.setFontSize(10);
  doc.setTextColor(...GREY);
  doc.text(data.dateLabel, textX, y + 14);
  y += 24;
  doc.setDrawColor(210, 214, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  const sectionHeading = (label: string) => {
    if (y > 260) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(label, margin, y);
    y += 6;
  };

  const afterTable = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10;
  };

  const emptyNote = (text: string) => {
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(text, margin, y);
    y += 10;
  };

  // --- Since yesterday ---
  sectionHeading("Since Yesterday");
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["", "Count"]],
    body: [
      ["New signups", `${data.signups.length}`],
      ["New subscriptions", `${data.newSubscriptions.length}`],
      ["Cancellations requested", `${data.cancellations.length}`],
    ],
    headStyles: { fillColor: HEAD_FILL, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { cellWidth: 25, halign: "right" } },
  });
  afterTable();

  if (data.signups.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["New signup", "Org"]],
      body: data.signups.map((s) => [s.name, s.org]),
      headStyles: { fillColor: [70, 70, 70], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });
    afterTable();
  }
  if (data.newSubscriptions.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["New subscription — Org", "Plan", "Status"]],
      body: data.newSubscriptions.map((s) => [s.org, s.plan, s.status]),
      headStyles: { fillColor: [70, 70, 70], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });
    afterTable();
  }
  if (data.cancellations.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Cancellation requested — Org", "Plan"]],
      body: data.cancellations.map((c) => [c.org, c.plan]),
      headStyles: { fillColor: [70, 70, 70], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });
    afterTable();
  }

  // --- Snapshot ---
  sectionHeading("Snapshot");
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ["Active subscriptions", `${data.activeSubs}`],
      ["Trialing", `${data.trialingSubs}`],
      ["MRR (active only)", `$${data.mrrAud.toFixed(2)} AUD`],
      ["AI spend, last 24h", `$${data.aiSpendUsd.toFixed(4)} USD`],
    ],
    theme: "plain",
    bodyStyles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
  });
  afterTable();

  // --- Engagement: runs by user ---
  sectionHeading("Engagement — Runs by User (last 24h)");
  if (data.userActivity.length === 0) {
    emptyNote("Nobody used the product in the last 24 hours.");
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["User", "Org", "Comply", "Build", "Quote", "Projects created"]],
      body: data.userActivity.map((u) => [
        u.user,
        u.org,
        `${u.complianceRuns}`,
        `${u.buildRuns}`,
        `${u.quoteRuns}`,
        `${u.projectsCreated}`,
      ]),
      headStyles: { fillColor: HEAD_FILL, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
    });
    afterTable();
  }

  // --- AI usage by org (ai_usage_log has no per-user column, org is the
  // finest attribution the data actually supports) ---
  sectionHeading("AI Usage by Org (last 24h)");
  if (data.orgAiUsage.length === 0) {
    emptyNote("No AI calls in the last 24 hours.");
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Org", "Calls", "Tokens", "Cost (by provider)"]],
      body: data.orgAiUsage.map((o) => [
        o.org,
        `${o.calls}`,
        o.tokens.toLocaleString("en-AU"),
        o.costByProvider.map((c) => `${c.provider} $${c.cost.toFixed(4)}`).join(", "),
      ]),
      headStyles: { fillColor: HEAD_FILL, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
    afterTable();
  }

  // --- Needs attention ---
  sectionHeading("Needs Attention");
  if (data.stuckUploads.length === 0 && data.pastDue.length === 0) {
    emptyNote("Nothing outstanding.");
  } else {
    if (data.stuckUploads.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Stuck upload — Org", "File", "Reason"]],
        body: data.stuckUploads.map((s) => [s.org, s.fileName, s.reason]),
        headStyles: { fillColor: [120, 60, 20], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 2: { cellWidth: contentWidth - 90 } },
      });
      afterTable();
    }
    if (data.pastDue.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Past due — Org", "Plan"]],
        body: data.pastDue.map((p) => [p.org, p.plan]),
        headStyles: { fillColor: [120, 60, 20], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
      });
      afterTable();
    }
  }

  // Same cast every other PDF generator in this codebase uses (comply/,
  // quote/, build/'s report-pdf.ts) — jsPDF's own types declare
  // output("arraybuffer") as returning `string`, which is wrong; the actual
  // runtime value is a real ArrayBuffer, and Buffer.from() inspects the
  // runtime value (not the TS-inferred type) to wrap it correctly either way.
  const arrayBuffer = doc.output("arraybuffer") as unknown as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
