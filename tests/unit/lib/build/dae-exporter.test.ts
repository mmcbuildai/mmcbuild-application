import { describe, expect, it } from "vitest";
import {
  buildDaeFromLayout,
  type DaeExportInput,
  type DaeSuggestion,
} from "@/lib/build/dae-exporter";
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
    openings: [
      {
        id: "o1",
        type: "door",
        position: { x: 3, y: 0 },
        width: 0.82,
        height: 2.04,
        wall_id: "w1",
      },
    ],
    bounds: {
      min: { x: 0, y: 0 },
      max: { x: 6, y: 4 },
      width: 6,
      depth: 4,
    },
    storeys: 1,
    wall_height: 2.4,
    confidence: 0.85,
  };
}

function makeInput(suggestions: DaeSuggestion[] = []): DaeExportInput {
  return {
    layout: makeLayout(),
    suggestions,
    projectName: "Lot 31 Brushwood Court",
    reportId: "8fa28aa3-e1a6-437c-ac7d-0a167979a27e",
  };
}

describe("buildDaeFromLayout — structural validity", () => {
  it("emits a well-formed COLLADA root with the expected schema URI", () => {
    const dae = buildDaeFromLayout(makeInput());
    expect(dae).toMatch(/^<\?xml version="1\.0"/);
    expect(dae).toMatch(
      /xmlns="http:\/\/www\.collada\.org\/2005\/11\/COLLADASchema"/,
    );
    expect(dae).toMatch(/version="1\.4\.1"/);
  });

  it("declares metres + Z_UP so SketchUp orients the model correctly", () => {
    const dae = buildDaeFromLayout(makeInput());
    expect(dae).toContain(`<unit name="meter" meter="1"/>`);
    expect(dae).toContain(`<up_axis>Z_UP</up_axis>`);
  });

  it("emits a geometry node per wall, room, and opening", () => {
    const dae = buildDaeFromLayout(makeInput());
    expect(dae).toMatch(/<geometry id="wall_w1"/);
    expect(dae).toMatch(/<geometry id="wall_w2"/);
    expect(dae).toMatch(/<geometry id="room_r1"/);
    expect(dae).toMatch(/<geometry id="opening_o1"/);
  });

  it("instances every geometry inside the visual scene", () => {
    const dae = buildDaeFromLayout(makeInput());
    expect(dae).toMatch(/<instance_geometry url="#wall_w1"/);
    expect(dae).toMatch(/<instance_geometry url="#room_r1"/);
    expect(dae).toMatch(/<instance_geometry url="#opening_o1"/);
  });
});

