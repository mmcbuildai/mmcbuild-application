import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCostCategoryLabel } from "@/lib/ai/types";

interface LineItem {
  cost_category: string;
  element_description: string;
  quantity: number | null;
  unit: string | null;
  traditional_rate: number | null;
  traditional_total: number | null;
  mmc_rate: number | null;
  mmc_total: number | null;
  mmc_alternative: string | null;
  savings_pct: number | null;
  source: string;
  confidence: number;
  rate_source_name: string | null;
}

interface CostReportData {
  projectName: string;
  projectAddress: string | null;
  summary: string;
  totalTraditional: number;
  totalMmc: number;
  totalSavingsPct: number | null;
  region: string | null;
  completedAt: string;
  traditionalDurationWeeks: number | null;
  mmcDurationWeeks: number | null;
  lineItems: LineItem[];
}

function fmtCurrency(n: number | null): string {
  if (n == null) return "-";
  return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function generateCostPdf(data: CostReportData): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // --- Header ---
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("MMC Build — Cost Estimation Report", margin, y);
  doc.text(
    `Generated ${new Date(data.completedAt).toLocaleDateString("en-AU")}`,
    pageWidth - margin,
    y,
    { align: "right" }
  );
  y += 12;

  // --- Title ---
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.text(data.projectName, margin, y);
  y += 7;

  if (data.projectAddress) {
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(data.projectAddress, margin, y);
    y += 7;
  }

  if (data.region) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Region: ${data.region}`, margin, y);
    y += 6;
  }

  // --- Cost Summary ---
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [["", "Traditional", "MMC", "Difference"]],
    body: [
      [
        "Total Cost",
        fmtCurrency(data.totalTraditional),
        fmtCurrency(data.totalMmc),
        data.totalSavingsPct != null ? `${data.totalSavingsPct.toFixed(1)}%` : "-",
      ],
      ...(data.traditionalDurationWeeks
        ? [[
            "Duration",
            `${data.traditionalDurationWeeks} weeks`,
            data.mmcDurationWeeks ? `${data.mmcDurationWeeks} weeks` : "-",
            data.traditionalDurationWeeks && data.mmcDurationWeeks
              ? `${data.traditionalDurationWeeks - data.mmcDurationWeeks} weeks saved`
              : "-",
          ]]
        : []),
    ],
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [88, 28, 135], fontSize: 9 },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35 },
      1: { halign: "right", cellWidth: 40 },
      2: { halign: "right", cellWidth: 40 },
      3: { halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // --- Summary Text ---
  if (data.summary) {
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 5 + 8;
  }

  // --- Line Items by Category ---
  const categories = [...new Set(data.lineItems.map((li) => li.cost_category))];

  for (const cat of categories) {
    const items = data.lineItems.filter((li) => li.cost_category === cat);
    const catTraditional = items.reduce((s, li) => s + (li.traditional_total ?? 0), 0);
    const catMmc = items.reduce((s, li) => s + (li.mmc_total ?? 0), 0);
    const catLabel = getCostCategoryLabel(cat) || cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    if (y > 230) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`${catLabel}`, margin, y);
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Trad: ${fmtCurrency(catTraditional)}${catMmc !== catTraditional ? `  |  MMC: ${fmtCurrency(catMmc)}` : ""}`,
      pageWidth - margin,
      y,
      { align: "right" }
    );
    y += 6;

    const rows = items.map((li) => [
      li.element_description.length > 50 ? li.element_description.slice(0, 47) + "..." : li.element_description,
      li.quantity != null ? `${li.quantity} ${li.unit ?? ""}`.trim() : "-",
      fmtCurrency(li.traditional_total),
      fmtCurrency(li.mmc_total),
      li.savings_pct != null && li.savings_pct !== 0 ? `${li.savings_pct.toFixed(0)}%` : "-",
      li.rate_source_name === "AI Estimated" ? "AI" : "Ref",
      `${Math.round(li.confidence * 100)}%`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Element", "Qty", "Traditional", "MMC", "Saving", "Src", "Conf"]],
      body: rows,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [50, 50, 50], fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: contentWidth - 100 },
        1: { cellWidth: 18, halign: "right" },
        2: { cellWidth: 22, halign: "right" },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 10, halign: "center" },
        6: { cellWidth: 14, halign: "center" },
      },
      didParseCell(hookData) {
        if (hookData.section === "body" && hookData.column.index === 4) {
          const val = String(hookData.cell.raw);
          if (val !== "-" && !val.startsWith("-")) {
            hookData.cell.styles.textColor = [0, 140, 0];
          } else if (val.startsWith("-")) {
            hookData.cell.styles.textColor = [180, 0, 0];
          }
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- Data Sources ---
  if (y > 240) {
    doc.addPage();
    y = margin;
  }

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("Data Sources", margin, y);
  y += 5;

  const sourceMap = new Map<string, number>();
  for (const li of data.lineItems) {
    const src = li.rate_source_name ?? "Unknown";
    sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
  }

  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  for (const [name, count] of sourceMap.entries()) {
    doc.text(`• ${name} (${count} item${count !== 1 ? "s" : ""})`, margin + 2, y);
    y += 4;
  }
  y += 4;

  // --- Disclaimer ---
  if (y > 250) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const disclaimer =
    "DISCLAIMER: These are AI-generated advisory cost estimates only. They do NOT constitute a formal quantity surveyor " +
    "report or fixed-price quotation. All estimates must be reviewed by a qualified quantity surveyor. Actual costs will vary " +
    "based on site conditions, market conditions, and detailed specification. MMC Build Pty Ltd accepts no liability for " +
    "reliance on this report without independent professional verification.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(disclaimerLines, margin, y);

  // --- Footer ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 10, { align: "right" });
    doc.text("MMC Build — mmcbuild.com.au", margin, doc.internal.pageSize.getHeight() - 10);
  }

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
