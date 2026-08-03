/**
 * Export-format guidance (SCRUM-354 §2.2).
 *
 * Karthik, 21 July: when a user picks a CAD or 3D format, tell them which
 * software opens it — and give a viewer link where a free one exists. Without
 * this, a user downloads a `.ifc` and has no idea what to do with it, which
 * makes a working export look broken.
 *
 * Single-sourced here rather than written inline next to each button, so the
 * report UI and any future surface (email, docs, the Quote report) describe a
 * format the same way.
 *
 * ⚠️ `viewerUrl` is deliberately sparse. A dead "free viewer" link is worse than
 * no link — the user concludes the export is unsupported. Only URLs we are
 * confident are stable are included; for the rest we name the software, which
 * is the part that actually unblocks someone. See the ticket for the viewer
 * links still to be confirmed before they are published.
 */

export type ExportFormatId = "report-pdf" | "report-docx" | "ifc" | "dae" | "dxf";

export interface ExportFormatGuidance {
  id: ExportFormatId;
  /** What the user sees on the control. */
  label: string;
  /** Applications that open this file. Plain language, most likely first. */
  opensIn: string;
  /**
   * One extra sentence where the format needs it — the honest caveat rather
   * than the marketing line. Empty when the format speaks for itself.
   */
  note?: string;
  /** A free viewer, only where we are confident the link is stable. */
  viewerUrl?: string;
  viewerLabel?: string;
}

export const EXPORT_FORMATS: Record<ExportFormatId, ExportFormatGuidance> = {
  "report-pdf": {
    id: "report-pdf",
    label: "PDF",
    opensIn: "Any PDF reader",
  },
  "report-docx": {
    id: "report-docx",
    label: "Word",
    opensIn: "Microsoft Word, Google Docs, LibreOffice",
    note: "Editable, so you can add your own commentary before sending it on.",
  },
  ifc: {
    id: "ifc",
    label: "Revit (.ifc)",
    opensIn: "Revit, ArchiCAD, Tekla, Solibri",
    // The honest version. Promising a native .rvt would be a lie: .rvt cannot
    // be authored outside Revit (SCRUM-194 feasibility memo), and IFC is the
    // industry-standard route in. Users must know about the Save As step or
    // they will report "it didn't give me a Revit file".
    note: "Open the .ifc in Revit, then File → Save As to get a .rvt. Revit cannot be written directly by any web application.",
  },
  dae: {
    id: "dae",
    label: "3D model (.dae)",
    opensIn: "SketchUp, Rhino, Blender, Revit",
    note: "A COLLADA 3D model. Not viewable in the browser — it downloads for use in 3D software.",
  },
  dxf: {
    id: "dxf",
    label: "DWG / DXF",
    opensIn: "AutoCAD, BricsCAD, DraftSight, LibreCAD",
    // Accurate labelling rather than a paid conversion nobody asked for
    // (SCRUM-354 §2.4): DXF is the open interchange format every DWG-capable
    // tool reads, so claiming "DWG" alone would be the misleading option.
    note: "Supplied as DXF, which every DWG-capable program opens. Your pursued changes are solid; the original is dotted.",
    viewerUrl: "https://viewer.autodesk.com",
    viewerLabel: "Autodesk online viewer",
  },
};

/** Guidance for a format, or null for an id we do not describe. */
export function guidanceFor(id: ExportFormatId): ExportFormatGuidance | null {
  return EXPORT_FORMATS[id] ?? null;
}

/**
 * Why the 3D exports are unavailable, in the user's terms.
 *
 * The old UI simply rendered nothing when there was no spatial layout, so the
 * exports appeared to have vanished and there was no way to tell whether that
 * was a bug. SCRUM-354 asks for the reason to be stated. Deliberately says what
 * to DO about it, not just what is missing.
 */
export const NO_GEOMETRY_REASON =
  "3D exports need the geometry from your plans, and none was extracted for this design. " +
  "That usually means the upload had no readable floor plan, or the 3D step has not finished yet. " +
  "The report exports are unaffected.";
