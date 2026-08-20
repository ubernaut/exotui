// Copyright 2023 Im-Beast. MIT license.

// What a visualisation produces: a grid of styled cells.
//
// Cells rather than escape sequences, because that is the boundary the rest of
// this library keeps — a renderer describes what it wants drawn and a sink
// turns it into ANSI, a browser canvas, or a test buffer. A visualisation that
// reached for `\x1b[` would work in exactly one of those.

import type { Rgb } from "../theme_expressions.ts";
import type { DataKind } from "./data.ts";
import type { VisualizationTheme } from "./theme.ts";
import type { VizDataShape } from "./fit.ts";

export interface VizCell {
  readonly char: string;
  readonly foreground?: Rgb;
  readonly background?: Rgb;
}

/** A rendered visualisation: rows of cells, top row first. */
export type VizFrame = readonly (readonly VizCell[])[];

export interface VizSize {
  readonly width: number;
  readonly height: number;
}

/** Everything a renderer is given besides its data. */
export interface VizContext {
  readonly size: VizSize;
  readonly theme: VisualizationTheme;
  /** A fixed domain, when the caller knows one; otherwise the renderer scales to the data. */
  readonly domain?: { readonly min: number; readonly max: number };
  /** Optional label drawn by renderers that have room for one. */
  readonly label?: string;
  /**
   * A name per entry, for renderers that identify what they are drawing.
   *
   * Supplied by the caller because only it knows whether entry three is `cpu3`,
   * `eth0` or `440 Hz`. A renderer that has room falls back to the index, which
   * is what a rack of cores did before anyone could tell it their names.
   */
  readonly labels?: readonly string[];
  /**
   * How a value becomes text, for the renderers that show one. Supplied by the
   * caller because only it knows whether a number is a percentage, a byte rate
   * or a temperature.
   */
  readonly format?: (value: number) => string;
}

/**
 * One visualisation.
 *
 * `accepts` is the contract: a renderer declares the kind it draws, and the
 * registry refuses to hand it anything else. That is what makes it safe to
 * point a per-core CPU stream and an audio-band stream at the same renderer —
 * both are `1dt`, and neither knows what the other means.
 */
export interface Visualization<Input> {
  readonly id: string;
  readonly label: string;
  /**
   * The kind, or kinds, this draws.
   *
   * More than one where the same picture answers more than one shape of
   * question: a psychograph of one series over time and of several series at
   * once are the same chart, and splitting them into two visualisations would
   * make a caller choose between them by name rather than by data.
   */
  readonly accepts: DataKind | readonly DataKind[];
  /** Smallest size that draws something readable, whatever the data. */
  readonly minimum: VizSize;
  /**
   * Columns and rows one entry of the data wants. A bar chart wants a column
   * each, a rack a row each; a sparkline wants nothing extra because it draws
   * history rather than entries. This is what makes eighty-eight cores and four
   * cores different questions.
   */
  readonly perEntry?: { readonly columns?: number; readonly rows?: number; readonly cells?: number };
  /**
   * Entries below which this stops being the thing it is — a spectrogram of two
   * bands is two coloured slabs. Field renderers set it; a bar chart of two bars
   * is still a bar chart, so most do not.
   */
  readonly minimumEntries?: number;
  /** Preference among equals: higher is richer, and wins where both fit. */
  readonly weight?: number;
  /**
   * Whether this data is the kind this draws at all, beyond its rank.
   *
   * Rank says a scatter and a heatmap both take a matrix; it cannot say that a
   * scatter wants rows of two numbers and a heatmap wants a dense field. A
   * renderer that answers false is not ranked rather than ranked badly, because
   * "wrong shape" is not a degree of fit.
   */
  readonly suits?: (shape: VizDataShape) => boolean;
  render(input: Input, context: VizContext): VizFrame;
}

/** An empty frame of the requested size, which every renderer starts from. */
export function blankFrame(size: VizSize, fill: VizCell = { char: " " }): VizCell[][] {
  const width = Math.max(0, Math.floor(size.width));
  const height = Math.max(0, Math.floor(size.height));
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

/**
 * Drops the background from cells painted in one particular colour.
 *
 * Every renderer here fills its frame with the theme's ground, which is right
 * when the application owns the screen and wrong when something is composited
 * behind it: a terminal cell carrying an explicit background is opaque by
 * definition, so a host blending a desktop through a window has nothing to work
 * with. Removing the ground afterwards keeps the renderers simple, and costs
 * one pass — which pays for itself, because a blank cell with no background
 * produces no draw object at all.
 */
export function groundless(frame: VizCell[][], ground: Rgb): VizCell[][] {
  for (const row of frame) {
    for (let column = 0; column < row.length; column += 1) {
      const cell = row[column]!;
      const background = cell.background;
      if (!background) continue;
      if (background[0] !== ground[0] || background[1] !== ground[1] || background[2] !== ground[2]) continue;
      row[column] = cell.foreground ? { char: cell.char, foreground: cell.foreground } : { char: cell.char };
    }
  }
  return frame;
}

/** Writes text into a frame, clipped to its bounds. */
export function writeText(
  frame: VizCell[][],
  column: number,
  row: number,
  text: string,
  style: { readonly foreground?: Rgb; readonly background?: Rgb } = {},
): void {
  const line = frame[row];
  if (!line) return;
  for (let index = 0; index < text.length; index += 1) {
    const at = column + index;
    if (at < 0 || at >= line.length) continue;
    line[at] = { char: text[index]!, ...style };
  }
}

/** The frame as plain rows of text, which is what a test asserts on. */
export function frameToText(frame: VizFrame): string[] {
  return frame.map((row) => row.map((cell) => cell.char).join(""));
}

/** Whether a size can hold a renderer's minimum. */
export function fits(size: VizSize, minimum: VizSize): boolean {
  return size.width >= minimum.width && size.height >= minimum.height;
}
