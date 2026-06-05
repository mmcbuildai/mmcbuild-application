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

// Build's brand palette (matches the teal used in report-pdf.ts).
const HEADER_SHADING = { type: ShadingType.SOLID, color: "008080", fill: "008080" };

const COMPLEXITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: HEADER_SHADING,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18 })] })],
  });
}

function cell(
  text: string,
  opts: { bold?: boolean; color?: string; align?: typeof AlignmentType[keyof typeof AlignmentType]; width?: number } = {}
): TableCell {
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

export async function generateBuildDocx(data: BuildReportData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Header band
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `MMC Build — Design Optimisation Report   |   Generated ${new Date(data.completedAt).toLocaleDateString("en-AU")}`,
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

  // Summary stats line (mirrors the PDF averages)
  const avg = (pick: (s: Suggestion) => number | null) =>
    data.suggestions.length > 0
      ? Math.round(data.suggestions.reduce((s, x) => s + (pick(x) ?? 0), 0) / data.suggestions.length)
      : 0;
  const avgTime = avg((s) => s.estimated_time_savings);
  const avgCost = avg((s) => s.estimated_cost_savings);
  const avgWaste = avg((s) => s.estimated_waste_reduction);

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${data.suggestions.length} Optimisation Suggestions`, bold: true, size: 22 })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Avg. Time Savings: ${avgTime}%   |   Avg. Cost Savings: ${avgCost}%   |   Avg. Waste Reduction: ${avgWaste}%`,
          color: "505050",
          size: 18,
        }),
      ],
    }),
    new Paragraph({ text: "" })
  );

  // Summary text
  if (data.summary) {
    children.push(new Paragraph({ children: [new TextRun({ text: data.summary, size: 22 })] }), new Paragraph({ text: "" }));
  }

  // Suggestions by category
  const categories = [...new Set(data.suggestions.map((s) => s.technology_category))];

  for (const cat of categories) {
    const catSuggestions = data.suggestions.filter((s) => s.technology_category === cat);
    const catLabel = cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `${catLabel} (${catSuggestions.length})`, bold: true })],
      })
    );

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              headerCell("Current", 22),
              headerCell("MMC Alternative", 24),
              headerCell("Benefits", 34),
              headerCell("Time", 6),
              headerCell("Cost", 6),
              headerCell("Complexity", 8),
            ],
          }),
          ...catSuggestions.map((s) => {
            const complexity = COMPLEXITY_LABELS[s.implementation_complexity] ?? s.implementation_complexity;
            const complexityColor = complexity === "Low" ? "008C00" : complexity === "High" ? "B40000" : undefined;
            return new TableRow({
              children: [
                cell(s.current_approach),
                cell(s.suggested_alternative),
                cell(s.benefits),
                cell(`${s.estimated_time_savings ?? 0}%`, { align: AlignmentType.RIGHT }),
                cell(`${s.estimated_cost_savings ?? 0}%`, { align: AlignmentType.RIGHT }),
                cell(complexity, { align: AlignmentType.CENTER, color: complexityColor }),
              ],
            });
          }),
        ],
      }),
      new Paragraph({ text: "" })
    );
  }

  // Disclaimer
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text:
            "DISCLAIMER: This is an AI-generated advisory report only. It does NOT constitute formal engineering advice. " +
            "All suggestions must be verified by a qualified engineer or building professional. MMC Build Pty Ltd accepts no liability " +
            "for reliance on this report without independent professional verification.",
          size: 16,
          color: "787878",
          italics: true,
        }),
      ],
    })
  );

  const doc = new Document({
    creator: "MMC Build",
    title: `MMC Build Report — ${data.projectName}`,
    description: "AI-generated design optimisation advisory report",
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
