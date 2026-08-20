import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Daily founder report — PDF.
 *
 * Styled to match the existing report generators (comply/report-pdf.ts,
 * quote/report-pdf.ts): same margins, same grey autoTable header fills, same
 * type scale, same "Page X of Y" footer. The masthead logo and the TL;DR /
 * severity-colour treatment below are the only things those don't already do
 * — none of them needed a summary banner or a multi-tier alert colour before.
 *
 * SECTION ORDER IS DELIBERATE. Needs Attention comes right after the
 * headline summary — before Since Yesterday / Snapshot / Engagement — because
 * it's the only section that ever asks someone to DO something. A founder
 * skimming an email attachment should not have to reach page 2 to find out an
 * account is past due.
 *
 * EVERY DAILY NUMBER CARRIES A 7-DAY-AVERAGE COMPARISON. A bare "0 signups
 * today" is unreadable on its own — is that a bad day or a normal Tuesday?
 * `trend7dAvg` (computed in daily-founder-report.ts from the trailing 7 days,
 * excluding today) gives every daily figure a baseline, with a plain "^"/"v"
 * suffix when today is >=25% away from that average. No colour is used for
 * this — see the note below. (Plain ASCII, not a real ▲/▼ glyph: jsPDF's
 * default Helvetica uses WinAnsiEncoding, which doesn't include the Unicode
 * triangle characters — they rendered as garbage bytes when tried.)
 *
 * COLOUR STAYS MONOCHROME EXCEPT FOR THE TWO ALERT TIERS. Every report PDF in
 * this codebase (comply/, build/, quote/) is grey/black only — no report uses
 * a "brand" accent colour anywhere. Introducing one here for a headline KPI
 * would be the only splash of brand colour in the whole reporting system,
 * which reads as inconsistent rather than distinctive. Visual priority for
 * the TL;DR instead comes from a shaded banner + bold text (weight/space, not
 * hue). The one deliberate exception is Needs Attention, which already used a
 * single muted brown for both severities — split here into a firmer red for
 * past-due (revenue risk, the more urgent of the two) and the original amber
 * for stuck uploads (a product issue, not a money-today issue), so the two
 * are visually distinguishable at a glance without leaving the report's
 * existing muted palette.
 */

export interface DailyReportData {
  dateLabel: string;
  generatedAtLabel: string;
  signups: { name: string; org: string }[];
  newSubscriptions: { org: string; plan: string; status: string }[];
  cancellations: { org: string; plan: string }[];
  activeSubs: number;
  trialingSubs: number;
  mrrAud: number;
  aiSpendUsd: number;
  totalRunsToday: number;
  trend7dAvg: {
    signups: number;
    newSubscriptions: number;
    cancellations: number;
    totalRuns: number;
    aiSpendUsd: number;
  };
  lifetime: {
    complianceRuns: number;
    buildRuns: number;
    quoteRuns: number;
    plansUploaded: number;
    projectsCreated: number;
    totalUsers: number;
    totalOrgs: number;
    aiCalls: number;
    aiSpendUsd: number;
  };
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
const PAST_DUE_RED: [number, number, number] = [163, 38, 38];
const STUCK_AMBER: [number, number, number] = [150, 96, 20];
const BANNER_FILL: [number, number, number] = [242, 243, 245];

function loadLogoBase64(): string | null {
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "mmcbuildlogo.png"));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (err) {
    console.warn("[daily-report-pdf] could not load logo, continuing without it:", err);
    return null;
  }
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "^"/"v" when today is >=25% away from the 7-day average; blank when it's in line with it. */
function trendSuffix(today: number, avg: number): string {
  if (avg <= 0) return today > 0 ? " ^" : "";
  const ratio = today / avg;
  if (ratio >= 1.25) return " ^";
  if (ratio <= 0.75) return " v";
  return "";
}

