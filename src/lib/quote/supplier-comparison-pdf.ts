import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// SCRUM-172 — the multi-supplier comparison export: parallel columns (Supplier
// A / B / C) with the delta vs the lowest, so a builder can drop it into a
// procurement pack. Landscape A4 so 3 supplier columns read cleanly.

export interface ComparisonPdfVariant {
  supplier_name: string;
  product_name: string;
  sku: string | null;
  estimated_total: number | null;
  unit_rate: number | null;
  quantity: number | null;
  unit: string | null;
  lead_time_days: number | null;
  confidence: number | null;
  notes: string | null;
  delta_vs_lowest_pct: number | null;
  is_lowest: boolean;
}

export interface ComparisonPdfData {
  projectName: string;
  projectAddress: string | null;
  categoryLabel: string;
  region: string | null;
  summary: string;
  completedAt: string;
  variants: ComparisonPdfVariant[];
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "-";
  return (
    "$" +
    n.toLocaleString("en-AU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

export function generateSupplierComparisonPdf(
  data: ComparisonPdfData,
): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // --- Header ---
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("MMC Build — Supplier Comparison Quote", margin, y);
  doc.text(
    `Generated ${new Date(data.completedAt).toLocaleDateString("en-AU")}`,
    pageWidth - margin,
    y,
    { align: "right" },
  );
  y += 10;

  // --- Title ---
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text(data.projectName, margin, y);
  y += 7;

  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(`Component: ${data.categoryLabel}`, margin, y);
  y += 6;

  if (data.projectAddress || data.region) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const bits = [data.projectAddress, data.region ? `Region: ${data.region}` : null]
      .filter(Boolean)
      .join("   •   ");
    doc.text(bits, margin, y);
    y += 6;
  }
  y += 2;

  // --- Comparison table (metrics as rows, suppliers as columns) ---
  const suppliers = data.variants;
  const lowestIdx = suppliers.findIndex((v) => v.is_lowest);

  const head = [
    ["", ...suppliers.map((v, i) => `${String.fromCharCode(65 + i)}. ${v.supplier_name}`)],
  ];

  const row = (label: string, cells: (string | number)[]) => [
    label,
    ...cells.map((c) => String(c)),
  ];

  const body = [
    row("Product", suppliers.map((v) => (v.sku ? `${v.product_name} (${v.sku})` : v.product_name))),
    row("Est. installed total", suppliers.map((v) => fmtCurrency(v.estimated_total))),
    row(
      "Δ vs lowest",
      suppliers.map((v) =>
        v.is_lowest
          ? "Lowest"
          : v.delta_vs_lowest_pct != null
            ? `+${v.delta_vs_lowest_pct}%`
            : "-",
      ),
    ),
    row(
      "Unit rate",
      suppliers.map((v) =>
        v.unit_rate != null ? `${fmtCurrency(v.unit_rate)}${v.unit ? `/${v.unit}` : ""}` : "-",
      ),
    ),
    row(
      "Quantity",
      suppliers.map((v) =>
        v.quantity != null ? `${v.quantity}${v.unit ? ` ${v.unit}` : ""}` : "-",
      ),
    ),
    row(
      "Lead time",
      suppliers.map((v) => (v.lead_time_days != null ? `${v.lead_time_days} days` : "-")),
    ),
    row(
      "Confidence",
      suppliers.map((v) => (v.confidence != null ? `${Math.round(v.confidence * 100)}%` : "-")),
    ),
    row("Notes", suppliers.map((v) => v.notes ?? "-")),
  ];

  const labelWidth = 40;
  const supplierWidth =
    suppliers.length > 0 ? (contentWidth - labelWidth) / suppliers.length : contentWidth;
  const columnStyles: Record<number, { cellWidth: number; fontStyle?: "bold" }> = {
    0: { cellWidth: labelWidth, fontStyle: "bold" },
  };
  for (let i = 0; i < suppliers.length; i++) {
    columnStyles[i + 1] = { cellWidth: supplierWidth };
  }

  autoTable(doc, {
    startY: y,
    head,
    body,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [88, 28, 135], fontSize: 9, halign: "left" },
    bodyStyles: { fontSize: 8.5, valign: "top" },
    columnStyles,
    didParseCell(hookData) {
      const colIdx = hookData.column.index;
      // Highlight the lowest-cost supplier column.
      if (lowestIdx >= 0 && colIdx === lowestIdx + 1) {
        if (hookData.section === "head") {
          hookData.cell.styles.fillColor = [22, 101, 52]; // green header
        } else if (hookData.section === "body") {
          hookData.cell.styles.fillColor = [240, 253, 244];
          // Bold the "Est. installed total" + "Δ vs lowest" rows.
          if (hookData.row.index === 1 || hookData.row.index === 2) {
            hookData.cell.styles.fontStyle = "bold";
            hookData.cell.styles.textColor = [22, 101, 52];
          }
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // --- Summary ---
  if (data.summary) {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Summary", margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 4.5 + 6;
  }

  // --- Disclaimer ---
  if (y > pageHeight - 30) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const disclaimer =
    "DISCLAIMER: These are AI-generated advisory supplier estimates only, produced to help compare suppliers. They do NOT " +
    "constitute formal quotations from the named suppliers. Confirm all figures, lead times and availability directly with each " +
    "supplier. MMC Build Pty Ltd accepts no liability for reliance on this comparison without independent verification.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(disclaimerLines, margin, y);

  // --- Footer ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: "right",
    });
    doc.text("MMC Build — mmcbuild.com.au", margin, pageHeight - 8);
  }

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
