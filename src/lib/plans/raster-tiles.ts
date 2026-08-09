import sharp from "sharp";
import { rasterizePdfToPng } from "./dwg-converter";

/**
 * Cut a plan sheet into legible, overlapping image tiles.
 *
 * WHY THIS EXISTS
 * Claude caps image inputs at ~1568px on the long edge — it downsamples
 * anything larger before reading it. An architectural sheet is A1 or A0, so a
 * whole-sheet send squeezes a metre of paper into 1568px and 2mm room labels
 * fall below one pixel. The text is on the sheet; it is destroyed on the way
 * in. Karen's DWG proved it in production on 2026-08-09: the vision call
 * SUCCEEDED and returned ten output tokens — the model's "no legible text"
 * marker — against a drawing covered in text.
 *
 * This is not a new discovery in this repo, which is the point.
 * `build/spatial/sheet-decomposer.ts` recorded it for the 3D path:
 *
 *   "an earlier version sent the PDF natively … each tile is ~100px … at that
 *    scale Claude literally cannot read internal walls … Rendering at 300 DPI
 *    then cropping makes every tile legible."
 *
 * It settled on 450 DPI after 300 blurred internal walls. This module applies
 * the same remedy to TEXT, and deliberately reuses its numbers, its rasteriser
 * (`rasterizePdfToPng` — CloudConvert, server-side; a local rasteriser has a
 * documented history of failing to bundle on Vercel) and its sharp/JPEG shape,
 * so the two can converge later rather than diverge now.
 *
 * The DIFFERENCE from sheet-decomposer: it asks a model where the drawings are
 * and crops to those. Transcription cannot do that — text lives in the title
 * block, the margins, schedules and notes, i.e. exactly the parts a
 * drawing-tile detector discards. So this cuts a plain covering GRID and reads
 * everything, which also costs one fewer model call.
 */

/** Matches sheet-decomposer: 300 DPI blurred detail, ~450 is what worked. */
export const RASTER_DPI = 450;

/** Target tile edge. Sits under Claude's ~1568px ceiling so a tile is read at native scale. */
export const TILE_TARGET_PX = 1400;

/**
 * Tile overlap. A room label or dimension string sitting exactly on a cut would
 * otherwise be split down the middle and transcribed as two fragments.
 */
export const TILE_OVERLAP_PCT = 6;

/**
 * Ceiling on tiles per sheet — each one is a model call.
 *
 * When a sheet would exceed it, tiles are made BIGGER so the whole sheet is
 * still covered. Never fewer tiles over the same grid: dropping tiles would
 * silently stop reading part of the drawing while still reporting a
 * transcription, which is the failure this whole area exists to close.
 */
export const MAX_TILES = 12;

/** At or under this, the sheet is already legible whole — don't pay to cut it up. */
export const SINGLE_TILE_MAX_PX = 1600;

export interface RasterTile {
  data: Buffer;
  mimeType: "image/jpeg";
  /** 1-indexed position in the grid, for labelling and logs. */
  row: number;
  col: number;
}

export interface RasterTilesResult {
  tiles: RasterTile[];
  width: number;
  height: number;
  rows: number;
  cols: number;
  /** True when tiles had to be enlarged past TILE_TARGET_PX to respect MAX_TILES. */
  coarse: boolean;
}

/**
 * Choose a grid that covers the whole image without exceeding MAX_TILES.
 *
 * Pure and exported so the arithmetic — the part that decides whether a sheet
 * is fully covered or quietly half-read — is testable without sharp, a PDF, or
 * a network call.
 */
export function planTileGrid(
  width: number,
  height: number,
  targetPx: number = TILE_TARGET_PX,
  maxTiles: number = MAX_TILES,
): { rows: number; cols: number; tileW: number; tileH: number; coarse: boolean } {
  let cols = Math.max(1, Math.ceil(width / targetPx));
  let rows = Math.max(1, Math.ceil(height / targetPx));
  let coarse = false;

  // Grow the tiles (never drop them) until the grid fits the budget, so the
  // covering stays complete and only the resolution degrades.
  while (cols * rows > maxTiles) {
    coarse = true;
    if (cols >= rows) cols -= 1;
    else rows -= 1;
    if (cols < 1) cols = 1;
    if (rows < 1) rows = 1;
    if (cols === 1 && rows === 1) break;
  }

  return {
    rows,
    cols,
    tileW: Math.ceil(width / cols),
    tileH: Math.ceil(height / rows),
    coarse,
  };
}

/**
 * Rasterise ONE page of PDF at high DPI and cut it into legible JPEG tiles.
 *
 * Never throws. Returns `{ error }` for every unusable outcome so the caller can
 * degrade honestly rather than treat a failure as an empty drawing.
 */
export async function rasterisePageToTiles(
  pagePdf: Buffer,
  opts: { dpi?: number; targetPx?: number; maxTiles?: number } = {},
): Promise<RasterTilesResult | { error: string }> {
  try {
    const raster = await rasterizePdfToPng(pagePdf, opts.dpi ?? RASTER_DPI);
    if ("error" in raster) {
      return { error: `rasterisation failed: ${raster.error}` };
    }

    const meta = await sharp(raster.buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return { error: "raster had zero dimensions" };

    // Already legible whole — cutting it up would only add model calls.
    if (Math.max(width, height) <= SINGLE_TILE_MAX_PX) {
      const whole = await sharp(raster.buffer).jpeg({ quality: 90 }).toBuffer();
      return {
        tiles: [{ data: whole, mimeType: "image/jpeg", row: 1, col: 1 }],
        width,
        height,
        rows: 1,
        cols: 1,
        coarse: false,
      };
    }

    const grid = planTileGrid(
      width,
      height,
      opts.targetPx ?? TILE_TARGET_PX,
      opts.maxTiles ?? MAX_TILES,
    );
    const padX = Math.round((grid.tileW * TILE_OVERLAP_PCT) / 100);
    const padY = Math.round((grid.tileH * TILE_OVERLAP_PCT) / 100);

    const tiles: RasterTile[] = [];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const left = Math.max(0, c * grid.tileW - padX);
        const top = Math.max(0, r * grid.tileH - padY);
        const w = Math.min(width - left, grid.tileW + padX * 2);
        const h = Math.min(height - top, grid.tileH + padY * 2);
        if (w < 8 || h < 8) continue;
        try {
          const data = await sharp(raster.buffer)
            .extract({ left, top, width: w, height: h })
            .jpeg({ quality: 90 })
            .toBuffer();
          tiles.push({ data, mimeType: "image/jpeg", row: r + 1, col: c + 1 });
        } catch (err) {
          // One failed crop must not cost the sheet; the gap is logged, not hidden.
          console.warn(
            `[raster-tiles] tile r${r + 1}c${c + 1} failed to crop:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }

    if (tiles.length === 0) return { error: "no tile could be cropped" };
    if (grid.coarse) {
      console.warn(
        `[raster-tiles] ${width}x${height} needed ${grid.cols}x${grid.rows} tiles to stay within ${opts.maxTiles ?? MAX_TILES}; each tile is coarser than ${opts.targetPx ?? TILE_TARGET_PX}px and fine text may still be unreadable.`,
      );
    }

    return { tiles, width, height, rows: grid.rows, cols: grid.cols, coarse: grid.coarse };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "tiling failed",
    };
  }
}
