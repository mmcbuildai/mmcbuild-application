import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Daily founder report — PDF.
 *
 * Styled to match the existing report generators (comply/report-pdf.ts,
 * quote/report-pdf.ts): same margins, same grey autoTable header fills, same
 * type scale, same "Page X of Y" footer.
 *
 * FOUR SECTIONS, IN THIS ORDER, PER AN EXPLICIT SPEC FROM THE REPORT'S
 * ACTUAL READER (not a guess at what a founder report "should" have):
 *   1. Summary — signups/subscriptions/cancellations counts, product runs by
 *      module + total, AI cost by module + total.
 *   2. Detail — each signup/subscription/cancellation from the last 24h,
 *      individually.
 *   3. Engagement — each real user's run count per product, last 24h AND
 *      last 7 days side by side (not just 24h — a low-volume beta product
 *      can go a whole day at 0 and still be perfectly healthy).
 *   4. Needs Attention — stuck uploads and past-due accounts.
 * An earlier version of this report also had a TL;DR banner, an all-time
 * lifetime-totals block, 7-day trend arrows on every daily figure, an
 * MRR/active/trialing snapshot, and an AI-usage-by-org table. All dropped
 * here — not because they were wrong, but because the person who reads this
 * every night asked for exactly the four sections above and nothing else.
 *
 * "AI COST BY PRODUCT" IS HONEST ABOUT WHAT THE DATA SUPPORTS. Only Comply
 * calls carry a `check_id` linking an AI call back to the specific run that
 * triggered it — Build and Quote don't (yet). Cost is grouped by the
 * `ai_function` tag instead: compliance_primary/compliance_validator →
 * Comply, design_primary → Build, cost_primary → Quote, everything else
 * (embeddings, plan classification, R&D classification, assistant chat, …)
 * → "Other". Build/Quote will show $0 until those code paths start tagging
 * their AI calls with the module-specific function names — that's a true
 * $0, not a bug, and the Other bucket exists so the total still reconciles.
 */

export interface DailyReportData {
  dateLabel: string;
  generatedAtLabel: string;

  signupsCount: number;
  newSubscriptionsCount: number;
  cancellationsCount: number;
  runsByProduct: { compliance: number; build: number; quote: number };
  aiCostByProduct: { compliance: number; build: number; quote: number; other: number };

  signupsCount7d: number;
  newSubscriptionsCount7d: number;
  cancellationsCount7d: number;
  runsByProduct7d: { compliance: number; build: number; quote: number };
  aiCostByProduct7d: { compliance: number; build: number; quote: number; other: number };

  signups: { name: string; org: string }[];
  newSubscriptions: { org: string; plan: string; status: string }[];
  cancellations: { org: string; plan: string }[];

  userActivity: {
    user: string;
    org: string;
    last24h: { complianceRuns: number; buildRuns: number; quoteRuns: number; plansUploaded: number; projectsCreated: number };
    last7d: { complianceRuns: number; buildRuns: number; quoteRuns: number; plansUploaded: number; projectsCreated: number };
  }[];

  stuckUploads: { org: string; fileName: string; reason: string; status: string; nextSteps: string }[];
  pastDue: { org: string; plan: string }[];
}

