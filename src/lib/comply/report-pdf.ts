import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getCategoryLabel,
  getCategoryVolume,
  getCategoryStatus,
} from "@/lib/ai/types";

interface Finding {
  ncc_section: string;
  category: string;
  title: string;
  description: string;
  recommendation: string | null;
  severity: "compliant" | "advisory" | "non_compliant" | "critical";
  confidence: number;
  ncc_citation: string | null;
  page_references: number[] | null;
}

interface ReportData {
  projectName: string;
  projectAddress: string | null;
  summary: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  completedAt: string;
  findings: Finding[];
}

const SEVERITY_LABELS: Record<string, string> = {
  compliant: "Compliant",
  advisory: "Advisory",
  non_compliant: "Non-Compliant",
  critical: "Critical",
};

const RISK_LABELS: Record<string, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  critical: "Critical Risk",
};

export function generateCompliancePdf(data: ReportData): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // --- Header ---
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("MMC Build — NCC Compliance Report", margin, y);
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

  // --- Overall Risk ---
  y += 3;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Overall Risk Assessment: ${RISK_LABELS[data.overallRisk] ?? data.overallRisk}`, margin, y);
  y += 8;

  // --- Summary ---
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 5 + 6;

  // --- Category Summary Table ---
  const categories = [...new Set(data.findings.map((f) => f.category))];

  const catSummaryRows = categories.map((cat) => {
    const catFindings = data.findings.filter((f) => f.category === cat);
    const status = getCategoryStatus(catFindings);
    const volume = getCategoryVolume(cat);
    return [
      getCategoryLabel(cat),
      `NCC Volume ${volume}`,
      `${catFindings.length}`,
      status === "passed" ? "Pass" : status === "issues" ? "Advisory" : "Fail",
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Category", "NCC Volume", "Findings", "Status"]],
    body: catSummaryRows,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [30, 30, 30], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 50 },
      3: { fontStyle: "bold" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // --- Findings by Category ---
  for (const category of categories) {
    const catFindings = data.findings.filter((f) => f.category === category);
    const label = getCategoryLabel(category);
    const volume = getCategoryVolume(category);

    // Check if we need a new page
    if (y > 250) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(`${label} (NCC Volume ${volume})`, margin, y);
    y += 6;

    const rows = catFindings.map((f) => [
      f.ncc_section,
      f.title,
      SEVERITY_LABELS[f.severity] ?? f.severity,
      `${Math.round(f.confidence * 100)}%`,
      f.recommendation ?? "-",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["NCC Section", "Finding", "Severity", "Confidence", "Recommendation"]],
      body: rows,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [50, 50, 50], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 40 },
        2: { cellWidth: 22 },
        3: { cellWidth: 18 },
        4: { cellWidth: contentWidth - 105 },
      },
      didParseCell(hookData) {
        if (hookData.section === "body" && hookData.column.index === 2) {
          const val = String(hookData.cell.raw);
          if (val === "Critical" || val === "Non-Compliant") {
            hookData.cell.styles.textColor = [180, 0, 0];
            hookData.cell.styles.fontStyle = "bold";
          } else if (val === "Advisory") {
            hookData.cell.styles.textColor = [180, 130, 0];
          } else if (val === "Compliant") {
            hookData.cell.styles.textColor = [0, 140, 0];
          }
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- NCC Citations ---
  const citedFindings = data.findings.filter((f) => f.ncc_citation);
  if (citedFindings.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text("NCC Citations", margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["Section", "Citation"]],
      body: citedFindings.map((f) => [f.ncc_section, f.ncc_citation ?? ""]),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [50, 50, 50], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
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
    "DISCLAIMER: This is an AI-generated advisory report only. It does NOT constitute formal compliance certification. " +
    "All findings must be verified by a qualified building surveyor or certifier. MMC Build Pty Ltd accepts no liability " +
    "for reliance on this report without independent professional verification.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(disclaimerLines, margin, y);

  // --- Footer on all pages ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 10,
      { align: "right" }
    );
    doc.text(
      "MMC Build — mmcbuild.com.au",
      margin,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
