// Copyright 2023 Im-Beast. MIT license.

// VIS-003: series render into a plain cell grid so goldens are exact
// strings. Line series connect consecutive present points with Bresenham
// segments; stepped lines go horizontal-then-vertical; areas fill from
// the line down to the baseline; stacked areas accumulate series sums
// bottom-up; scatter plots individual marks. Missing values (y = null)
// break the polyline into a visible gap instead of interpolating across
// it, everything clips to the viewport, and a zero-sized viewport
// renders an empty list rather than crashing. Different series may carry
// different scales into the same viewport — the grid only sees cells.

import { type ContinuousScale, toCell } from "./scales.ts";
import { segmentCells } from "./raster.ts";

/** One series point; null y = missing. */
export interface SeriesPoint {
  readonly x: number;
  readonly y: number | null;
}

/** Supported single-series kinds. */
export type SeriesKind = "line" | "stepped-line" | "area" | "scatter";

/** Render options for one series pass. */
export interface SeriesRenderOptions {
  readonly kind: SeriesKind;
  readonly xScale: ContinuousScale;
  readonly yScale: ContinuousScale;
  readonly width: number;
  readonly height: number;
  readonly glyph?: string;
  /** An existing grid to overlay onto (multi-series / multi-scale). */
  readonly grid?: string[][];
}

function emptyGrid(width: number, height: number): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => " "));
}

function plot(grid: string[][], column: number, row: number, glyph: string): void {
  if (row < 0 || row >= grid.length) return;
  if (column < 0 || column >= (grid[0]?.length ?? 0)) return;
  grid[row]![column] = glyph;
}

function drawSegment(grid: string[][], x0: number, y0: number, x1: number, y1: number, glyph: string): void {
  // The rasteriser lives in raster.ts so `src/viz` draws the same cells this
  // does. Two implementations of "which cells does this line cover" drift, and
  // a chart whose line is one cell off its own axis is a hard bug to see.
  for (const cell of segmentCells({ column: x0, row: y0 }, { column: x1, row: y1 })) {
    plot(grid, cell.column, cell.row, glyph);
  }
}

/** Renders one series onto a (possibly shared) grid; returns lines. */
export function renderSeries(points: readonly SeriesPoint[], options: SeriesRenderOptions): string[] {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));
  if (width === 0 || height === 0) return [];
  const grid = options.grid ?? emptyGrid(width, height);
  const glyph = options.glyph ?? (options.kind === "scatter" ? "●" : options.kind === "area" ? "█" : "·");

  const cells: Array<{ column: number; row: number } | null> = points.map((point) =>
    point.y === null ? null : {
      column: toCell(options.xScale, point.x),
      row: toCell(options.yScale, point.y),
    }
  );

  if (options.kind === "scatter") {
    for (const cell of cells) if (cell) plot(grid, cell.column, cell.row, glyph);
  } else {
    for (let index = 0; index < cells.length; index += 1) {
      const current = cells[index];
      if (!current) continue; // missing: the gap stays visible
      const previous = index > 0 ? cells[index - 1] : null;
      if (!previous) {
        plot(grid, current.column, current.row, glyph);
        continue;
      }
      if (options.kind === "stepped-line") {
        drawSegment(grid, previous.column, previous.row, current.column, previous.row, glyph);
        drawSegment(grid, current.column, previous.row, current.column, current.row, glyph);
      } else {
        drawSegment(grid, previous.column, previous.row, current.column, current.row, glyph);
      }
    }
    if (options.kind === "area") {
      // Fill from each drawn column's topmost mark down to the baseline.
      const baseline = height - 1;
      for (let column = 0; column < width; column += 1) {
        let top = -1;
        for (let row = 0; row < height; row += 1) {
          if (grid[row]![column] === glyph) {
            top = row;
            break;
          }
        }
        if (top < 0) continue;
        for (let row = top; row <= baseline; row += 1) plot(grid, column, row, glyph);
      }
    }
  }
  return grid.map((row) => row.join(""));
}

/** Stacks multiple series bottom-up as cumulative areas. */
export function renderStackedArea(
  seriesList: readonly (readonly SeriesPoint[])[],
  options: Omit<SeriesRenderOptions, "kind" | "grid" | "glyph"> & { readonly glyphs?: readonly string[] },
): string[] {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));
  if (width === 0 || height === 0) return [];
  const glyphs = options.glyphs ?? ["█", "▓", "▒", "░"];
  const grid = emptyGrid(width, height);
  const running = new Map<number, number>();

  const cumulativeSeries = seriesList.map((series) =>
    series.map((point): SeriesPoint => {
      if (point.y === null) return point;
      const total = (running.get(point.x) ?? 0) + point.y;
      running.set(point.x, total);
      return { x: point.x, y: total };
    })
  );
  // Render the TALLEST layer first; lower layers then overwrite their
  // shared bottom region, so each band keeps its own glyph.
  for (let index = cumulativeSeries.length - 1; index >= 0; index -= 1) {
    renderSeries(cumulativeSeries[index]!, {
      kind: "area",
      xScale: options.xScale,
      yScale: options.yScale,
      width,
      height,
      glyph: glyphs[index % glyphs.length]!,
      grid,
    });
  }
  return grid.map((row) => row.join(""));
}
