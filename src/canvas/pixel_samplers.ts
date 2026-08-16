// Copyright 2023 Im-Beast. MIT license.

// 036 G1: pixel-to-cell sampling with ONE grid contract. Every sampler
// answers the same call — RGBA pixels in, a cell grid out — so the
// density-ramp mode (the existing ramps, unchanged and still
// selectable) and the NEW dual-foreground/background 2x2 quadrant mode
// are peers, not forks. The quadrant sampler partitions each cell's
// pixel block by luminance, picks the quadrant glyph whose lit corners
// match, and carries BOTH colors — foreground for the lit partition,
// background for the rest — which is what makes it a separate mode
// rather than a denser ramp. The backend seam pairs a deterministic
// CPU implementation with an optional GPU one under the same contract;
// choosing CPU always names the explicit fallback reason, and the
// frozen limits statement says what the CPU sampler is NOT: it samples
// pixels somebody else rendered — it is not software 3D rendering.

/** The shared sampler input: RGBA pixels, row-major. */
export interface SamplerPixels {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** The shared cell-grid request. */
export interface SamplerGrid {
  readonly columns: number;
  readonly rows: number;
}

/** One sampled cell. */
export interface SampledCell {
  readonly glyph: string;
  readonly foreground: readonly [number, number, number];
  /** Present only in modes that carry a second color. */
  readonly background?: readonly [number, number, number];
}

/** One sampled frame. */
export interface SampledFrame {
  readonly mode: SamplerMode;
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly SampledCell[];
}

/** The sampling modes. */
export type SamplerMode = "density-ramp" | "quadrant";

/** The documented limit statement. */
export const PIXEL_SAMPLER_LIMITS = Object.freeze({
  cpu: "The CPU sampler converts already-rendered pixels to cells deterministically; " +
    "it is not software 3D rendering — scene rendering still requires the selected Three/WebGPU path.",
});

/** The default density ramp, dimmest to brightest (unchanged). */
export const DENSITY_RAMP = " ░▒▓█";

const QUADRANT_GLYPHS = [
  " ",
  "▘",
  "▝",
  "▀",
  "▖",
  "▌",
  "▞",
  "▛",
  "▗",
  "▚",
  "▐",
  "▜",
  "▄",
  "▙",
  "▟",
  "█",
] as const;

function luminance(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

interface BlockStats {
  count: number;
  red: number;
  green: number;
  blue: number;
  lum: number;
}

function sampleBlock(input: SamplerPixels, x0: number, y0: number, x1: number, y1: number): BlockStats {
  const stats: BlockStats = { count: 0, red: 0, green: 0, blue: 0, lum: 0 };
  for (let y = y0; y < y1 && y < input.height; y += 1) {
    for (let x = x0; x < x1 && x < input.width; x += 1) {
      const offset = (y * input.width + x) * 4;
      const red = input.pixels[offset]!;
      const green = input.pixels[offset + 1]!;
      const blue = input.pixels[offset + 2]!;
      stats.count += 1;
      stats.red += red;
      stats.green += green;
      stats.blue += blue;
      stats.lum += luminance(red, green, blue);
    }
  }
  return stats;
}

function meanColor(stats: BlockStats): readonly [number, number, number] {
  if (stats.count === 0) return [0, 0, 0];
  return [
    Math.round(stats.red / stats.count),
    Math.round(stats.green / stats.count),
    Math.round(stats.blue / stats.count),
  ];
}

/** The density-ramp mode: mean luminance picks the ramp glyph. */
export function sampleDensityRamp(
  input: SamplerPixels,
  grid: SamplerGrid,
  ramp: string = DENSITY_RAMP,
): SampledFrame {
  const glyphs = [...ramp];
  const cells: SampledCell[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const x0 = Math.floor(column * input.width / grid.columns);
      const x1 = Math.max(x0 + 1, Math.floor((column + 1) * input.width / grid.columns));
      const y0 = Math.floor(row * input.height / grid.rows);
      const y1 = Math.max(y0 + 1, Math.floor((row + 1) * input.height / grid.rows));
      const stats = sampleBlock(input, x0, y0, x1, y1);
      const level = stats.count === 0 ? 0 : stats.lum / stats.count / 255;
      const glyph = glyphs[Math.min(glyphs.length - 1, Math.floor(level * glyphs.length))]!;
      cells.push({ glyph, foreground: meanColor(stats) });
    }
  }
  return { mode: "density-ramp", columns: grid.columns, rows: grid.rows, cells };
}

/**
 * The quadrant mode: each cell's block splits 2x2; corners brighter
 * than the cell mean are the lit partition, choosing the glyph and the
 * foreground color, while the rest becomes the background color.
 */
export function sampleQuadrants(input: SamplerPixels, grid: SamplerGrid): SampledFrame {
  const cells: SampledCell[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const x0 = Math.floor(column * input.width / grid.columns);
      const x1 = Math.max(x0 + 2, Math.floor((column + 1) * input.width / grid.columns));
      const y0 = Math.floor(row * input.height / grid.rows);
      const y1 = Math.max(y0 + 2, Math.floor((row + 1) * input.height / grid.rows));
      const xMid = Math.floor((x0 + x1) / 2);
      const yMid = Math.floor((y0 + y1) / 2);
      const corners = [
        sampleBlock(input, x0, y0, xMid, yMid), // top-left    bit 1
        sampleBlock(input, xMid, y0, x1, yMid), // top-right   bit 2
        sampleBlock(input, x0, yMid, xMid, y1), // bottom-left bit 4
        sampleBlock(input, xMid, yMid, x1, y1), // bottom-right bit 8
      ];
      const total = corners.reduce((sum, corner) => sum + corner.lum, 0);
      const count = corners.reduce((sum, corner) => sum + corner.count, 0);
      const mean = count === 0 ? 0 : total / count;
      let mask = 0;
      const lit: BlockStats = { count: 0, red: 0, green: 0, blue: 0, lum: 0 };
      const unlit: BlockStats = { count: 0, red: 0, green: 0, blue: 0, lum: 0 };
      for (const [index, corner] of corners.entries()) {
        const bright = corner.count > 0 && corner.lum / corner.count > mean;
        const target = bright ? lit : unlit;
        target.count += corner.count;
        target.red += corner.red;
        target.green += corner.green;
        target.blue += corner.blue;
        target.lum += corner.lum;
        if (bright) mask |= 1 << index;
      }
      // A flat cell (no partition) renders as a full block of its color.
      if (mask === 0 && count > 0 && mean > 0) {
        const all = corners.reduce(
          (sum, corner) => ({
            count: sum.count + corner.count,
            red: sum.red + corner.red,
            green: sum.green + corner.green,
            blue: sum.blue + corner.blue,
            lum: sum.lum + corner.lum,
          }),
          { count: 0, red: 0, green: 0, blue: 0, lum: 0 },
        );
        cells.push({ glyph: "█", foreground: meanColor(all), background: meanColor(all) });
        continue;
      }
      cells.push({
        glyph: QUADRANT_GLYPHS[mask]!,
        foreground: meanColor(lit),
        background: meanColor(unlit),
      });
    }
  }
  return { mode: "quadrant", columns: grid.columns, rows: grid.rows, cells };
}

/** The sampler backend contract shared by CPU and GPU paths. */
export interface SamplerBackend {
  readonly kind: "cpu" | "gpu";
  /** Present exactly when kind is "cpu" because no GPU was usable. */
  readonly fallbackReason?: string;
  sample(input: SamplerPixels, grid: SamplerGrid, mode: SamplerMode): SampledFrame;
}

/** Picks the GPU backend when one is provided; CPU names its reason. */
export function createSamplerBackend(
  options: { readonly gpu?: (input: SamplerPixels, grid: SamplerGrid, mode: SamplerMode) => SampledFrame } = {},
): SamplerBackend {
  if (options.gpu) {
    return { kind: "gpu", sample: options.gpu };
  }
  return {
    kind: "cpu",
    fallbackReason: "no GPU sampler provided; deterministic CPU sampling in use",
    sample: (input, grid, mode) => mode === "quadrant" ? sampleQuadrants(input, grid) : sampleDensityRamp(input, grid),
  };
}
