// Copyright 2023 Im-Beast. MIT license.
import type { MermaidScenePaint } from "./mermaid_scene.ts";
import type { CellPoint } from "../visual/raster.ts";

/** One actual subpixel segment/cell intersection and its segment-parameter interval. */
export interface MermaidStrokeCell extends CellPoint {
  lower: number;
  upper: number;
}

/**
 * Trace the unsnapped segment through half-open cells with bounded lazy work.
 * Snapping endpoints before Bresenham can miss the nearest cell on a long curve.
 * Exact entry/exit parameters also preserve dash phase through clipping.
 */
export function* strokeSegmentCells(from: CellPoint, to: CellPoint): Generator<MermaidStrokeCell> {
  if (![from.column, from.row, to.column, to.row].every(Number.isFinite)) {
    throw new RangeError("Invalid native stroke segment coordinates.");
  }
  let column = Math.round(from.column);
  let row = Math.round(from.row);
  const lastColumn = Math.round(to.column);
  const lastRow = Math.round(to.row);
  const limit = Math.abs(lastColumn - column) + Math.abs(lastRow - row) + 1;
  if (![column, row, lastColumn, lastRow].every(Number.isSafeInteger) || limit > 8_000_000) {
    throw new RangeError("Native stroke segment exceeds its work budget.");
  }
  const dx = to.column - from.column;
  const dy = to.row - from.row;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const deltaX = dx ? 1 / Math.abs(dx) : Infinity;
  const deltaY = dy ? 1 / Math.abs(dy) : Infinity;
  let nextX = dx ? (column + stepX * .5 - from.column) / dx : Infinity;
  let nextY = dy ? (row + stepY * .5 - from.row) / dy : Infinity;
  let lower = 0;
  for (let step = 0; step <= limit; step++) {
    const upper = Math.max(lower, Math.min(1, nextX, nextY));
    yield { column, row, lower, upper };
    if (column === lastColumn && row === lastRow) return;
    const crossX = nextX <= nextY;
    const crossY = nextY <= nextX;
    if (crossX) {
      column += stepX;
      nextX += deltaX;
    }
    if (crossY) {
      row += stepY;
      nextY += deltaY;
    }
    lower = upper;
  }
  throw new RangeError("Native stroke segment failed its traversal budget.");
}

/** Periodic painted intervals in the geometry's local distance units. */
export interface StrokePattern {
  period: number;
  intervals: readonly (readonly [number, number])[];
  offset: number;
}

/** Resolve SVG odd-array repetition, zero patterns, offsets and dash-end caps. */
export function strokePattern(paint: MermaidScenePaint): StrokePattern | undefined {
  if (!Number.isFinite(paint.strokeWidth) || paint.strokeWidth < 0) {
    throw new RangeError("Invalid native stroke width.");
  }
  if (paint.dash.length > 1024) throw new RangeError("Native stroke exceeds its dash-pattern budget.");
  if (paint.dash.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Invalid native stroke dash length.");
  }
  const offset = paint.dashOffset ?? 0;
  if (!Number.isFinite(offset)) throw new RangeError("Invalid native stroke dash offset.");
  const lengths = paint.dash.length % 2 ? [...paint.dash, ...paint.dash] : paint.dash;
  const period = lengths.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(period)) throw new RangeError("Native stroke dash period exceeds its numeric budget.");
  if (!period) return;
  const cap = paint.lineCap === "round" || paint.lineCap === "square" ? Math.max(0, paint.strokeWidth / 2) : 0;
  let distance = 0;
  const intervals: [number, number][] = [];
  for (const [index, length] of lengths.entries()) {
    if (index % 2 === 0 && (length > 0 || cap > 0)) {
      const start = distance - cap;
      const end = distance + length + cap;
      if (end - start >= period) return;
      // Fold caps crossing the cycle boundary back into the periodic domain.
      for (const shift of [-period, 0, period]) {
        const lower = Math.max(0, start + shift);
        const upper = Math.min(period, end + shift);
        if (upper > lower) intervals.push([lower, upper]);
      }
    }
    distance += length;
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  if (merged.length === 1 && merged[0]![0] === 0 && merged[0]![1] === period) return;
  return { period, intervals: merged, offset: modulo(offset, period) };
}

/** Cell projection of an SVG-distance interval, without iterating tiny or offscreen dash cycles. */
export function strokeCoverage(
  pattern: StrokePattern | undefined,
  lower: number,
  upper: number,
): "none" | "solid" | "partial" {
  const fraction = strokePaintFraction(pattern, lower, upper);
  return fraction <= 0 ? "none" : fraction >= 1 - 1e-12 ? "solid" : "partial";
}

/** Painted fraction retains sub-cell dash phase when a binary glyph classification would freeze animation. */
export function strokePaintFraction(pattern: StrokePattern | undefined, lower: number, upper: number): number {
  if (!pattern) return 1;
  if (![lower, upper].every(Number.isFinite) || upper < lower) throw new RangeError("Invalid native stroke distance.");
  const width = upper - lower;
  const start = modulo(lower, pattern.period) + pattern.offset;
  if (!width) {
    const phase = modulo(start, pattern.period);
    return pattern.intervals.some(([left, right]) => phase >= left && phase < right) ? 1 : 0;
  }
  const phase = modulo(start, pattern.period);
  const first = Math.min(width, pattern.period - phase);
  const within = (left: number, right: number): number =>
    pattern.intervals.reduce((sum, [begin, end]) => sum + Math.max(0, Math.min(right, end) - Math.max(left, begin)), 0);
  let painted = within(phase, phase + first);
  const remaining = width - first;
  if (remaining > 0) {
    const tail = remaining % pattern.period;
    const cyclePaint = within(0, pattern.period);
    // Multiplying whole cycles by a potentially tiny period can overflow.
    // Use the painted fraction instead; the work stays O(pattern length).
    painted += (remaining - tail) * (cyclePaint / pattern.period) + within(0, tail);
  }
  return Math.max(0, Math.min(1, painted / width));
}

function modulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}
