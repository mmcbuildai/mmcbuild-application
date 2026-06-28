import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ShadingType,
} from "docx";
import { getCostCategoryLabel } from "@/lib/ai/types";
import { displayRateSource, isMarketSourced } from "@/lib/quote/source-label";

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

const HEADER_SHADING = { type: ShadingType.SOLID, color: "581C87", fill: "581C87" };
const SUBHEADER_SHADING = { type: ShadingType.SOLID, color: "323232", fill: "323232" };

function fmtCurrency(n: number | null): string {
  if (n == null) return "-";
  return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function headerCell(text: string, width: number, shading = HEADER_SHADING): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18 })] })],
  });
}

function cell(text: string, opts: { bold?: boolean; color?: string; align?: typeof AlignmentType[keyof typeof AlignmentType]; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text: text || "-", bold: opts.bold ?? false, color: opts.color, size: 18 })],
      }),
    ],
  });
}

export async function generateCostDocx(data: CostReportData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Header band
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `MMC Build — Cost Estimation Report   |   Generated ${new Date(data.completedAt).toLocaleDateString("en-AU")}`,
          color: "646464",
          size: 18,
        }),
      ],
    }),
    new Paragraph({ text: "" })
  );

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: data.projectName, bold: true, size: 40 })],
    })
  );
  if (data.projectAddress) {
    children.push(new Paragraph({ children: [new TextRun({ text: data.projectAddress, color: "505050", size: 22 })] }));
  }
  if (data.region) {
    children.push(new Paragraph({ children: [new TextRun({ text: `Region: ${data.region}`, color: "646464", size: 18 })] }));
  }
  children.push(new Paragraph({ text: "" }));

  // Cost summary table
  const summaryRows: TableRow[] = [
    new TableRow({
      children: [
        headerCell("", 25),
        headerCell("Traditional", 25),
        headerCell("MMC", 25),
        headerCell("Difference", 25),
      ],
    }),
    new TableRow({
      children: [
        cell("Total Cost", { bold: true }),
        cell(fmtCurrency(data.totalTraditional), { align: AlignmentType.RIGHT }),
        cell(fmtCurrency(data.totalMmc), { align: AlignmentType.RIGHT }),
        cell(data.totalSavingsPct != null ? `${data.totalSavingsPct.toFixed(1)}%` : "-", { align: AlignmentType.RIGHT, bold: true, color: "008C00" }),
      ],
    }),
  ];

  if (data.traditionalDurationWeeks) {
    summaryRows.push(
      new TableRow({
        children: [
          cell("Duration", { bold: true }),
          cell(`${data.traditionalDurationWeeks} weeks`, { align: AlignmentType.RIGHT }),
          cell(data.mmcDurationWeeks ? `${data.mmcDurationWeeks} weeks` : "-", { align: AlignmentType.RIGHT }),
          cell(
            data.traditionalDurationWeeks && data.mmcDurationWeeks
              ? `${data.traditionalDurationWeeks - data.mmcDurationWeeks} weeks saved`
              : "-",
            { align: AlignmentType.RIGHT }
          ),
        ],
      })
    );
  }

  children.push(
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: summaryRows }),
    new Paragraph({ text: "" })
  );

  // Summary text
  if (data.summary) {
    children.push(new Paragraph({ children: [new TextRun({ text: data.summary, size: 22 })] }), new Paragraph({ text: "" }));
  }

  // Line items by category
  const categories = [...new Set(data.lineItems.map((li) => li.cost_category))];

  for (const cat of categories) {
    const items = data.lineItems.filter((li) => li.cost_category === cat);
    const catTraditional = items.reduce((s, li) => s + (li.traditional_total ?? 0), 0);
    const catMmc = items.reduce((s, li) => s + (li.mmc_total ?? 0), 0);
    const catLabel = getCostCategoryLabel(cat) || cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({ text: catLabel, bold: true }),
          new TextRun({
            text: `   |   Trad: ${fmtCurrency(catTraditional)}   MMC: ${fmtCurrency(catMmc)}`,
            color: "646464",
            size: 20,
          }),
        ],
      })
    );

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              headerCell("Element", 32, SUBHEADER_SHADING),
              headerCell("Qty", 10, SUBHEADER_SHADING),
              headerCell("Traditional", 16, SUBHEADER_SHADING),
              headerCell("MMC", 16, SUBHEADER_SHADING),
              headerCell("Saving", 10, SUBHEADER_SHADING),
              headerCell("Source", 8, SUBHEADER_SHADING),
              headerCell("Conf", 8, SUBHEADER_SHADING),
            ],
          }),
          ...items.map((li) => {
            const savingTxt = li.savings_pct != null && li.savings_pct !== 0 ? `${li.savings_pct.toFixed(0)}%` : "-";
            const isPositiveSaving = li.savings_pct != null && li.savings_pct > 0;
            const isNegativeSaving = li.savings_pct != null && li.savings_pct < 0;
            return new TableRow({
              children: [
                cell(li.element_description),
                cell(li.quantity != null ? `${li.quantity} ${li.unit ?? ""}`.trim() : "-", { align: AlignmentType.RIGHT }),
                cell(fmtCurrency(li.traditional_total), { align: AlignmentType.RIGHT }),
                cell(fmtCurrency(li.mmc_total), { align: AlignmentType.RIGHT }),
                cell(savingTxt, {
                  align: AlignmentType.RIGHT,
                  color: isPositiveSaving ? "008C00" : isNegativeSaving ? "B40000" : undefined,
                }),
                cell(isMarketSourced(li.rate_source_name) ? "Market" : "Est.", { align: AlignmentType.CENTER }),
                cell(`${Math.round(li.confidence * 100)}%`, { align: AlignmentType.CENTER }),
              ],
            });
          }),
        ],
      }),
      new Paragraph({ text: "" })
    );
  }

  // Data sources
  const sourceMap = new Map<string, number>();
  for (const li of data.lineItems) {
    const src = displayRateSource(li.rate_source_name);
    sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Data Sources", bold: true })],
    })
  );
  for (const [name, count] of sourceMap.entries()) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `• ${name} (${count} item${count !== 1 ? "s" : ""})`, size: 20, color: "3C3C3C" })],
      })
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text:
            'Market rates are sourced from comparable industry quotes (2026) and carry a ±15% margin to allow for ' +
            'price creep over time. Items marked "Extrapolated from public information (data gap)" are public-information ' +
            "estimates, not sourced rates, and should be confirmed with actual figures.",
          size: 16,
          color: "787878",
        }),
      ],
    })
  );
  children.push(new Paragraph({ text: "" }));

  // Disclaimer
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text:
            "DISCLAIMER: These are AI-generated advisory cost estimates only. They do NOT constitute a formal quantity surveyor " +
            "report or fixed-price quotation. All estimates must be reviewed by a qualified quantity surveyor. Actual costs will vary " +
            "based on site conditions, market conditions, and detailed specification. MMC Build Pty Ltd accepts no liability for " +
            "reliance on this report without independent professional verification.",
          size: 16,
          color: "787878",
          italics: true,
        }),
      ],
    })
  );

  const doc = new Document({
    creator: "MMC Build",
    title: `MMC Quote Report — ${data.projectName}`,
    description: "AI-generated cost estimation advisory report",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
