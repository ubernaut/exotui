// Copyright 2023 Im-Beast. MIT license.

// Rank-2 and above: grids, and the 2D projection of volumetric data.

import { blankFrame, type Visualization, type VizContext, type VizFrame } from "./render.ts";
import { domainOfAll, normalize, resample, safeDomain } from "./scale.ts";
import { drawPath, plotQuadrant } from "./draw.ts";
import { rampGradient } from "./theme.ts";
import type { Matrix, Sample, Volume } from "./data.ts";

const SHADE_GLYPHS = [" ", "░", "▒", "▓", "█"] as const;

/** 2d — a heatmap: one cell per grid value, shaded and coloured by magnitude. */
export const heatmap: Visualization<Matrix> = {
  id: "heatmap",
  label: "Heatmap",
  accepts: "2d",
  minimum: { width: 2, height: 2 },
  render(grid, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || grid.length === 0) return frame;
    const domain = safeDomain(context.domain ?? domainOfAll([grid]));
    for (let row = 0; row < height; row += 1) {
      // Sample the grid rather than requiring it to match the box: a 4x4 grid
      // in a 40x20 box should fill it, not sit in the corner.
      const sourceRow = grid[Math.min(grid.length - 1, Math.floor((row * grid.length) / height))]!;
      for (let column = 0; column < width; column += 1) {
        const sourceColumn = sourceRow.length === 0
          ? 0
          : Math.min(sourceRow.length - 1, Math.floor((column * sourceRow.length) / width));
        const fraction = normalize(sourceRow[sourceColumn] ?? 0, domain);
        const shade = Math.min(SHADE_GLYPHS.length - 1, Math.round(fraction * (SHADE_GLYPHS.length - 1)));
        frame[row]![column] = {
          char: SHADE_GLYPHS[shade]!,
          foreground: rampGradient(context.theme, fraction),
          background: context.theme.background,
        };
      }
    }
    return frame;
  },
};

/**
 * 1dt/2d — a lattice: a stepped profile with a reference line through it.
 *
 * This is the 2D half of the wireframe lattice. The 3D half projects a mesh and
 * needs the Three.js path; this one needs a terminal and nothing else, which is
 * why they are separate visualisations rather than one with a mode flag. A mode
 * flag would drag a renderer dependency into every application that only wanted
 * the flat one.
 */
export const lattice: Visualization<readonly Sample<1>[]> = {
  id: "lattice",
  label: "Lattice (2D)",
  accepts: "1dt",
  minimum: { width: 8, height: 4 },
  perEntry: { columns: 1 },
  // A field of two values is two slabs; a waterfall wants enough entries to
  // have a shape across as well as down.
  minimumEntries: 6,
  weight: 0.9,
  render(samples, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || samples.length === 0) return frame;
    const latest = samples.at(-1)!.value;
    const domain = safeDomain(context.domain ?? domainOfAll([latest]));
    const mid = Math.floor(height / 2);
    // The reference line first, so the profile draws over it.
    for (let column = 0; column < width; column += 1) {
      frame[mid]![column] = { char: "─", foreground: context.theme.grid, background: context.theme.background };
    }
    for (let column = 0; column < width; column += 1) {
      const entry = latest.length === 0 ? 0 : Math.min(latest.length - 1, Math.floor((column * latest.length) / width));
      const fraction = normalize(latest[entry] ?? 0, domain);
      const row = Math.min(height - 1, Math.max(0, Math.round((1 - fraction) * (height - 1))));
      frame[row]![column] = {
        char: "▄",
        foreground: rampGradient(context.theme, fraction),
        background: context.theme.background,
      };
    }
    return frame;
  },
};

/**
 * 3dt — a volume, projected flat by taking the maximum along the depth axis.
 *
 * A terminal cannot show a volume, so something has to be thrown away, and
 * saying which is the honest part: the brightest value along each ray survives,
 * because a monitor is watching for peaks rather than averages.
 */
export const volumeProjection: Visualization<Volume> = {
  id: "volume-projection",
  label: "Volume (max projection)",
  accepts: "3d",
  minimum: { width: 2, height: 2 },
  render(volume, context) {
    const flattened: number[][] = [];
    for (const slice of volume) {
      for (let row = 0; row < slice.length; row += 1) {
        const target = flattened[row] ??= [];
        const source = slice[row]!;
        for (let column = 0; column < source.length; column += 1) {
          const value = source[column] ?? 0;
          if (target[column] === undefined || value > target[column]!) target[column] = value;
        }
      }
    }
    return heatmap.render(flattened, context);
  },
};