describe("buildDaeFromLayout — material mapping", () => {
  it("maps wall.material to Original_* material library entries", () => {
    const dae = buildDaeFromLayout(makeInput());
    // timber_frame wall
    expect(dae).toMatch(/<material id="mat_timber" name="Original_TimberFrame"/);
    // sip_panel wall
    expect(dae).toMatch(/<material id="mat_sip" name="Original_SIPPanel"/);
  });

  it("applies Suggested_Pursuing material to walls touched by pursuing decisions", () => {
    const suggestions: DaeSuggestion[] = [
      {
        id: "s1",
        technology_category: "wall_system",
        suggested_alternative: "SIP panel walls",
        affected_wall_ids: ["w1"],
        affected_room_ids: null,
        decision: "pursuing",
      },
    ];
    const dae = buildDaeFromLayout(makeInput(suggestions));
    expect(dae).toMatch(/<material id="mat_pursuing" name="Suggested_Pursuing"/);
    // w1's instance_material should target the pursuing material, not the
    // original timber material.
    const w1Section = dae.match(
      /<node id="wall_w1-node"[^]*?<\/node>/,
    )?.[0];
    expect(w1Section).toBeDefined();
    expect(w1Section).toContain(`target="#mat_pursuing"`);
  });

  it("applies Suggested_Considering to walls touched only by considering", () => {
    const suggestions: DaeSuggestion[] = [
      {
        id: "s1",
        technology_category: "wall_system",
        suggested_alternative: "SIP panel walls",
        affected_wall_ids: ["w2"],
        affected_room_ids: null,
        decision: "considering",
      },
    ];
    const dae = buildDaeFromLayout(makeInput(suggestions));
    const w2Section = dae.match(
      /<node id="wall_w2-node"[^]*?<\/node>/,
    )?.[0];
    expect(w2Section).toContain(`target="#mat_considering"`);
  });

  it("Pursuing wins over Considering when both touch the same wall", () => {
    const suggestions: DaeSuggestion[] = [
      {
        id: "s1",
        technology_category: "a",
        suggested_alternative: "A",
        affected_wall_ids: ["w1"],
        affected_room_ids: null,
        decision: "considering",
      },
      {
        id: "s2",
        technology_category: "b",
        suggested_alternative: "B",
        affected_wall_ids: ["w1"],
        affected_room_ids: null,
        decision: "pursuing",
      },
    ];
    const dae = buildDaeFromLayout(makeInput(suggestions));
    const w1Section = dae.match(/<node id="wall_w1-node"[^]*?<\/node>/)?.[0];
    expect(w1Section).toContain(`target="#mat_pursuing"`);
  });

  it("Rejected suggestions do not change the wall material", () => {
    const suggestions: DaeSuggestion[] = [
      {
        id: "s1",
        technology_category: "wall_system",
        suggested_alternative: "SIP panel walls",
        affected_wall_ids: ["w1"],
        affected_room_ids: null,
        decision: "rejected",
      },
    ];
    const dae = buildDaeFromLayout(makeInput(suggestions));
    const w1Section = dae.match(/<node id="wall_w1-node"[^]*?<\/node>/)?.[0];
    expect(w1Section).toContain(`target="#mat_timber"`);
    expect(w1Section).not.toContain(`target="#mat_pursuing"`);
  });
});

describe("buildDaeFromLayout — geometry safety", () => {
  it("does not emit a geometry block for degenerate (zero-length) walls", () => {
    const layout = makeLayout();
    layout.walls.push({
      id: "wDeg",
      start: { x: 1, y: 1 },
      end: { x: 1, y: 1 }, // same point
      thickness: 0.09,
      type: "internal",
    });
    const dae = buildDaeFromLayout({ ...makeInput(), layout });
    // No geometry id for the degenerate wall
    expect(dae).not.toMatch(/<geometry id="wall_wDeg"/);
  });

  it("escapes XML-special characters in project name and room labels", () => {
    const layout = makeLayout();
    layout.rooms[0].name = `Liv<ing & "best"`;
    const dae = buildDaeFromLayout({
      ...makeInput(),
      layout,
      projectName: `Lot <31> & "Brushwood"`,
    });
    expect(dae).toContain("Liv&lt;ing &amp; &quot;best&quot;");
    expect(dae).toContain(`Lot &lt;31&gt; &amp; &quot;Brushwood&quot;`);
    // And NOT the raw special characters in those positions
    expect(dae).not.toContain(`name="Liv<ing`);
  });

  it("includes pursuing + considering counts in the asset comment", () => {
    const suggestions: DaeSuggestion[] = [
      {
        id: "s1",
        technology_category: "a",
        suggested_alternative: "A",
        affected_wall_ids: ["w1"],
        affected_room_ids: null,
        decision: "pursuing",
      },
      {
        id: "s2",
        technology_category: "b",
        suggested_alternative: "B",
        affected_wall_ids: ["w2"],
        affected_room_ids: null,
        decision: "considering",
      },
      {
        id: "s3",
        technology_category: "c",
        suggested_alternative: "C",
        affected_wall_ids: [],
        affected_room_ids: null,
        decision: "rejected",
      },
    ];
    const dae = buildDaeFromLayout(makeInput(suggestions));
    expect(dae).toContain("Pursuing: 1");
    expect(dae).toContain("Considering: 1");
  });
});

describe("buildDaeFromLayout — known limit framing", () => {
  it("documents preview-quality status in the asset comment so file inspectors see it", () => {
    const dae = buildDaeFromLayout(makeInput());
    expect(dae).toContain("PREVIEW QUALITY");
    expect(dae).toContain("openings are markers, not real cutouts");
  });
});
