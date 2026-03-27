import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Suggestion {
  technology_category: string;
  current_approach: string;
  suggested_alternative: string;
  benefits: string;
  estimated_time_savings: number | null;
  estimated_cost_savings: number | null;
  estimated_waste_reduction: number | null;
  implementation_complexity: string;
  confidence: number;
}

interface BuildReportData {
  projectName: string;
  projectAddress: string | null;
  summary: string;
  completedAt: string;
  suggestions: Suggestion[];
}

const COMPLEXITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function generateBuildPdf(data: BuildReportData): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // --- Header ---
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("MMC Build — Design Optimisation Report", margin, y);
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

  // --- Summary Stats ---
  y += 3;
  const avgTime = data.suggestions.length > 0
    ? Math.round(data.suggestions.reduce((s, x) => s + (x.estimated_time_savings ?? 0), 0) / data.suggestions.length)
    : 0;
  const avgCost = data.suggestions.length > 0
    ? Math.round(data.suggestions.reduce((s, x) => s + (x.estimated_cost_savings ?? 0), 0) / data.suggestions.length)
    : 0;
  const avgWaste = data.suggestions.length > 0
    ? Math.round(data.suggestions.reduce((s, x) => s + (x.estimated_waste_reduction ?? 0), 0) / data.suggestions.length)
    : 0;

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(`${data.suggestions.length} Optimisation Suggestions`, margin, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Avg. Time Savings: ${avgTime}%  |  Avg. Cost Savings: ${avgCost}%  |  Avg. Waste Reduction: ${avgWaste}%`, margin, y);
  y += 8;

  // --- Summary ---
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 5 + 8;

  // --- Suggestions by Category ---
  const categories = [...new Set(data.suggestions.map((s) => s.technology_category))];

  for (const cat of categories) {
    const catSuggestions = data.suggestions.filter((s) => s.technology_category === cat);

    if (y > 240) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    const catLabel = cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    doc.text(`${catLabel} (${catSuggestions.length})`, margin, y);
    y += 6;

    const rows = catSuggestions.map((s) => [
      s.current_approach,
      s.suggested_alternative,
      s.benefits.length > 120 ? s.benefits.slice(0, 117) + "..." : s.benefits,
      `${s.estimated_time_savings ?? 0}%`,
      `${s.estimated_cost_savings ?? 0}%`,
      COMPLEXITY_LABELS[s.implementation_complexity] ?? s.implementation_complexity,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Current", "MMC Alternative", "Benefits", "Time", "Cost", "Complexity"]],
      body: rows,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [0, 128, 128], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 30 },
        2: { cellWidth: contentWidth - 108 },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 22 },
      },
      didParseCell(hookData) {
        if (hookData.section === "body" && hookData.column.index === 5) {
          const val = String(hookData.cell.raw);
          if (val === "Low") hookData.cell.styles.textColor = [0, 140, 0];
          else if (val === "High") hookData.cell.styles.textColor = [180, 0, 0];
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- Disclaimer ---
  if (y > 250) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const disclaimer =
    "DISCLAIMER: This is an AI-generated advisory report only. It does NOT constitute formal engineering advice. " +
    "All suggestions must be verified by a qualified engineer or building professional. MMC Build Pty Ltd accepts no liability " +
    "for reliance on this report without independent professional verification.";
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
