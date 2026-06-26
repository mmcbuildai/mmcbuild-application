import { describe, it, expect, vi } from "vitest";

// full-house-extractor.ts is `import "server-only"`, which throws outside an
// RSC context. Stub it to an empty module so the pure merge helpers below can
// be imported and unit-tested in the node test environment.
vi.mock("server-only", () => ({}));

import {
  prepareStorey,
  recomputeBounds,
  boundsCentre,
} from "@/lib/build/spatial/full-house-extractor";
import type { SpatialLayout } from "@/lib/build/spatial/types";

/**
 * Multi-storey EXTRACTION merge cover (2026-06-25).
 *
 * Each floor-plan page is extracted in isolation with its own (0,0) origin and
 * floor_level:0. prepareStorey is what makes a second extracted floor become a
 * real storey 1: it re-tags storey/floor_level, namespaces ids so they don't
 * collide with the ground floor, keeps wall_id links intact, and centre-aligns
 * the floor over the ground footprint.
 */

// A 6×8 ground floor at origin; a 4×4 upper floor at a DIFFERENT origin to
// prove alignment actually translates it.
function upperFloorAtOffset(): SpatialLayout {
  return {
    rooms: [
      {
        id: "r1",
        name: "Bed",
        polygon: [
          { x: 10, y: 10 },
          { x: 14, y: 10 },
          { x: 14, y: 14 },
          { x: 10, y: 14 },
        ],
        area_m2: 16,
        floor_level: 0, // extracted in isolation → always 0
      },
    ],
    walls: [
      {
        id: "w1",
        start: { x: 10, y: 10 },
        end: { x: 14, y: 10 },
        thickness: 0.09,
        type: "external",
        // no storey tag — extractor doesn't set one
      },
    ],
    openings: [
      {
        id: "o1",
        type: "window",
        position: { x: 12, y: 10 },
        width: 1.2,
        height: 1.2,
        wall_id: "w1",
      },
    ],
    bounds: { min: { x: 10, y: 10 }, max: { x: 14, y: 14 }, width: 4, depth: 4 },
    storeys: 1,
    wall_height: 2.4,
    confidence: 0.8,
  };
}

describe("prepareStorey", () => {
  it("re-tags every wall.storey and room.floor_level to the storey index", () => {
    const out = prepareStorey(upperFloorAtOffset(), 1, null);
    expect(out.walls.every((w) => w.storey === 1)).toBe(true);
    expect(out.rooms.every((r) => r.floor_level === 1)).toBe(true);
  });

  it("namespaces ids so they can't collide with the ground floor", () => {
    const out = prepareStorey(upperFloorAtOffset(), 1, null);
    expect(out.walls[0].id).toBe("s1_w1");
    expect(out.rooms[0].id).toBe("s1_r1");
    expect(out.openings[0].id).toBe("s1_o1");
  });

  it("rewrites opening.wall_id to the namespaced wall id (link preserved)", () => {
    const out = prepareStorey(upperFloorAtOffset(), 1, null);
    expect(out.openings[0].wall_id).toBe("s1_w1");
    // The rewritten link still points at a wall that exists in the output.
    expect(out.walls.some((w) => w.id === out.openings[0].wall_id)).toBe(true);
  });

  it("centre-aligns the floor onto the ground footprint centre", () => {
    const groundCentre = { x: 3, y: 4 }; // centre of a 6×8 ground floor at origin
    const out = prepareStorey(upperFloorAtOffset(), 1, groundCentre);
    // Upper floor's own centre was (12,12); shifting it to (3,4) moves every
    // point by (-9,-8). Wall w1 started at (10,10) → (1,2).
    expect(out.walls[0].start).toEqual({ x: 1, y: 2 });
    expect(out.walls[0].end).toEqual({ x: 5, y: 2 });
    expect(out.openings[0].position).toEqual({ x: 3, y: 2 });
    // After alignment the upper floor's bounds centre matches the ground centre.
    const c = boundsCentre(recomputeBounds(out.walls, out.rooms));
    expect(c.x).toBeCloseTo(groundCentre.x, 6);
    expect(c.y).toBeCloseTo(groundCentre.y, 6);
  });

  it("leaves coordinates untouched when no ground centre is given", () => {
    const out = prepareStorey(upperFloorAtOffset(), 1, null);
    expect(out.walls[0].start).toEqual({ x: 10, y: 10 });
  });
});

describe("recomputeBounds", () => {
  it("unions wall endpoints and room vertices across storeys", () => {
    const ground = recomputeBounds(
      [
        {
          id: "g",
          start: { x: 0, y: 0 },
          end: { x: 6, y: 0 },
          thickness: 0.09,
          type: "external",
        },
      ],
      [
        {
          id: "gr",
          name: "L",
          polygon: [
            { x: 0, y: 0 },
            { x: 6, y: 0 },
            { x: 6, y: 8 },
            { x: 0, y: 8 },
          ],
          area_m2: 48,
          floor_level: 0,
        },
      ],
    );
    expect(ground).toEqual({
      min: { x: 0, y: 0 },
      max: { x: 6, y: 8 },
      width: 6,
      depth: 8,
    });
  });

  it("returns a zero box for an empty layout", () => {
    expect(recomputeBounds([], [])).toEqual({
      min: { x: 0, y: 0 },
      max: { x: 0, y: 0 },
      width: 0,
      depth: 0,
    });
  });
});
