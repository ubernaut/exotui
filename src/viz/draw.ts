// Copyright 2023 Im-Beast. MIT license.

// Drawing into a cell grid: points, lines, arcs, arrows.
//
// Every richer visualisation is built on these — a dial is an arc and a needle,
// a scatter is points, a topology is nodes and lines — and until now the viz
// layer had none of them, so each renderer plotted cell by cell. The versions
// in `app/visualization_primitives.ts` that these are promoted from write plain
// characters into a string matrix; a visualisation needs colour per cell, so
// these take a style and write `VizCell`s.
//
// Coordinates are cell coordinates: column across, row down, row 0 at the top.

import type { Rgb } from "../theme_expressions.ts";
import type { VizCell } from "./render.ts";

export interface DrawStyle {
  readonly foreground?: Rgb;
  readonly background?: Rgb;
}

/** Writes one cell, ignoring anything outside the frame. */
export function plot(frame: VizCell[][], column: number, row: number, char: string, style: DrawStyle = {}): void {
  const line = frame[Math.round(row)];
  if (!line) return;
  const at = Math.round(column);
  if (at < 0 || at >= line.length) return;
  line[at] = { char, ...style };
}

/**
 * A straight line between two cells.
 *
 * Stepped along its longer axis rather than by Bresenham's error term: the
 * result is identical on a grid this coarse and the arithmetic stays readable.
 */
export function drawLine(
  frame: VizCell[][],
  from: { column: number; row: number },
  to: { column: number; row: number },
  char: string,
  style: DrawStyle = {},
): void {
  const steps = Math.max(Math.abs(to.column - from.column), Math.abs(to.row - from.row), 1);
  for (let step = 0; step <= steps; step += 1) {
    const at = step / steps;
    plot(frame, from.column + (to.column - from.column) * at, from.row + (to.row - from.row) * at, char, style);
  }
}

/**
 * A polyline through a series of points.
 *
 * The shape a trace or an overlaid series wants: joined, so the eye follows one
 * line rather than assembling a scatter.
 */
export function drawPath(
  frame: VizCell[][],
  points: readonly { column: number; row: number }[],
  char: string,
  style: DrawStyle = {},
): void {
  for (let index = 1; index < points.length; index += 1) {
    drawLine(frame, points[index - 1]!, points[index]!, char, style);
  }
  if (points.length === 1) plot(frame, points[0]!.column, points[0]!.row, char, style);
}

export interface ArcOptions {
  /** Where the arc starts, in turns: 0 is due right, 0.25 is straight down. */
  readonly from?: number;
  /** Where it ends, in turns. A full ellipse is `from: 0, to: 1`. */
  readonly to?: number;
  /** Colour a point by how far along the arc it is, for a gauge that heats up. */
  readonly styleAt?: (fraction: number) => DrawStyle;
}

/**
 * An elliptical arc.
 *
 * Elliptical rather than circular because a character cell is about twice as
 * tall as it is wide: a circle drawn with equal radii comes out as an upright
 * oval, which is why the dial takes separate radii and callers halve the
 * vertical one.
 */
export function drawArc(
  frame: VizCell[][],
  centre: { column: number; row: number },
  radius: { column: number; row: number },
  char: string,
  options: ArcOptions & DrawStyle = {},
): void {
  const from = options.from ?? 0;
  const to = options.to ?? 1;
  const span = to - from;
  if (span === 0) return;
  // Enough steps that neighbouring points land on adjacent cells at this size.
  const steps = Math.max(8, Math.round(Math.max(radius.column, radius.row) * 8 * Math.abs(span)));
  for (let step = 0; step <= steps; step += 1) {
    const fraction = step / steps;
    const theta = (from + span * fraction) * Math.PI * 2;
    plot(
      frame,
      centre.column + Math.cos(theta) * radius.column,
      centre.row + Math.sin(theta) * radius.row,
      char,
      options.styleAt?.(fraction) ??
        {
          ...(options.foreground ? { foreground: options.foreground } : {}),
          ...(options.background ? { background: options.background } : {}),
        },
    );
  }
}

/** A closed ellipse: an arc all the way round. */
export function drawEllipse(
  frame: VizCell[][],
  centre: { column: number; row: number },
  radius: { column: number; row: number },
  char: string,
  style: DrawStyle = {},
): void {
  drawArc(frame, centre, radius, char, { ...style, from: 0, to: 1 });
}

/** A rectangle outline, one glyph throughout. */
export function drawRect(
  frame: VizCell[][],
  rect: { column: number; row: number; width: number; height: number },
  char: string,
  style: DrawStyle = {},
): void {
  const right = rect.column + rect.width - 1;
  const bottom = rect.row + rect.height - 1;
  for (let column = rect.column; column <= right; column += 1) {
    plot(frame, column, rect.row, char, style);
    plot(frame, column, bottom, char, style);
  }
  for (let row = rect.row; row <= bottom; row += 1) {
    plot(frame, rect.column, row, char, style);
    plot(frame, right, row, char, style);
  }
}

/** Fills a rectangle. */
export function fillRect(
  frame: VizCell[][],
  rect: { column: number; row: number; width: number; height: number },
  char: string,
  style: DrawStyle = {},
): void {
  for (let row = rect.row; row < rect.row + rect.height; row += 1) {
    for (let column = rect.column; column < rect.column + rect.width; column += 1) {
      plot(frame, column, row, char, style);
    }
  }
}

/**
 * Quadrant glyphs, for plotting at twice the resolution of a cell.
 *
 * A cell is one character, but four sub-cells can be lit independently with
 * these — so a scatter or a curve gets 2x2 the resolution the grid suggests.
 * Indexed by a bitmask: 1 top-left, 2 top-right, 4 bottom-left, 8 bottom-right.
 */
export const QUADRANTS: readonly string[] = Object.freeze([
  " ",
  "▘",
  "▝",
  "▀",
  "▖",
  "▌",
  "▞",
  "▛",
  "▗",
  "▚",
  "▐",
  "▜",
  "▄",
  "▙",
  "▟",
  "█",
]);

/** Lights one quadrant of a cell, keeping whatever was already lit there. */
export function plotQuadrant(
  frame: VizCell[][],
  column: number,
  row: number,
  style: DrawStyle = {},
): void {
  const cell = { column: Math.floor(column / 2), row: Math.floor(row / 2) };
  const line = frame[cell.row];
  if (!line || cell.column < 0 || cell.column >= line.length) return;
  const bit = 1 << ((column % 2) + (row % 2) * 2);
  const existing = QUADRANTS.indexOf(line[cell.column]!.char);
  const mask = (existing > 0 ? existing : 0) | bit;
  line[cell.column] = { char: QUADRANTS[mask]!, ...style };
}