/**
 * 2d — several series drawn over one another.
 *
 * The harmonic graph from the demos, with the phase counter replaced by data.
 * Rows of the matrix are series and columns are samples, so this is the answer
 * to "how do these compare" rather than "what is this one doing" — the question
 * every other renderer here answers one series at a time.
 *
 * Each series is a joined path in its own colour. Overlaid rather than stacked
 * because the comparison is the point: stacking makes every series after the
 * first a reading of the sum.
 */
export const overlay: Visualization<Matrix> = {
  id: "overlay",
  label: "Overlay",
  accepts: "2d",
  minimum: { width: 8, height: 4 },
  // Vertical room to tell them apart: six lines in four rows is one line.
  perEntry: { rows: 2 },
  weight: 1,
  render(series, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || series.length === 0) return frame;
    const domain = safeDomain(context.domain ?? domainOfAll(series));
    const palette = [context.theme.series, context.theme.seriesAlt, ...context.theme.ramp];
    for (let index = 0; index < series.length; index += 1) {
      const values = resample(series[index] ?? [], width);
      const colour = palette[index % palette.length]!;
      const points = values.map((value, column) => ({
        column,
        row: Math.min(height - 1, Math.max(0, Math.round((1 - normalize(value, domain)) * (height - 1)))),
      }));
      // A glyph per series as well as a colour, so the chart survives a
      // monochrome terminal and a reader who cannot separate two hues.
      drawPath(frame, points, SERIES_GLYPHS[index % SERIES_GLYPHS.length]!, {
        foreground: colour,
        background: context.theme.background,
      });
    }
    return frame;
  },
};

/** One per series, so colour is not the only thing telling them apart. */
const SERIES_GLYPHS = ["─", "═", "╌", "·", "▪"] as const;

/**
 * 2d — points in a plane, at twice the resolution of the grid.
 *
 * The tactical map from the demos, given coordinates instead of a phase. Rows
 * are points: `[x, y]`, or `[x, y, weight]` to colour them. Rank alone cannot
 * distinguish this from a heatmap — both take a matrix — so it declares the
 * shape it wants and is not offered for anything else.
 *
 * Plotted in quadrants rather than whole cells: a scatter is the one chart
 * where two nearby points landing in the same cell is a loss of information
 * rather than a rounding, and quadrants buy back a factor of four.
 */
export const scatter: Visualization<Matrix> = {
  id: "scatter",
  label: "Scatter",
  accepts: "2d",
  minimum: { width: 8, height: 4 },
  weight: 0.9,
  suits: (shape) => {
    const inner = shape.extent?.[1];
    return inner === undefined || inner === 2 || inner === 3;
  },
  render(points, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || points.length === 0) return frame;
    // Each axis scales to its own data: a scatter whose axes share one domain
    // draws a diagonal line for anything measured in different units.
    const xs = points.map((point) => point[0] ?? 0);
    const ys = points.map((point) => point[1] ?? 0);
    const xDomain = safeDomain(domainOfAll([xs]));
    const yDomain = safeDomain(domainOfAll([ys]));
    const weights = points.map((point) => point[2]);
    const weighted = weights.some((weight) => weight !== undefined);
    const weightDomain = weighted ? safeDomain(context.domain ?? domainOfAll([weights.map((w) => w ?? 0)])) : undefined;
    for (let index = 0; index < points.length; index += 1) {
      const x = normalize(xs[index] ?? 0, xDomain);
      const y = normalize(ys[index] ?? 0, yDomain);
      const heat = weightDomain ? normalize(weights[index] ?? 0, weightDomain) : y;
      plotQuadrant(frame, Math.round(x * (width * 2 - 1)), Math.round((1 - y) * (height * 2 - 1)), {
        foreground: rampGradient(context.theme, heat),
        background: context.theme.background,
      });
    }
    return frame;
  },
};

export const MATRIX_VISUALIZATIONS: readonly Visualization<never>[] = Object.freeze([
  heatmap as unknown as Visualization<never>,
  overlay as unknown as Visualization<never>,
  scatter as unknown as Visualization<never>,
  lattice as unknown as Visualization<never>,
  volumeProjection as unknown as Visualization<never>,
]);
