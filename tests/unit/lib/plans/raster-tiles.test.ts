import { describe, it, expect } from "vitest";
import {
  planTileGrid,
  MAX_TILES,
  TILE_TARGET_PX,
} from "@/lib/plans/raster-tiles";

/**
 * The tile arithmetic, tested pure — no sharp, no CloudConvert, no PDF.
 *
 * This is the part that decides whether a sheet is FULLY covered or quietly
 * half-read. A grid that silently omits the bottom-right of a drawing still
 * returns a plausible transcription, and nothing downstream can tell the
 * difference — the same shape of failure as a plan marked "ready" with nothing
 * in it, which is why the maths is separated out and pinned here.
 */

/** Every grid must cover the whole image; a tile short is a strip never read. */
function covers(width: number, height: number, g: ReturnType<typeof planTileGrid>) {
  return g.cols * g.tileW >= width && g.rows * g.tileH >= height;
}

describe("planTileGrid — the covering is never allowed to be partial", () => {
  it("covers a large architectural sheet", () => {
    const g = planTileGrid(5000, 3500);
    expect(covers(5000, 3500, g)).toBe(true);
  });

  it("covers a whole range of real sheet shapes", () => {
    // A0 landscape, A1 portrait, a square model-space dump, a long panorama.
    for (const [w, h] of [
      [9933, 7016],
      [4960, 7016],
      [6000, 6000],
      [12000, 1200],
      [1200, 12000],
      [1601, 1601],
    ]) {
      const g = planTileGrid(w, h);
      expect(covers(w, h, g), `${w}x${h} must be fully covered`).toBe(true);
    }
  });

  it("never exceeds the tile budget", () => {
    for (const [w, h] of [
      [9933, 7016],
      [20000, 20000],
      [12000, 1200],
    ]) {
      const g = planTileGrid(w, h);
      expect(g.cols * g.rows).toBeLessThanOrEqual(MAX_TILES);
    }
  });

  it("stays within budget by growing tiles, not by dropping them", () => {
    // Dropping tiles would stop reading part of the drawing while still
    // reporting a transcription. Growing them degrades resolution instead,
    // which is visible in the output rather than invisible.
    const g = planTileGrid(20000, 20000);
    expect(g.coarse).toBe(true);
    expect(covers(20000, 20000, g)).toBe(true);
    expect(g.tileW).toBeGreaterThan(TILE_TARGET_PX);
  });

  it("does not flag a comfortable sheet as coarse", () => {
    const g = planTileGrid(2800, 2800);
    expect(g.coarse).toBe(false);
    expect(g.cols * g.rows).toBeLessThanOrEqual(MAX_TILES);
  });

  it("gives a small page a single tile", () => {
    const g = planTileGrid(1000, 800);
    expect(g).toMatchObject({ rows: 1, cols: 1 });
    expect(covers(1000, 800, g)).toBe(true);
  });

  it("keeps tiles near the target on a sheet that fits the budget", () => {
    // The target exists so a tile is read at native scale rather than
    // downscaled again on the way in.
    const g = planTileGrid(4200, 2800);
    expect(g.tileW).toBeLessThanOrEqual(TILE_TARGET_PX);
    expect(g.tileH).toBeLessThanOrEqual(TILE_TARGET_PX);
  });
});
