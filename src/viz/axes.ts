// Copyright 2023 Im-Beast. MIT license.

// Painting axes and legends in colour.
//
// The measuring is not done here. `src/visual/axes.ts` already builds a
// collision-free axis layout from a scale — ticks from the scale, labels
// formatted through Intl and measured with the emoji-aware width machinery, and
// deterministic thinning that keeps the first and last tick and grows the
// stride until nothing overlaps. Reimplementing that produced a worse version
// of it, which is what this file used to be.
//
// What is left is what `visual` deliberately does not do: colour. It renders
// into a grid of characters, and a visualisation needs a colour per cell, so
// this takes the layout and paints it.
//
// Deliberately a layer rather than something each renderer grew: a tile two
// rows tall cannot afford an axis and must not be given one, so who pays for it
// is the caller's decision. Nothing here shrinks the chart it labels — a caller
// measures the gutter, subtracts it, and draws in what remains.

import type { Rectangle } from "../types.ts";
import type { Rgb } from "../theme_expressions.ts";
import { type VizCell, writeText } from "./render.ts";
import type { VisualizationTheme } from "./theme.ts";
import type { Domain } from "./scale.ts";
import { type AxisLayout, buildAxis } from "../visual/axes.ts";
import { linearScale } from "../visual/scales.ts";

export interface ValueAxisOptions {
  readonly theme: VisualizationTheme;
  readonly domain: Domain;
  /** Ticks to aim for before thinning; the layout may keep fewer. */
  readonly ticks?: number;
  readonly format?: (value: number) => string;
}

function layoutFor(options: ValueAxisOptions, rows: number): AxisLayout {
  // The range runs high row to low row because a chart's row 0 is its top.
  const scale = linearScale([options.domain.min, options.domain.max], [Math.max(0, rows - 1), 0]);
  return buildAxis(scale, {
    orientation: "y",
    ...(options.format ? { format: options.format } : {}),
    ...(options.ticks === undefined ? {} : { tickCount: options.ticks }),
  });
}

/** How many columns a value axis for this domain will want, tick mark included. */
export function valueAxisWidth(options: ValueAxisOptions, rows = 8): number {
  return Math.min(12, layoutFor(options, rows).gutterCells + 1);
}

/**
 * A labelled value axis down the left of `rect`.
 *
 * `rect` is the axis gutter, not the chart: its height must match the chart's,
 * because a tick is placed by where its value falls in that height.
 */
export function drawValueAxis(frame: VizCell[][], rect: Rectangle, options: ValueAxisOptions): void {
  if (rect.height <= 0 || rect.width <= 0) return;
  const { theme } = options;
  for (const tick of layoutFor(options, rect.height).ticks) {
    const row = rect.row + tick.cell;
    // Right-aligned against the tick mark, so the digits line up down the axis
    // however many of them each label has.
    writeText(frame, rect.column + rect.width - 1 - tick.labelCells, row, tick.label, {
      foreground: theme.axis,
      background: theme.background,
    });
    writeText(frame, rect.column + rect.width - 1, row, "┤", {
      foreground: theme.grid,
      background: theme.background,
    });
  }
}

/** The rows a value axis marks, for a caller drawing grid lines behind its chart. */
export function valueAxisGridRows(options: ValueAxisOptions, rows: number): number[] {
  return [...layoutFor(options, rows).gridCells];
}

export interface TimeAxisOptions {
  readonly theme: VisualizationTheme;
  /** Labels left to right; as many as fit are drawn, evenly spaced. */
  readonly labels: readonly string[];
}

/**
 * A labelled axis along one row.
 *
 * Labels rather than a scale, because the thing along the bottom of a live
 * chart is usually not a number — "-2m", "now", a hostname. Dropped rather than
 * truncated when they will not all fit: half a timestamp is worse than no
 * timestamp, and evenly spaced survivors still say which way time runs.
 */
export function drawTimeAxis(frame: VizCell[][], rect: Rectangle, options: TimeAxisOptions): void {
  const { theme, labels } = options;
  if (rect.width <= 0 || labels.length === 0) return;
  const widest = Math.max(...labels.map((label) => label.length));
  const room = Math.max(1, Math.floor(rect.width / (widest + 2)));
  const shown = Math.min(labels.length, room);
  for (let index = 0; index < shown; index += 1) {
    const at = shown === 1 ? 0 : index / (shown - 1);
    const label = labels[Math.round(at * (labels.length - 1))]!;
    // The first label starts at the edge and the last ends at it, so the axis
    // spans exactly the chart it belongs to.
    const column = rect.column + Math.round(at * (rect.width - label.length));
    writeText(frame, column, rect.row, label, { foreground: theme.axis, background: theme.background });
  }
}

export interface LegendEntry {
  readonly label: string;
  readonly colour: Rgb;
}

/**
 * A swatch and a name per entry, wrapped to fit.
 *
 * The companion to the psychograph and the overlay: a chart that distinguishes
 * its series by colour is unreadable without one.
 */
export function drawLegend(
  frame: VizCell[][],
  rect: Rectangle,
  entries: readonly LegendEntry[],
  theme: VisualizationTheme,
): void {
  if (rect.width <= 0 || rect.height <= 0 || entries.length === 0) return;
  const widest = Math.max(...entries.map((entry) => entry.label.length)) + 3;
  const perRow = Math.max(1, Math.floor(rect.width / widest));
  for (let index = 0; index < entries.length; index += 1) {
    const row = rect.row + Math.floor(index / perRow);
    if (row >= rect.row + rect.height) break;
    const column = rect.column + (index % perRow) * widest;
    const entry = entries[index]!;
    writeText(frame, column, row, "▪", { foreground: entry.colour, background: theme.background });
    writeText(frame, column + 2, row, entry.label.slice(0, widest - 3), {
      foreground: theme.foreground,
      background: theme.background,
    });
  }
}