function buildSummaryLine(data: DailyReportData): string {
  const growthBits: string[] = [];
  if (data.signups.length) growthBits.push(pluralize(data.signups.length, "new signup"));
  if (data.newSubscriptions.length) growthBits.push(pluralize(data.newSubscriptions.length, "new subscription"));
  if (data.cancellations.length) growthBits.push(pluralize(data.cancellations.length, "cancellation"));
  const growthLine = growthBits.length > 0 ? `${growthBits.join(", ")}.` : "No signups, subscriptions, or cancellations today.";

  const attentionBits: string[] = [];
  if (data.pastDue.length) attentionBits.push(`${pluralize(data.pastDue.length, "account")} past due`);
  if (data.stuckUploads.length) attentionBits.push(pluralize(data.stuckUploads.length, "stuck upload"));
  const attentionLine = attentionBits.length === 0 ? "Nothing needs attention." : `${attentionBits.join(", ")} — needs attention.`;

  return `${growthLine} ${attentionLine}`;
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

  // --- TL;DR banner — read this and nothing else if you're short on time ---
  const summaryText = buildSummaryLine(data);
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(summaryText, contentWidth - 10);
  const bannerHeight = summaryLines.length * 5 + 7;
  doc.setFillColor(...BANNER_FILL);
  doc.roundedRect(margin, y, contentWidth, bannerHeight, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(summaryLines, margin + 5, y + 6);
  doc.setFont("helvetica", "normal");
  y += bannerHeight + 8;

  // --- Needs Attention — first substantive section: the only one that ever
  // asks someone to act, so it goes before the read-only tables below. ---
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
        head: [["Stuck upload — Org", "File", "Reason"]],
        body: data.stuckUploads.map((s) => [s.org, s.fileName, s.reason]),
        headStyles: { fillColor: STUCK_AMBER, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 2: { cellWidth: contentWidth - 90 } },
      });
      afterTable();
    }
  }

  // --- Since Yesterday, every figure against its 7-day average ---
  sectionHeading("Since Yesterday (vs. 7-day average)");
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["", "Today", "7d avg"]],
    body: [
      [
        "New signups",
        `${data.signups.length}${trendSuffix(data.signups.length, data.trend7dAvg.signups)}`,
        data.trend7dAvg.signups.toFixed(1),
      ],
      [
        "New subscriptions",
        `${data.newSubscriptions.length}${trendSuffix(data.newSubscriptions.length, data.trend7dAvg.newSubscriptions)}`,
        data.trend7dAvg.newSubscriptions.toFixed(1),
      ],
      [
        "Cancellations requested",
        `${data.cancellations.length}${trendSuffix(data.cancellations.length, data.trend7dAvg.cancellations)}`,
        data.trend7dAvg.cancellations.toFixed(1),
      ],
      [
        "Product runs (Comply + Build + Quote)",
        `${data.totalRunsToday}${trendSuffix(data.totalRunsToday, data.trend7dAvg.totalRuns)}`,
        data.trend7dAvg.totalRuns.toFixed(1),
      ],
      [
        "AI spend (USD)",
        `$${data.aiSpendUsd.toFixed(2)}${trendSuffix(data.aiSpendUsd, data.trend7dAvg.aiSpendUsd)}`,
        `$${data.trend7dAvg.aiSpendUsd.toFixed(2)}`,
      ],
    ],
    headStyles: { fillColor: HEAD_FILL, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { cellWidth: 32, halign: "right" }, 2: { cellWidth: 28, halign: "right" } },
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

  // --- Snapshot: current state + all-time totals, so a daily number always
  // has a lifetime figure to sit next to. ---
  sectionHeading("Snapshot");
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ["Active subscriptions", `${data.activeSubs}`],
      ["Trialing", `${data.trialingSubs}`],
      ["MRR (active only)", `$${data.mrrAud.toFixed(2)} AUD`],
      ["Total users (all-time)", `${data.lifetime.totalUsers}`],
      ["Total orgs (all-time)", `${data.lifetime.totalOrgs}`],
      [
        "Total product runs (all-time)",
        `${data.lifetime.complianceRuns + data.lifetime.buildRuns + data.lifetime.quoteRuns}`,
      ],
      [
        "  — Comply / Build / Quote",
        `${data.lifetime.complianceRuns} / ${data.lifetime.buildRuns} / ${data.lifetime.quoteRuns}`,
      ],
      ["Total plans uploaded (all-time)", `${data.lifetime.plansUploaded}`],
      ["Total projects created (all-time)", `${data.lifetime.projectsCreated}`],
      ["AI spend (all-time, USD)", `$${data.lifetime.aiSpendUsd.toFixed(2)}`],
    ],
    theme: "plain",
    bodyStyles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 } },
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
  // finest attribution the data actually supports). Capped to the top 10 by
  // spend so this doesn't grow unbounded as the org count scales. ---
  sectionHeading("AI Usage by Org (last 24h)");
  if (data.orgAiUsage.length === 0) {
    emptyNote("No AI calls in the last 24 hours.");
  } else {
    const orgTotalCost = (o: DailyReportData["orgAiUsage"][number]) =>
      o.costByProvider.reduce((sum, c) => sum + c.cost, 0);
    const sorted = [...data.orgAiUsage].sort((a, b) => orgTotalCost(b) - orgTotalCost(a));
    const top = sorted.slice(0, 10);
    const rest = sorted.slice(10);

    const body = top.map((o) => [
      o.org,
      `${o.calls}`,
      o.tokens.toLocaleString("en-AU"),
      o.costByProvider.map((c) => `${c.provider} $${c.cost.toFixed(4)}`).join(", "),
    ]);
    if (rest.length > 0) {
      const restCalls = rest.reduce((s, o) => s + o.calls, 0);
      const restTokens = rest.reduce((s, o) => s + o.tokens, 0);
      const restCost = rest.reduce((s, o) => s + orgTotalCost(o), 0);
      body.push([`+ ${pluralize(rest.length, "more org")}`, `${restCalls}`, restTokens.toLocaleString("en-AU"), `$${restCost.toFixed(4)} combined`]);
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Org", "Calls", "Tokens", "Cost (by provider)"]],
      body,
      headStyles: { fillColor: HEAD_FILL, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
    afterTable();
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
