// Copyright 2023 Im-Beast. MIT license.

// Axes, ticks and legends: the labels that turn a shape into a reading.
//
// Every renderer here draws a chart and none of them draws a scale, so until
// now a reader could see that a signal rose without seeing what it rose to.
// This is deliberately a separate layer rather than something each renderer
// grew: a tile two rows tall cannot afford an axis and must not be given one,
// so who pays for it is the caller's decision, and the caller is the only one
// who knows how much room is left.
//
// Nothing here shrinks anything. A caller measures the gutter, subtracts it,
// and draws the chart in what remains — an axis that silently took two columns
// from the chart it labels would be the one bug this layer must not have.

import type { Rectangle } from "../types.ts";
import type { Rgb } from "../theme_expressions.ts";
import { type VizCell, writeText } from "./render.ts";
import type { VisualizationTheme } from "./theme.ts";
import type { Domain } from "./scale.ts";

/**
 * Round values spanning a domain, for tick labels a person can read.
 *
 * `0, 25, 50, 75, 100` rather than `0, 23.7, 47.4, …`: an axis exists to be
 * read off, and arbitrary numbers on it are harder to read than none at all.
 */
export function niceTicks(domain: Domain, count = 4): number[] {
  const span = domain.max - domain.min;
  if (!Number.isFinite(span) || span === 0 || count < 2) return [domain.min];
  const rough = span / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  // Rounded to the nearest nice step rather than up to the next one. Rounding
  // up turns a request for four ticks over 20..97 into a single tick at 50,
  // because the step overshoots the span.
  const nice = [1, 2, 2.5, 5, 10];
  const step =
    nice.reduce((best, candidate) =>
      Math.abs(candidate - normalized) < Math.abs(best - normalized) ? candidate : best
    ) * magnitude;
  const first = Math.ceil(domain.min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= domain.max + step * 1e-9; value += step) {
    // Rounded because repeated addition of a step like 0.1 accumulates error
    // and prints 0.30000000000000004 on an axis.
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks.length > 0 ? ticks : [domain.min, domain.max];
}

export interface ValueAxisOptions {
  readonly theme: VisualizationTheme;
  readonly domain: Domain;
  readonly ticks?: number;
  readonly format?: (value: number) => string;
}

/** How many columns a value axis for this domain will want. */
export function valueAxisWidth(options: ValueAxisOptions): number {
  const format = options.format ?? ((value: number) => String(value));
  const widest = Math.max(...niceTicks(options.domain, options.ticks ?? 4).map((tick) => format(tick).length));
  // One column for the tick marks themselves.
  return Math.min(12, widest + 1);
}

/**
 * A labelled value axis down the left of `rect`.
 *
 * `rect` is the axis gutter, not the chart: its height must match the chart's,
 * because a tick is placed by where its value falls in that height.
 */
export function drawValueAxis(frame: VizCell[][], rect: Rectangle, options: ValueAxisOptions): void {
  const { theme, domain } = options;
  const format = options.format ?? ((value: number) => String(value));
  const span = domain.max - domain.min;
  if (rect.height <= 0 || rect.width <= 0) return;
  for (const tick of niceTicks(domain, options.ticks ?? 4)) {
    const fraction = span === 0 ? 0 : (tick - domain.min) / span;
    const row = rect.row + Math.round((1 - fraction) * (rect.height - 1));
    const text = format(tick);
    // Right-aligned against the tick mark, so the digits line up down the axis
    // however many of them each label has.
    writeText(frame, rect.column + rect.width - 1 - text.length, row, text, {
      foreground: theme.axis,
      background: theme.background,
    });
    writeText(frame, rect.column + rect.width - 1, row, "┤", {
      foreground: theme.grid,
      background: theme.background,
    });
  }
}

export interface TimeAxisOptions {
  readonly theme: VisualizationTheme;
  /** Labels left to right; as many as fit are drawn, evenly spaced. */
  readonly labels: readonly string[];
}

/**
 * A labelled axis along one row.
 *
 * Labels are dropped rather than truncated when they will not all fit: half a
 * timestamp is worse than no timestamp, and evenly spaced survivors still say
 * which way time runs.
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
 * The companion to the overlay and the status grid: a chart that distinguishes
 * its series by colour is unreadable without one, and that was true of every
 * multi-series view here until this existed.
 */
export function drawLegend(
  frame: VizCell[][],
  rect: Rectangle,
  entries: readonly LegendEntry[],
  theme: VisualizationTheme,
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
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
