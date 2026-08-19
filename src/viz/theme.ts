// Copyright 2023 Im-Beast. MIT license.

// Visualisation colours, resolved from a theme document exactly as every other
// surface resolves its own — the `viz:*` control tokens, through their fallback
// chains. A theme that has never heard of a chart still paints one, because
// every viz token falls back into the chrome or status tier.

import { resolveControlToken } from "../theme_controls.ts";
import type { Rgb } from "../theme_expressions.ts";

/** The colours a visualisation draws with, already resolved. */
export interface VisualizationTheme {
  readonly background: Rgb;
  readonly foreground: Rgb;
  readonly grid: Rgb;
  readonly axis: Rgb;
  readonly series: Rgb;
  readonly seriesAlt: Rgb;
  /** Calm to alarming, for colouring a value by severity. */
  readonly ramp: readonly [Rgb, Rgb, Rgb];
}

const FALLBACK: VisualizationTheme = Object.freeze({
  background: [16, 18, 24] as Rgb,
  foreground: [220, 226, 240] as Rgb,
  grid: [44, 52, 68] as Rgb,
  axis: [110, 122, 148] as Rgb,
  series: [96, 176, 255] as Rgb,
  seriesAlt: [126, 220, 200] as Rgb,
  ramp: [[90, 200, 120], [230, 180, 70], [230, 90, 90]] as [Rgb, Rgb, Rgb],
});

/**
 * Resolves the viz palette from a theme's tokens.
 *
 * Takes the sparse token map a theme document carries, so a caller can pass
 * either a full theme or the seven core colours and get something coherent
 * back either way.
 */
export function resolveVisualizationTheme(tokens: Readonly<Record<string, Rgb>>): VisualizationTheme {
  const pick = (name: string, spare: Rgb): Rgb => {
    const resolved = resolveControlToken(name, tokens);
    return resolved ? [resolved[0], resolved[1], resolved[2]] : spare;
  };
  return {
    background: pick("viz:background", FALLBACK.background),
    foreground: pick("viz:foreground", FALLBACK.foreground),
    grid: pick("viz:grid", FALLBACK.grid),
    axis: pick("viz:axis", FALLBACK.axis),
    series: pick("viz:series", FALLBACK.series),
    seriesAlt: pick("viz:series-alt", FALLBACK.seriesAlt),
    ramp: [
      pick("viz:calm", FALLBACK.ramp[0]),
      pick("viz:warn", FALLBACK.ramp[1]),
      pick("viz:alarm", FALLBACK.ramp[2]),
    ],
  };
}

/** The palette used when a caller has no theme at all. */
export function defaultVisualizationTheme(): VisualizationTheme {
  return FALLBACK;
}

/**
 * The ramp colour for a 0-1 severity.
 *
 * Reading a number off a chart is slower than seeing it go red, and a ramp
 * named calm/warn/alarm rather than green/amber/red lets a monochrome theme
 * rank values by lightness instead of hue.
 */
export function rampColor(theme: VisualizationTheme, fraction: number): Rgb {
  const clamped = Math.min(1, Math.max(0, fraction));
  const index = Math.min(theme.ramp.length - 1, Math.floor(clamped * theme.ramp.length));
  return theme.ramp[index]!;
}

/** Blends two colours, for gradients between ramp stops. */
export function mixColor(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount));
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

/**
 * How many distinct colours the gradient can produce.
 *
 * A truly continuous gradient gives almost every cell of a heatmap its own
 * colour, and the view layer draws one component per run of identically styled
 * cells — so continuity costs a component per cell, which is the difference
 * between a chart that draws and one that runs out of pool. Thirty-two steps is
 * indistinguishable at a terminal's colour resolution and merges neighbours
 * that differ by a rounding error.
 */
const RAMP_STEPS = 32;

/** A smooth ramp colour: interpolated between stops, quantised to `RAMP_STEPS`. */
export function rampGradient(theme: VisualizationTheme, fraction: number): Rgb {
  const clamped = Math.round(Math.min(1, Math.max(0, fraction)) * RAMP_STEPS) / RAMP_STEPS;
  const span = theme.ramp.length - 1;
  const position = clamped * span;
  const index = Math.min(span - 1, Math.floor(position));
  return mixColor(theme.ramp[index]!, theme.ramp[index + 1]!, position - index);
}
