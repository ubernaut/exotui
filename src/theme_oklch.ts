// Copyright 2023 Im-Beast. MIT license.

// THEM-005: tonal palettes are generated in OKLCH — perceptual lightness
// steps stay perceptual — and every color leaves through GAMUT MAPPING:
// an out-of-gamut request keeps its lightness and hue and reduces chroma
// by binary search until sRGB contains it, so generated colors are in
// gamut by construction. Ladders come as light and dark surface tone
// runs whose extremes are far enough apart that foreground-on-surface
// pairs meet common contrast constraints in truecolor (verified with the
// THEM-004 ratio in tests, not assumed).

import type { Rgb } from "./theme_expressions.ts";

/** One OKLCH color: L in [0,1], C >= 0, H in degrees. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

function oklabToLinearSrgb(l: number, a: number, b: number): [number, number, number] {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
  ];
}

function linearToSrgbChannel(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function inGamut(linear: [number, number, number]): boolean {
  return linear.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
}

function oklchToLinear(color: Oklch): [number, number, number] {
  const radians = (color.h * Math.PI) / 180;
  return oklabToLinearSrgb(color.l, color.c * Math.cos(radians), color.c * Math.sin(radians));
}

/** Is an OKLCH color inside the sRGB gamut? */
export function oklchInGamut(color: Oklch): boolean {
  return inGamut(oklchToLinear(color));
}

/**
 * Converts OKLCH to sRGB with gamut mapping: lightness and hue are kept,
 * chroma reduces by binary search until the color fits.
 */
export function oklchToRgb(color: Oklch): Rgb {
  let mapped = color;
  if (!oklchInGamut(mapped)) {
    let low = 0;
    let high = color.c;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const mid = (low + high) / 2;
      if (oklchInGamut({ ...color, c: mid })) low = mid;
      else high = mid;
    }
    mapped = { ...color, c: low };
  }
  const linear = oklchToLinear(mapped);
  return [
    Math.round(linearToSrgbChannel(linear[0]) * 255),
    Math.round(linearToSrgbChannel(linear[1]) * 255),
    Math.round(linearToSrgbChannel(linear[2]) * 255),
  ];
}

/** One generated tonal palette. */
export interface TonalPalette {
  readonly hue: number;
  /** Tone (OKLCH lightness percentage 0-100) → color. */
  readonly tones: Readonly<Record<number, Rgb>>;
}

/** Standard tone stops (Material-style). */
export const TONAL_STOPS: readonly number[] = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];

/** Generates one tonal palette from a seed hue. */
export function generateTonalPalette(
  hue: number,
  options: { readonly chroma?: number; readonly stops?: readonly number[] } = {},
): TonalPalette {
  const chroma = options.chroma ?? 0.12;
  const tones: Record<number, Rgb> = {};
  for (const stop of options.stops ?? TONAL_STOPS) {
    tones[stop] = oklchToRgb({ l: stop / 100, c: chroma, h: hue });
  }
  return { hue, tones };
}

/** Light/dark surface ladders drawn from one palette's tones. */
export interface SurfaceLadder {
  readonly surface: Rgb;
  readonly surfaceVariant: Rgb;
  readonly onSurface: Rgb;
  readonly onSurfaceMuted: Rgb;
}

/** Builds the light or dark surface ladder from a tonal palette. */
export function surfaceLadder(palette: TonalPalette, scheme: "light" | "dark"): SurfaceLadder {
  const tone = (stop: number) => palette.tones[stop] ?? oklchToRgb({ l: stop / 100, c: 0.02, h: palette.hue });
  return scheme === "light"
    ? {
      surface: tone(99),
      surfaceVariant: tone(90),
      onSurface: tone(10),
      onSurfaceMuted: tone(30),
    }
    : {
      surface: tone(10),
      surfaceVariant: tone(20),
      onSurface: tone(95),
      onSurfaceMuted: tone(80),
    };
}
