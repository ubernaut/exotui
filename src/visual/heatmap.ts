// Copyright 2023 Im-Beast. MIT license.

// VIS-004: heatmaps degrade by ORDER, not by accident. Values quantize
// into K ordered levels; each output target renders those levels through
// a palette that is monotone by construction — the exact ramp in
// truecolor, a strictly increasing grayscale run in ANSI-256, an ordered
// four-step gray ladder in ANSI-16, and the ░▒▓█ glyph ramp in
// monochrome — so a larger value NEVER renders as a lower level in any
// depth. Missing cells and out-of-domain outliers are explicit cell
// kinds with their own markers, never silently clamped into the data.

import type { Rgb } from "../theme_expressions.ts";

/** Output depths. */
export type HeatmapTarget = "truecolor" | "ansi256" | "ansi16" | "mono";

/** One rendered heatmap cell. */
export interface HeatmapCell {
  readonly kind: "value" | "missing" | "outlier-low" | "outlier-high";
  /** Quantized level (0..levels-1); -1 for non-value cells. */
  readonly level: number;
  readonly glyph: string;
  /** Foreground color where the target has one. */
  readonly rgb?: Rgb;
}

/** One legend entry, ordered low to high. */
export interface HeatmapLegendEntry {
  readonly level: number;
  readonly glyph: string;
  readonly rgb?: Rgb;
}

/** Render options. */
export interface HeatmapOptions {
  readonly domain: readonly [number, number];
  readonly target: HeatmapTarget;
  /** Quantization levels (default 8). */
  readonly levels?: number;
  /** Truecolor ramp endpoints (default cold blue → hot red). */
  readonly ramp?: readonly [Rgb, Rgb];
}

const MONO_RAMP = [" ", "░", "▒", "▓", "█"];

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** The per-target ordered level palette. */
function levelPalette(target: HeatmapTarget, levels: number, ramp: readonly [Rgb, Rgb]): HeatmapLegendEntry[] {
  const entries: HeatmapLegendEntry[] = [];
  for (let level = 0; level < levels; level += 1) {
    const t = levels === 1 ? 1 : level / (levels - 1);
    if (target === "truecolor") {
      entries.push({ level, glyph: "█", rgb: mixRgb(ramp[0], ramp[1], t) });
    } else if (target === "ansi256") {
      // Grayscale run 232..255 is strictly increasing in luminance.
      const gray = 8 + Math.round(t * 23) * 10;
      entries.push({ level, glyph: "█", rgb: [gray, gray, gray] });
    } else if (target === "ansi16") {
      const ladder: Rgb[] = [[0, 0, 0], [102, 102, 102], [229, 229, 229], [255, 255, 255]];
      entries.push({ level, glyph: "█", rgb: ladder[Math.min(3, Math.floor(t * 4))]! });
    } else {
      entries.push({ level, glyph: MONO_RAMP[Math.min(MONO_RAMP.length - 1, Math.floor(t * MONO_RAMP.length))]! });
    }
  }
  return entries;
}

/** The rendered heatmap. */
export interface HeatmapRender {
  readonly rows: readonly (readonly HeatmapCell[])[];
  /** Ordered legend, low level first. */
  readonly legend: readonly HeatmapLegendEntry[];
  readonly target: HeatmapTarget;
}

/** Renders a value matrix (null = missing) into ordered cells. */
export function renderHeatmap(
  values: readonly (readonly (number | null)[])[],
  options: HeatmapOptions,
): HeatmapRender {
  const levels = Math.max(2, options.levels ?? 8);
  const ramp = options.ramp ?? [[20, 60, 200], [220, 50, 30]] as const;
  const legend = levelPalette(options.target, levels, ramp as [Rgb, Rgb]);
  const [low, high] = options.domain;
  const span = high - low;

  const rows = values.map((row) =>
    row.map((value): HeatmapCell => {
      if (value === null) return { kind: "missing", level: -1, glyph: "·" };
      if (value < low) return { kind: "outlier-low", level: -1, glyph: "▽" };
      if (value > high) return { kind: "outlier-high", level: -1, glyph: "▲" };
      const level = span === 0 ? 0 : Math.min(levels - 1, Math.floor(((value - low) / span) * levels));
      const entry = legend[level]!;
      return { kind: "value", level, glyph: entry.glyph, ...(entry.rgb ? { rgb: entry.rgb } : {}) };
    })
  );
  return { rows, legend, target: options.target };
}
