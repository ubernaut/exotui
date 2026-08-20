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
import { type CellPoint, polylineCells, segmentCells } from "../visual/raster.ts";
import {
  type GlyphCapabilities,
  type MarkBackend,
  MarkCanvas,
  markGeometry,
  resolveMarkBackend,
} from "../visual/marks.ts";

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
 * The glyph a segment of this slope should be drawn with.
 *
 * A wireframe drawn with one character is a wall of that character: the eye
 * reads texture rather than direction. Four glyphs is enough to tell a ridge
 * from a valley, and it costs nothing.
 */
export function lineGlyph(from: { column: number; row: number }, to: { column: number; row: number }): string {
  const across = to.column - from.column;
  const down = to.row - from.row;
  if (Math.abs(across) >= Math.abs(down) * 2) return "─";
  if (Math.abs(down) >= Math.abs(across) * 2) return "│";
  return (across > 0) === (down > 0) ? "╲" : "╱";
}

/** Pass as the glyph to have each segment pick its own from its slope. */
export const AUTO_GLYPH = "auto";

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
  const glyph = char === AUTO_GLYPH ? lineGlyph(from, to) : char;
  // The rasteriser is `src/visual`'s, so a line drawn here covers exactly the
  // cells a series drawn there does.
  for (const cell of segmentCells(from, to)) plot(frame, cell.column, cell.row, glyph, style);
}

/**
 * A polyline through a series of points.
 *
 * The shape a trace or an overlaid series wants: joined, so the eye follows one
 * line rather than assembling a scatter.
 */
export function drawPath(
  frame: VizCell[][],
  points: readonly CellPoint[],
  char: string,
  style: DrawStyle = {},
): void {
  if (points.length === 0) return;
  if (char !== AUTO_GLYPH) {
    for (const cell of polylineCells(points)) plot(frame, cell.column, cell.row, char, style);
    return;
  }
  // Auto glyphs are per segment, so the path has to be walked segment by
  // segment rather than rasterised in one pass.
  if (points.length === 1) plot(frame, points[0]!.column, points[0]!.row, "─", style);
  for (let index = 1; index < points.length; index += 1) {
    drawLine(frame, points[index - 1]!, points[index]!, AUTO_GLYPH, style);
  }
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
 * Sub-cell plotting, at whatever resolution the terminal supports.
 *
 * A cell is one character, but a braille cell can light eight dots
 * independently — so a scatter or a cloud gets eight times the resolution the
 * grid suggests. The dot space, the backends and the capability degradation are
 * `src/visual`'s `MarkCanvas`; what this adds is the one thing a mark canvas
 * cannot express, which is that a cell has a colour.
 *
 * Colour is per cell because a terminal cell has one, however many dots it
 * holds: the last dot lit in a cell decides it. For a scatter that is a
 * reasonable rule and for two overlapping series it is a visible one, which is
 * why the renderers that care draw a crossing instead.
 */
export class DotPainter {
  readonly #canvas: MarkCanvas;
  readonly #colours = new Map<number, Rgb>();
  readonly #backend: MarkBackend;
  readonly #dots: { readonly x: number; readonly y: number };
  readonly #cells: { readonly width: number; readonly height: number };

  constructor(
    size: { readonly width: number; readonly height: number },
    options: { readonly backend?: MarkBackend; readonly capabilities?: GlyphCapabilities } = {},
  ) {
    // Resolved first, because the dot space has to be sized for the backend
    // that will actually rasterise it. A space scaled for braille rendered
    // through quadrants is twice as many rows as the frame has.
    const { backend } = resolveMarkBackend(
      options.backend ?? "braille",
      options.capabilities ?? { braille: true, sextants: true, quadrants: true },
    );
    this.#backend = backend;
    this.#dots = markGeometry(backend);
    this.#cells = { width: Math.max(1, size.width), height: Math.max(1, size.height) };
    this.#canvas = new MarkCanvas({
      width: this.#cells.width * this.#dots.x,
      height: this.#cells.height * this.#dots.y,
    });
  }

  /** Dots across and down the whole area, for a caller scaling its data to it. */
  get resolution(): { readonly width: number; readonly height: number } {
    return { width: this.#cells.width * this.#dots.x, height: this.#cells.height * this.#dots.y };
  }

  get backend(): MarkBackend {
    return this.#backend;
  }

  /** Lights one dot, in dot coordinates. */
  plot(x: number, y: number, colour?: Rgb): void {
    this.#canvas.plot(x, y);
    if (!colour) return;
    const cell = Math.floor(y / this.#dots.y) * this.#cells.width + Math.floor(x / this.#dots.x);
    this.#colours.set(cell, colour);
  }

  /** Writes the rasterised dots into a frame, at an offset. */
  paint(frame: VizCell[][], at: CellPoint = { column: 0, row: 0 }, style: DrawStyle = {}): void {
    const { lines } = this.#canvas.render(this.#backend, { braille: true, sextants: true, quadrants: true });
    for (let row = 0; row < lines.length; row += 1) {
      const line = lines[row]!;
      for (let column = 0; column < line.length; column += 1) {
        const glyph = line[column]!;
        if (glyph === " ") continue;
        const colour = this.#colours.get(row * this.#cells.width + column) ?? style.foreground;
        plot(frame, at.column + column, at.row + row, glyph, {
          ...style,
          ...(colour ? { foreground: colour } : {}),
        });
      }
    }
  }
}
