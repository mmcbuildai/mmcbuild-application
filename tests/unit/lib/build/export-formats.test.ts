/**
 * SCRUM-354 §2.2 — export format guidance.
 *
 * The point of these is honesty rather than coverage. Two specific claims must
 * never drift, because both have already caused a "the export is broken" report
 * when they were absent:
 *   - .ifc must say the Revit Save As step. A user promised "Revit export" who
 *     gets a file Revit does not list under Open concludes it failed.
 *   - .dxf must not claim to be a DWG. It is DXF, which every DWG-capable tool
 *     opens (SCRUM-354 §2.4 chose accurate labelling over paid conversion).
 */

import { describe, it, expect } from "vitest";
import {
  EXPORT_FORMATS,
  guidanceFor,
  NO_GEOMETRY_REASON,
  type ExportFormatId,
} from "@/lib/build/export-formats";

const ALL_IDS: ExportFormatId[] = [
  "report-pdf",
  "report-docx",
  "ifc",
  "dae",
  "dxf",
];

describe("EXPORT_FORMATS", () => {
  it.each(ALL_IDS)("%s has a label and names the software that opens it", (id) => {
    const g = EXPORT_FORMATS[id];
    expect(g.label.trim()).not.toBe("");
    expect(g.opensIn.trim()).not.toBe("");
  });

  it("keys match their own id, so lookups cannot silently mismatch", () => {
    for (const id of ALL_IDS) expect(EXPORT_FORMATS[id].id).toBe(id);
  });

  it("tells the user about the IFC to Revit Save As step", () => {
    // Promising a native .rvt would be a lie — it cannot be authored outside
    // Revit (SCRUM-194 memo). The Save As instruction is what makes the export
    // usable rather than mysterious.
    const ifc = EXPORT_FORMATS.ifc;
    expect(ifc.opensIn).toMatch(/Revit/i);
    expect(ifc.note ?? "").toMatch(/save as/i);
    expect(ifc.note ?? "").toMatch(/\.rvt/i);
  });

  it("does not claim the IFC export produces a native Revit file", () => {
    const text = `${EXPORT_FORMATS.ifc.label} ${EXPORT_FORMATS.ifc.note ?? ""}`;
    expect(text).not.toMatch(/native \.rvt/i);
  });

  it("describes the DWG export accurately as DXF", () => {
    const dxf = EXPORT_FORMATS.dxf;
    expect(dxf.label).toMatch(/DXF/i);
    expect(dxf.note ?? "").toMatch(/DXF/i);
  });

  it("only ships a viewer link when it also has a label for it", () => {
    // A bare URL with no label renders as an unexplained link.
    for (const id of ALL_IDS) {
      const g = EXPORT_FORMATS[id];
      if (g.viewerUrl) expect(g.viewerLabel?.trim()).toBeTruthy();
    }
  });

  it("uses https for every viewer link", () => {
    for (const id of ALL_IDS) {
      const url = EXPORT_FORMATS[id].viewerUrl;
      if (url) expect(url.startsWith("https://")).toBe(true);
    }
  });
});

describe("guidanceFor", () => {
  it("returns the entry for a known format", () => {
    expect(guidanceFor("dae")?.opensIn).toMatch(/SketchUp/i);
  });

  it("returns null for an unknown id rather than undefined", () => {
    expect(guidanceFor("nope" as ExportFormatId)).toBeNull();
  });
});

describe("NO_GEOMETRY_REASON", () => {
  it("says what to do, not just what is missing", () => {
    expect(NO_GEOMETRY_REASON).toMatch(/floor plan|not finished/i);
  });

  it("reassures that the report exports still work", () => {
    // The failure this replaces: the 3D buttons vanished entirely and the user
    // could not tell whether the whole export feature was broken.
    expect(NO_GEOMETRY_REASON).toMatch(/report exports are unaffected/i);
  });
});
