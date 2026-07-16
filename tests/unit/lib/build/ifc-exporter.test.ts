import { describe, expect, it } from "vitest";
import { buildIfcFromLayout, type IfcExportInput } from "@/lib/build/ifc-exporter";
import type { SpatialLayout } from "@/lib/build/spatial/types";

function makeLayout(): SpatialLayout {
  return {
    rooms: [
      {
        id: "r1",
        name: "Living",
        polygon: [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 4 },
          { x: 0, y: 4 },
        ],
        area_m2: 24,
        floor_level: 0,
        type: "living",
      },
    ],
    walls: [
      {
        id: "w1",
        start: { x: 0, y: 0 },
        end: { x: 6, y: 0 },
        thickness: 0.09,
        type: "external",
        material: "timber_frame",
      },
      {
        id: "w2",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 4 },
        thickness: 0.09,
        type: "external",
        material: "sip_panel",
      },
    ],
    openings: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: 6, y: 4 }, width: 6, depth: 4 },
    storeys: 1,
    wall_height: 2.4,
    confidence: 0.85,
  };
}

function makeInput(): IfcExportInput {
  return {
    layout: makeLayout(),
    projectName: "Lot 31 Brushwood Court",
    reportId: "8fa28aa3-e1a6-437c-ac7d-0a167979a27e",
    timestampSeconds: 1_700_000_000,
  };
}

/** Extract the `#id=...;` definition lines from the DATA section. */
function dataLines(ifc: string): string[] {
  return ifc.split("\n").filter((l) => /^#\d+=/.test(l));
}

describe("buildIfcFromLayout — STEP envelope", () => {
  it("emits a well-formed ISO-10303-21 IFC2X3 file", () => {
    const ifc = buildIfcFromLayout(makeInput());
    expect(ifc.startsWith("ISO-10303-21;")).toBe(true);
    expect(ifc).toContain("FILE_SCHEMA(('IFC2X3'));");
    expect(ifc.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
    // Exactly one HEADER/DATA open + close pairing.
    expect(ifc).toContain("HEADER;");
    expect(ifc).toContain("DATA;");
    expect((ifc.match(/ENDSEC;/g) ?? []).length).toBe(2);
  });

  it("declares SI metre units", () => {
    const ifc = buildIfcFromLayout(makeInput());
    expect(ifc).toContain("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
    expect(ifc).toMatch(/IFCUNITASSIGNMENT\(\(#\d+/);
  });
});

describe("buildIfcFromLayout — reference integrity (the critical guard)", () => {
  it("every #ref used on a right-hand side resolves to a defined entity", () => {
    const lines = dataLines(buildIfcFromLayout(makeInput()));
    const defined = new Set<number>();
    for (const line of lines) {
      const m = line.match(/^#(\d+)=/);
      if (m) defined.add(Number(m[1]));
    }
    const dangling: string[] = [];
    for (const line of lines) {
      const rhs = line.slice(line.indexOf("=") + 1);
      for (const m of rhs.matchAll(/#(\d+)/g)) {
        if (!defined.has(Number(m[1]))) dangling.push(`${line} -> #${m[1]}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("assigns every #id exactly once (no duplicate entity ids)", () => {
    const lines = dataLines(buildIfcFromLayout(makeInput()));
    const ids = lines
      .map((l) => l.match(/^#(\d+)=/)?.[1])
      .filter((x): x is string => Boolean(x));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildIfcFromLayout — spatial structure + elements", () => {
  it("has the full Project → Site → Building → Storey hierarchy", () => {
    const ifc = buildIfcFromLayout(makeInput());
    expect(ifc).toContain("IFCPROJECT(");
    expect(ifc).toContain("IFCSITE(");
    expect(ifc).toContain("IFCBUILDING(");
    expect(ifc).toContain("IFCBUILDINGSTOREY(");
    // Aggregation relationships wire the hierarchy together.
    expect((ifc.match(/IFCRELAGGREGATES\(/g) ?? []).length).toBe(3);
  });

  it("emits one IFCWALL per non-degenerate wall and one IFCSLAB per room", () => {
    const ifc = buildIfcFromLayout(makeInput());
    expect((ifc.match(/=IFCWALL\(/g) ?? []).length).toBe(2);
    expect((ifc.match(/=IFCSLAB\(/g) ?? []).length).toBe(1);
    // Walls/slabs are placed into the storey.
    expect(ifc).toContain("IFCRELCONTAINEDINSPATIALSTRUCTURE(");
  });

  it("skips degenerate (zero-length) walls", () => {
    const layout = makeLayout();
    layout.walls.push({
      id: "wDeg",
      start: { x: 1, y: 1 },
      end: { x: 1, y: 1 },
      thickness: 0.09,
      type: "internal",
    });
    const ifc = buildIfcFromLayout({ ...makeInput(), layout });
    // Still only the two real walls.
    expect((ifc.match(/=IFCWALL\(/g) ?? []).length).toBe(2);
  });

  it("creates a distinct storey for a wall on an upper level", () => {
    const layout = makeLayout();
    layout.storeys = 2;
    layout.walls.push({
      id: "w3",
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
      thickness: 0.09,
      type: "external",
      storey: 1,
    });
    const ifc = buildIfcFromLayout({ ...makeInput(), layout });
    expect((ifc.match(/IFCBUILDINGSTOREY\(/g) ?? []).length).toBe(2);
    expect((ifc.match(/=IFCWALL\(/g) ?? []).length).toBe(3);
    // Two containment relationships — one per storey with elements.
    expect((ifc.match(/IFCRELCONTAINEDINSPATIALSTRUCTURE\(/g) ?? []).length).toBe(2);
  });
});

describe("buildIfcFromLayout — GlobalIds + determinism", () => {
  it("emits 22-character IFC GlobalIds from the valid alphabet", () => {
    const ifc = buildIfcFromLayout(makeInput());
    const guids = [...ifc.matchAll(/IFC(?:PROJECT|SITE|BUILDING|WALL|SLAB)\('([^']+)'/g)].map(
      (m) => m[1],
    );
    expect(guids.length).toBeGreaterThan(0);
    for (const g of guids) {
      expect(g).toHaveLength(22);
      expect(g).toMatch(/^[0-9A-Za-z_$]{22}$/);
    }
  });

  it("is deterministic for a fixed timestamp", () => {
    expect(buildIfcFromLayout(makeInput())).toBe(buildIfcFromLayout(makeInput()));
  });

  it("escapes single quotes in names", () => {
    const ifc = buildIfcFromLayout({
      ...makeInput(),
      projectName: "O'Brien's House",
    });
    expect(ifc).toContain("O''Brien''s House");
  });
});
