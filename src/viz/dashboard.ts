// Copyright 2023 Im-Beast. MIT license.

// Chrome for a screen of charts: borders, titles, readings, and compositing.
//
// A tile's frame is drawn as cells rather than mounted as components, for the
// same reason its chart is: a component carries one style, and a title that
// wants an accent beside a reading that wants the value's colour, set into a
// border in a third, is three colours on one row. Composing the whole screen as
// cells also makes it a pure function of state, testable without a terminal.

import type { Rgb } from "../theme_expressions.ts";
import type { Rectangle } from "../types.ts";
import { blankFrame, type VizCell, type VizFrame, writeText } from "./render.ts";
import { rampGradient, type VisualizationTheme } from "./theme.ts";

const BORDER = {
  horizontal: "─",
  vertical: "│",
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
} as const;

/** Copies a frame into another at an offset, clipped to the target. */
export function blitFrame(target: VizCell[][], at: { column: number; row: number }, source: VizFrame): void {
  for (let row = 0; row < source.length; row += 1) {
    const line = target[at.row + row];
    if (!line) continue;
    const cells = source[row]!;
    for (let column = 0; column < cells.length; column += 1) {
      const into = at.column + column;
      if (into < 0 || into >= line.length) continue;
      line[into] = cells[column]!;
    }
  }
}

export interface TileChromeOptions {
  readonly theme: VisualizationTheme;
  /** Drawn into the top border, or at the start of the row when unframed. */
  readonly title: string;
  /** The current value as text, drawn opposite the title. Omitted where it will not fit. */
  readonly reading?: string;
  /** Colour for the title. Defaults to the theme's series colour. */
  readonly accent?: Rgb;
}

/**
 * A rounded border with its title and reading set into the top.
 *
 * The title rides the border rather than taking a row inside it. A chart eight
 * rows tall that spends one on a caption is a chart seven rows tall, and the
 * border row is already there.
 */
export function drawTileFrame(frame: VizCell[][], rect: Rectangle, options: TileChromeOptions): void {
  const { theme } = options;
  const { column, row, width, height } = rect;
  if (width <= 1 || height <= 1) return;
  const grid = { foreground: theme.grid, background: theme.background };
  const inner = Math.max(0, width - 2);
  writeText(frame, column, row, `${BORDER.topLeft}${BORDER.horizontal.repeat(inner)}${BORDER.topRight}`, grid);
  writeText(
    frame,
    column,
    row + height - 1,
    `${BORDER.bottomLeft}${BORDER.horizontal.repeat(inner)}${BORDER.bottomRight}`,
    grid,
  );
  for (let index = 1; index < height - 1; index += 1) {
    writeText(frame, column, row + index, BORDER.vertical, grid);
    writeText(frame, column + width - 1, row + index, BORDER.vertical, grid);
  }

  const title = ` ${options.title} `;
  if (width >= title.length + 4) {
    writeText(frame, column + 2, row, title, {
      foreground: options.accent ?? theme.series,
      background: theme.background,
    });
  }
  const reading = options.reading ? ` ${options.reading} ` : "";
  if (reading.length > 0 && width >= title.length + reading.length + 6) {
    writeText(frame, column + width - 2 - reading.length, row, reading, {
      foreground: theme.foreground,
      background: theme.background,
    });
  }
}

export interface TileLabelOptions extends TileChromeOptions {
  /** 0-1, colouring the reading by how busy it is. */
  readonly intensity?: number;
}

/**
 * A tile too small for a border, as one row: what it is, and what it reads.
 *
 * The number is the reason the tile exists, so it is what survives truncation —
 * the label gives up its characters first. This is the floor of the whole
 * layout, and it is why a very small area shows readings rather than nothing.
 */
export function drawTileLabel(frame: VizCell[][], rect: Rectangle, options: TileLabelOptions): void {
  const { theme } = options;
  const { column, row, width } = rect;
  if (width <= 0) return;
  const reading = options.reading ?? "";
  const room = Math.max(0, width - reading.length - 1);
  writeText(frame, column, row, options.title.slice(0, room), {
    foreground: options.accent ?? theme.series,
    background: theme.background,
  });
  if (reading.length > 0 && reading.length <= width) {
    writeText(frame, column + width - reading.length, row, reading, {
      foreground: rampGradient(theme, options.intensity ?? 0),
      background: theme.background,
    });
  }
}

/** A frame of the theme's ground, ready to compose a screen into. */
export function screenFrame(size: { width: number; height: number }, theme: VisualizationTheme): VizCell[][] {
  return blankFrame(size, { char: " ", background: theme.background });
}
