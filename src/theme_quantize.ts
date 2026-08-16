// Copyright 2023 Im-Beast. MIT license.

// THEM-006: quantization to ANSI-256, ANSI-16, and monochrome is an
// accounted-for degradation, not a lossy mystery. Every token maps to its
// perceptually nearest target entry (OKLab distance), the report lists
// the per-token error, and CRITICAL roles never silently collapse: when
// two critical tokens land on the same entry the later one moves to its
// next-nearest free entry, and when the target simply cannot separate
// them (monochrome often cannot) the collision is kept visible with a
// fallback marker naming the attribute a renderer should add instead.

import type { Rgb } from "./theme_expressions.ts";

/** Quantization targets. */
export type QuantizeTarget = "ansi256" | "ansi16" | "mono";

/** One token's quantized assignment. */
export interface QuantizedToken {
  readonly token: string;
  /** Palette index (ansi) or mono level index. */
  readonly index: number;
  readonly rgb: Rgb;
  /** Perceptual (OKLab) distance from the original. */
  readonly error: number;
}

/** One collision between critical roles. */
export interface QuantizeCollision {
  readonly tokens: readonly string[];
  /** true when reassignment separated them. */
  readonly resolved: boolean;
  /** Set when unresolvable: the attribute renderers must add. */
  readonly fallbackMarker?: "underline" | "bold" | "invert";
}

/** The quantization report. */
export interface QuantizeReport {
  readonly target: QuantizeTarget;
  readonly assignments: readonly QuantizedToken[];
  readonly collisions: readonly QuantizeCollision[];
  readonly maxError: number;
}

const ANSI16: readonly Rgb[] = [
  [0, 0, 0],
  [205, 49, 49],
  [13, 188, 121],
  [229, 229, 16],
  [36, 114, 200],
  [188, 63, 188],
  [17, 168, 205],
  [229, 229, 229],
  [102, 102, 102],
  [241, 76, 76],
  [35, 209, 139],
  [245, 245, 67],
  [59, 142, 234],
  [214, 112, 214],
  [41, 184, 219],
  [255, 255, 255],
];

function ansi256Palette(): Rgb[] {
  const palette: Rgb[] = [...ANSI16];
  const level = (component: number) => (component === 0 ? 0 : 55 + component * 40);
  for (let cube = 0; cube < 216; cube += 1) {
    palette.push([level(Math.floor(cube / 36)), level(Math.floor(cube / 6) % 6), level(cube % 6)]);
  }
  for (let gray = 0; gray < 24; gray += 1) {
    const value = 8 + gray * 10;
    palette.push([value, value, value]);
  }
  return palette;
}

/** Monochrome "palette": three intensity levels. */
const MONO: readonly Rgb[] = [
  [40, 40, 40], // dim
  [160, 160, 160], // normal
  [255, 255, 255], // bright
];

function rgbToOklab(rgb: Rgb): [number, number, number] {
  const linear = rgb.map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * linear[0] + 0.5363325363 * linear[1] + 0.0514459929 * linear[2]);
  const m = Math.cbrt(0.2119034982 * linear[0] + 0.6806995451 * linear[1] + 0.1073969566 * linear[2]);
  const s = Math.cbrt(0.0883024619 * linear[0] + 0.2817188376 * linear[1] + 0.6299787005 * linear[2]);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** Perceptual distance between two colors (OKLab Euclidean). */
export function perceptualDistance(a: Rgb, b: Rgb): number {
  const [la, aa, ba] = rgbToOklab(a);
  const [lb, ab, bb] = rgbToOklab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

function paletteFor(target: QuantizeTarget): readonly Rgb[] {
  if (target === "ansi256") return ansi256Palette();
  if (target === "ansi16") return ANSI16;
  return MONO;
}

/** Quantizes a semantic palette with collision accounting. */
export function quantizePalette(
  tokens: Readonly<Record<string, Rgb>>,
  target: QuantizeTarget,
  options: { readonly critical?: readonly string[] } = {},
): QuantizeReport {
  const palette = paletteFor(target);
  const critical = options.critical ?? [];
  const ranked = new Map<string, number[]>();
  for (const [token, rgb] of Object.entries(tokens)) {
    const order = palette
      .map((entry, index) => ({ index, distance: perceptualDistance(rgb, entry) }))
      .sort((left, right) => left.distance - right.distance)
      .map((entry) => entry.index);
    ranked.set(token, order);
  }

  const assignments = new Map<string, QuantizedToken>();
  const taken = new Map<number, string>(); // index → critical token holding it
  const collisions: QuantizeCollision[] = [];

  // Critical tokens claim entries first, in declaration order.
  for (const token of critical) {
    const order = ranked.get(token);
    if (!order) continue;
    const free = order.find((index) => !taken.has(index));
    const best = order[0]!;
    if (free === undefined) {
      // Fewer entries than critical tokens: unresolvable, keep visible.
      const holder = taken.get(best)!;
      collisions.push({ tokens: [holder, token], resolved: false, fallbackMarker: "underline" });
      assignments.set(token, {
        token,
        index: best,
        rgb: palette[best]!,
        error: perceptualDistance(tokens[token]!, palette[best]!),
      });
      continue;
    }
    if (free !== best) {
      collisions.push({ tokens: [taken.get(best)!, token], resolved: true });
    }
    taken.set(free, token);
    assignments.set(token, {
      token,
      index: free,
      rgb: palette[free]!,
      error: perceptualDistance(tokens[token]!, palette[free]!),
    });
  }
  // Non-critical tokens take their nearest entry, collisions allowed.
  for (const token of Object.keys(tokens)) {
    if (assignments.has(token)) continue;
    const best = ranked.get(token)![0]!;
    assignments.set(token, {
      token,
      index: best,
      rgb: palette[best]!,
      error: perceptualDistance(tokens[token]!, palette[best]!),
    });
  }

  const ordered = [...assignments.values()];
  return {
    target,
    assignments: ordered,
    collisions,
    maxError: ordered.reduce((max, entry) => Math.max(max, entry.error), 0),
  };
}
