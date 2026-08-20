// Copyright 2023 Im-Beast. MIT license.

// Where a line lands on a grid of cells.
//
// Measuring, not drawing: these answer "which cells does this segment cover"
// and say nothing about what to put in them. `series.ts` fills them with a
// glyph; `src/viz` fills them with a coloured cell. Two rasterisers would drift,
// and a chart whose line is one cell off its own axis is a hard bug to see.

/** A cell on the grid. Column across, row down, row 0 at the top. */
export interface CellPoint {
  readonly column: number;
  readonly row: number;
}

/**
 * The cells a straight segment covers, endpoints included.
 *
 * Bresenham, so the run is connected: every step moves one cell, and a caller
 * drawing the result never finds a hole in a steep line.
 */
export function segmentCells(from: CellPoint, to: CellPoint): CellPoint[] {
  const x1 = Math.round(to.column);
  const y1 = Math.round(to.row);
  let x = Math.round(from.column);
  let y = Math.round(from.row);
  const dx = Math.abs(x1 - x);
  const dy = Math.abs(y1 - y);
  const stepX = x < x1 ? 1 : -1;
  const stepY = y < y1 ? 1 : -1;
  let error = dx - dy;
  const cells: CellPoint[] = [];
  // Bounded by the span so a caller passing a non-finite point cannot hang.
  const limit = dx + dy + 1;
  for (let step = 0; step <= limit; step += 1) {
    cells.push({ column: x, row: y });
    if (x === x1 && y === y1) break;
    const doubled = 2 * error;
    if (doubled > -dy) {
      error -= dy;
      x += stepX;
    }
    if (doubled < dx) {
      error += dx;
      y += stepY;
    }
  }
  return cells;
}

/**
 * The cells a polyline covers.
 *
 * Joints are not repeated: each segment after the first drops its start, which
 * is the same cell the previous segment ended on.
 */
export function polylineCells(points: readonly CellPoint[]): CellPoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ column: Math.round(points[0]!.column), row: Math.round(points[0]!.row) }];
  const cells: CellPoint[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const segment = segmentCells(points[index - 1]!, points[index]!);
    cells.push(...(index === 1 ? segment : segment.slice(1)));
  }
  return cells;
}
