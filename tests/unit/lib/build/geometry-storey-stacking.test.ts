import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  buildFloorPlan3D,
  getStoreyBaseElevation,
  getTopStoreyIndex,
} from "@/lib/build/spatial/geometry";
import type { SpatialLayout, Wall, Room } from "@/lib/build/spatial/types";

/**
 * Multi-storey 3D rendering regression cover (2026-06-25).
 *
 * Before this change the geometry builder extruded EVERY wall from y=0 to the
 * combined height of all storeys — a single tall box — and pinned every floor
 * slab at y=0. Upper-storey walls/rooms must now sit at their storey's base
 * elevation so a 2-storey plan renders as stacked floors. These tests lock in
 * the elevation maths and the storey filter the floor-selector UI relies on.
 */

const GROUND_H = 2.7;
const FIRST_H = 2.55;
const SLAB = 0.2; // matches SLAB_THICKNESS in geometry.ts

function wall(id: string, storey: number, type: Wall["type"] = "external"): Wall {
  // A 4m wall; exact coordinates don't matter for elevation assertions.
  return {
    id,
    start: { x: 0, y: storey }, // vary y so externals on different storeys don't share endpoints
    end: { x: 4, y: storey },
    thickness: 0.09,
    type,
    storey,
  };
}

function room(id: string, floor_level: number): Room {
  return {
    id,
    name: `room-${id}`,
    polygon: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ],
    area_m2: 16,
    floor_level,
  };
}

function twoStoreyLayout(): SpatialLayout {
  return {
    rooms: [room("r0", 0), room("r1", 1)],
    walls: [
      wall("w0a", 0),
      wall("w0b", 0),
      wall("w0c", 0),
      wall("w1a", 1),
      wall("w1b", 1),
      wall("w1c", 1),
    ],
    openings: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: 4, y: 4 }, width: 4, depth: 4 },
    storeys: 2,
    wall_height: 2.4,
    confidence: 0.9,
    storey_details: [
      { id: "s0", level: 0, floor_to_ceiling_m: GROUND_H },
      { id: "s1", level: 1, floor_to_ceiling_m: FIRST_H },
    ],
    roof: { form: "gable", pitch_deg: 22, eave_overhang_m: 0.5 },
  };
}

function wallMeshes(group: THREE.Group): THREE.Object3D[] {
  return group.children.filter((c) => c.userData?.type === "wall");
}
function floorMeshes(group: THREE.Group): THREE.Object3D[] {
  return group.children.filter((c) => c.userData?.type === "floor");
}
function roofMeshes(group: THREE.Group): THREE.Object3D[] {
  return group.children.filter((c) => c.userData?.type === "roof");
}

describe("storey elevation helpers", () => {
  const layout = twoStoreyLayout();

  it("ground storey sits at elevation 0", () => {
    expect(getStoreyBaseElevation(layout, 0)).toBe(0);
  });

  it("first storey sits above the ground storey's ceiling plus slab", () => {
    expect(getStoreyBaseElevation(layout, 1)).toBeCloseTo(GROUND_H + SLAB, 6);
  });

  it("reports the top storey index from the tagged walls/rooms", () => {
    expect(getTopStoreyIndex(layout)).toBe(1);
  });

  it("treats an untagged single-storey layout as top storey 0", () => {
    const single: SpatialLayout = {
      ...twoStoreyLayout(),
      rooms: [room("r0", 0)],
      walls: [wall("w0a", 0), wall("w0b", 0), wall("w0c", 0)],
      storeys: 1,
      storey_details: undefined,
    };
    expect(getTopStoreyIndex(single)).toBe(0);
    expect(getStoreyBaseElevation(single, 0)).toBe(0);
  });
});

describe("buildFloorPlan3D — storey stacking", () => {
  it("lifts first-floor walls above ground-floor walls (not one tall box)", () => {
    const group = buildFloorPlan3D(twoStoreyLayout());
    const meshes = wallMeshes(group);

    const ground = meshes.filter((m) => m.userData.storey === 0);
    const first = meshes.filter((m) => m.userData.storey === 1);
    expect(ground.length).toBe(3);
    expect(first.length).toBe(3);

    // Ground walls centred at half their own storey height.
    for (const m of ground) expect(m.position.y).toBeCloseTo(GROUND_H / 2, 6);
    // First-floor walls centred at base elevation + half their own height.
    const firstBase = GROUND_H + SLAB;
    for (const m of first) expect(m.position.y).toBeCloseTo(firstBase + FIRST_H / 2, 6);

    // Every first-floor wall must sit strictly above every ground-floor wall.
    const groundTop = GROUND_H;
    for (const m of first) expect(m.position.y).toBeGreaterThan(groundTop / 2 + 0.01);
  });

  it("places each storey's floor slab at its own elevation", () => {
    const group = buildFloorPlan3D(twoStoreyLayout());
    const floors = floorMeshes(group);
    const ground = floors.find((m) => m.userData.storey === 0)!;
    const first = floors.find((m) => m.userData.storey === 1)!;
    expect(ground.position.y).toBeCloseTo(0.01, 6);
    expect(first.position.y).toBeCloseTo(GROUND_H + SLAB + 0.01, 6);
  });
});

describe("buildFloorPlan3D — storey filter (floor selector)", () => {
  it("renders only the requested storey's walls/rooms", () => {
    const group = buildFloorPlan3D(twoStoreyLayout(), { storeyFilter: 0 });
    const meshes = wallMeshes(group);
    expect(meshes.every((m) => m.userData.storey === 0)).toBe(true);
    expect(floorMeshes(group).every((m) => m.userData.storey === 0)).toBe(true);
  });

  it("omits the roof when an interior (non-top) storey is isolated", () => {
    const onlyGround = buildFloorPlan3D(twoStoreyLayout(), { storeyFilter: 0 });
    expect(roofMeshes(onlyGround).length).toBe(0);

    const onlyTop = buildFloorPlan3D(twoStoreyLayout(), { storeyFilter: 1 });
    expect(roofMeshes(onlyTop).length).toBeGreaterThan(0);
  });

  it("renders every storey plus the roof with no filter", () => {
    const group = buildFloorPlan3D(twoStoreyLayout());
    const storeys = new Set(wallMeshes(group).map((m) => m.userData.storey));
    expect(storeys).toEqual(new Set([0, 1]));
    expect(roofMeshes(group).length).toBeGreaterThan(0);
  });
});