const INK: [number, number, number] = [20, 24, 31];
const GREY: [number, number, number] = [100, 100, 100];
const HEAD_FILL: [number, number, number] = [30, 30, 30];
const PAST_DUE_RED: [number, number, number] = [163, 38, 38];
const STUCK_AMBER: [number, number, number] = [150, 96, 20];

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

  // --- 1. Summary ---
  sectionHeading("Summary");
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["", "Last 24h", "Last 7d"]],
    body: [
      ["New signups", `${data.signupsCount}`, `${data.signupsCount7d}`],
      ["New subscriptions", `${data.newSubscriptionsCount}`, `${data.newSubscriptionsCount7d}`],
      ["Cancellation requests", `${data.cancellationsCount}`, `${data.cancellationsCount7d}`],
    ],
    headStyles: { fillColor: HEAD_FILL, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { cellWidth: 26, halign: "right" }, 2: { cellWidth: 26, halign: "right" } },
  });
  afterTable();

  const totalRuns = data.runsByProduct.compliance + data.runsByProduct.build + data.runsByProduct.quote;
  const totalAiCost =
    data.aiCostByProduct.compliance + data.aiCostByProduct.build + data.aiCostByProduct.quote + data.aiCostByProduct.other;
  const totalRuns7d = data.runsByProduct7d.compliance + data.runsByProduct7d.build + data.runsByProduct7d.quote;
  const totalAiCost7d =
    data.aiCostByProduct7d.compliance +
    data.aiCostByProduct7d.build +
    data.aiCostByProduct7d.quote +
    data.aiCostByProduct7d.other;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Product", "Runs 24h", "Runs 7d", "AI cost 24h", "AI cost 7d"]],
    body: [
      [
        "Comply",
        `${data.runsByProduct.compliance}`,
        `${data.runsByProduct7d.compliance}`,
        `$${data.aiCostByProduct.compliance.toFixed(2)}`,
        `$${data.aiCostByProduct7d.compliance.toFixed(2)}`,
      ],
      [
        "Build",
        `${data.runsByProduct.build}`,
        `${data.runsByProduct7d.build}`,
        `$${data.aiCostByProduct.build.toFixed(2)}`,
        `$${data.aiCostByProduct7d.build.toFixed(2)}`,
      ],
      [
        "Quote",
        `${data.runsByProduct.quote}`,
        `${data.runsByProduct7d.quote}`,
        `$${data.aiCostByProduct.quote.toFixed(2)}`,
        `$${data.aiCostByProduct7d.quote.toFixed(2)}`,
      ],
      [
        "Other (plan processing, R&D, shared AI)",
        "—",
        "—",
        `$${data.aiCostByProduct.other.toFixed(2)}`,
        `$${data.aiCostByProduct7d.other.toFixed(2)}`,
      ],
      [
        "Total",
        `${totalRuns}`,
        `${totalRuns7d}`,
        `$${totalAiCost.toFixed(2)}`,
        `$${totalAiCost7d.toFixed(2)}`,
      ],
    ],
    headStyles: { fillColor: HEAD_FILL, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      1: { cellWidth: 19, halign: "right" },
      2: { cellWidth: 19, halign: "right" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === 4 && hookData.section === "body") {
        hookData.cell.styles.fontStyle = "bold";
      }
    },
  });
  afterTable();

  // --- 2. Detail: each signup / subscription / cancellation, last 24h ---
  sectionHeading("Detail — Last 24h");
  if (data.signups.length === 0 && data.newSubscriptions.length === 0 && data.cancellations.length === 0) {
    emptyNote("No signups, subscriptions, or cancellations in the last 24 hours.");
  } else {
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
  }

  // --- 3. Engagement: real users only, runs per product, 24h and 7d ---
  sectionHeading("Engagement — Real Users");
  if (data.userActivity.length === 0) {
    emptyNote("No real (non-test) user ran anything or uploaded a plan in the last 7 days.");
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["User", "Org", "Comply (24h / 7d)", "Build (24h / 7d)", "Quote (24h / 7d)"]],
      body: data.userActivity.map((u) => [
        u.user,
        u.org,
        `${u.last24h.complianceRuns} / ${u.last7d.complianceRuns}`,
        `${u.last24h.buildRuns} / ${u.last7d.buildRuns}`,
        `${u.last24h.quoteRuns} / ${u.last7d.quoteRuns}`,
      ]),
      headStyles: { fillColor: HEAD_FILL, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });
    afterTable();

    // Separate table for plans/projects — not "runs" in the Comply/Build/
    // Quote sense, but activity that otherwise disappears entirely for a
    // user whose only engagement is uploading, not running.
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["User", "Org", "Plans uploaded (24h / 7d)", "Projects created (24h / 7d)"]],
      body: data.userActivity.map((u) => [
        u.user,
        u.org,
        `${u.last24h.plansUploaded} / ${u.last7d.plansUploaded}`,
        `${u.last24h.projectsCreated} / ${u.last7d.projectsCreated}`,
      ]),
      headStyles: { fillColor: [70, 70, 70], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });
    afterTable();
  }

  // --- 4. Needs Attention ---
  sectionHeading("Needs Attention");
  if (data.stuckUploads.length === 0 && data.pastDue.length === 0) {
    emptyNote("Nothing outstanding.");
  } else {
    if (data.pastDue.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Past due — Org", "Plan"]],
        body: data.pastDue.map((p) => [p.org, p.plan]),
        headStyles: { fillColor: PAST_DUE_RED, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
      });
      afterTable();
    }
    if (data.stuckUploads.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Stuck upload — Org", "File", "Reason", "Latest status", "Next steps"]],
        body: data.stuckUploads.map((s) => [s.org, s.fileName, s.reason, s.status, s.nextSteps]),
        headStyles: { fillColor: STUCK_AMBER, fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 25 },
          3: { cellWidth: 22 },
        },
      });
      afterTable();
    }
  }

  // --- Footer on all pages — same pattern as comply/build/quote reports ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 10, {
      align: "right",
    });
    doc.text(
      `MMC Build — mmcbuild.com.au · Generated ${data.generatedAtLabel}`,
      margin,
      doc.internal.pageSize.getHeight() - 10,
    );
  }

  // Same cast every other PDF generator in this codebase uses (comply/,
  // quote/, build/'s report-pdf.ts) — jsPDF's own types declare
  // output("arraybuffer") as returning `string`, which is wrong; the actual
  // runtime value is a real ArrayBuffer, and Buffer.from() inspects the
  // runtime value (not the TS-inferred type) to wrap it correctly either way.
  const arrayBuffer = doc.output("arraybuffer") as unknown as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
