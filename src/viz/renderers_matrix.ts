// Copyright 2023 Im-Beast. MIT license.

// Rank-2 and above: grids, and the 2D projection of volumetric data.

import { blankFrame, type Visualization, type VizContext, type VizFrame } from "./render.ts";
import { domainOfAll, normalize, resample, safeDomain } from "./scale.ts";
import type { Rgb } from "../theme_expressions.ts";
import { DotPainter } from "./draw.ts";
import { polylineCells } from "../visual/raster.ts";
import { rampGradient, type VisualizationTheme } from "./theme.ts";
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
 * Several series drawn over one another, at sub-cell resolution.
 *
 * The btop CPU graph: one trace per core over the last minute, each in its own
 * colour, drawn in braille dots so sixteen of them can cross without becoming a
 * block. Rows of the matrix are series and columns are samples — or, given a
 * history of vectors, the history is transposed, because a sampler produces
 * "every series at each instant" and a chart wants "one series across all
 * instants".
 *
 * Overlaid rather than stacked: the comparison is the point, and stacking makes
 * every series after the first a reading of the sum.
 *
 * Identity is carried by colour alone, which is the trade a dot backend makes —
 * a braille cell holds eight dots and one colour, so there is no glyph left to
 * vary. Where that trade is wrong, the psychograph draws the same data with a
 * pip per series at cell resolution.
 */
export const overlay: Visualization<Matrix | readonly Sample<1>[]> = {
  id: "overlay",
  label: "Overlay",
  accepts: ["1dt", "2d"],
  minimum: { width: 8, height: 4 },
  // Above the psychograph: at dot resolution it holds more lines legibly, and
  // it is the shape a reader coming from btop expects. The psychograph stays
  // one pin away for the cases where a pip per series matters more.
  weight: 1.05,
  render(input, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || input.length === 0) return frame;
    const series = seriesOf(input);
    if (series.length === 0) return frame;
    const domain = safeDomain(context.domain ?? domainOfAll(series));
    const palette = seriesPalette(context.theme, series.length);
    const dots = new DotPainter(context.size);
    const across = dots.resolution.width;
    const down = dots.resolution.height;
    for (let index = 0; index < series.length; index += 1) {
      const values = resample(series[index]!, across);
      const colour = palette[index]!;
      const points = values.map((value, column) => ({
        column,
        row: Math.min(down - 1, Math.max(0, Math.round((1 - normalize(value, domain)) * (down - 1)))),
      }));
      // Joined in dot space, so a steep edge is a line rather than two dots
      // with a gap between them.
      for (const cell of polylineCells(points)) dots.plot(cell.column, cell.row, colour);
    }
    dots.paint(frame, { column: 0, row: 0 }, { background: context.theme.background });
    return frame;
  },
};

/**
 * Rows of values from either shape a multi-series chart accepts.
 *
 * A history of vectors is transposed; a matrix is already rows of series.
 */
function seriesOf(input: Matrix | readonly Sample<1>[]): number[][] {
  const first = input[0];
  if (first === undefined) return [];
  if (Array.isArray(first)) return (input as Matrix).map((row) => [...row]);
  const samples = input as readonly Sample<1>[];
  const width = Math.max(...samples.map((sample) => sample.value.length));
  return Array.from({ length: width }, (_, entry) => samples.map((sample) => sample.value[entry] ?? 0));
}

/**
 * Distinct colours for `count` series.
 *
 * The theme's own two series colours first, then its ramp, then hues spun round
 * the wheel — sixteen cores need sixteen colours and a theme declares seven.
 */
function seriesPalette(theme: VisualizationTheme, count: number): Rgb[] {
  const named: Rgb[] = [theme.series, theme.seriesAlt, ...theme.ramp];
  if (count <= named.length) return named.slice(0, count);
  const out = [...named];
  for (let index = named.length; index < count; index += 1) {
    // Golden-ratio spacing, so neighbouring series never land on neighbouring
    // hues however many there are.
    out.push(hueToRgb((index * 0.618033988749895) % 1, 0.62, 0.68));
  }
  return out;
}

function hueToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue * 6;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] = sector < 1
    ? [chroma, second, 0]
    : sector < 2
    ? [second, chroma, 0]
    : sector < 3
    ? [0, chroma, second]
    : sector < 4
    ? [0, second, chroma]
    : sector < 5
    ? [second, 0, chroma]
    : [chroma, 0, second];
  const match = lightness - chroma / 2;
  return [
    Math.round((r! + match) * 255),
    Math.round((g! + match) * 255),
    Math.round((b! + match) * 255),
  ];
}

/**
 * 2d — points in a plane, at twice the resolution of the grid.
 *
 * The tactical map from the demos, given coordinates instead of a phase. Rows
 * are points: `[x, y]`, or `[x, y, weight]` to colour them. Rank alone cannot
 * distinguish this from a heatmap — both take a matrix — so it declares the
 * shape it wants and is not offered for anything else.
 *
 * Plotted in sub-cell dots rather than whole cells: a scatter is the one chart
 * where two nearby points landing in the same cell is a loss of information
 * rather than a rounding, and braille buys back a factor of eight — or whatever
 * the terminal supports, which the mark canvas negotiates.
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
    const dots = new DotPainter(context.size);
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
      dots.plot(
        Math.round(x * (dots.resolution.width - 1)),
        Math.round((1 - y) * (dots.resolution.height - 1)),
        rampGradient(context.theme, heat),
      );
    }
    dots.paint(frame, { column: 0, row: 0 }, { background: context.theme.background });
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
