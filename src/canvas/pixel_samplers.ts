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
export const PIXEL_SAMPLER_LIMITS: Readonly<{ cpu: string }> = Object.freeze({
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

/**
 * 036 G1 (continued): pre-squeeze, aspect correction, capture, and
 * metrics — the comparison-and-instrumentation half of the sampling
 * family, still on the same grid contract.
 */

/**
 * Horizontally pre-squeezes pixels toward the terminal cell aspect —
 * the CPU counterpart of OpenTUI's GPU-only technique, shipped as a
 * repo EXTENSION: the standard sampler path never squeezes.
 */
export function preSqueezePixels(input: SamplerPixels, factor = 2): SamplerPixels {
  const squeeze = Math.max(1, Math.floor(factor));
  const width = Math.max(1, Math.floor(input.width / squeeze));
  const pixels = new Uint8Array(width * input.height * 4);
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0, green = 0, blue = 0, alpha = 0, count = 0;
      for (let source = x * squeeze; source < Math.min((x + 1) * squeeze, input.width); source += 1) {
        const offset = (y * input.width + source) * 4;
        red += input.pixels[offset]!;
        green += input.pixels[offset + 1]!;
        blue += input.pixels[offset + 2]!;
        alpha += input.pixels[offset + 3]!;
        count += 1;
      }
      const target = (y * width + x) * 4;
      pixels[target] = Math.round(red / count);
      pixels[target + 1] = Math.round(green / count);
      pixels[target + 2] = Math.round(blue / count);
      pixels[target + 3] = Math.round(alpha / count);
    }
  }
  return { pixels, width, height: input.height };
}

/** Mean absolute per-channel color error between two frames. */
export function samplerColorError(left: SampledFrame, right: SampledFrame): number {
  const cells = Math.min(left.cells.length, right.cells.length);
  if (cells === 0) return 0;
  let total = 0;
  for (let index = 0; index < cells; index += 1) {
    const a = left.cells[index]!.foreground;
    const b = right.cells[index]!.foreground;
    total += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  }
  return total / (cells * 3);
}

/** Compares the standard sampler with the pre-squeezed extension. */
export function compareSqueezeSamplers(
  input: SamplerPixels,
  grid: SamplerGrid,
  mode: SamplerMode = "density-ramp",
  factor = 2,
): { readonly standard: SampledFrame; readonly preSqueezed: SampledFrame; readonly meanColorError: number } {
  const backend = createSamplerBackend();
  const standard = backend.sample(input, grid, mode);
  const preSqueezed = backend.sample(preSqueezePixels(input, factor), grid, mode);
  return { standard, preSqueezed, meanColorError: samplerColorError(standard, preSqueezed) };
}

/**
 * THE central cell-aspect correction: terminal cells are ~2x taller
 * than wide, so a perspective camera's aspect uses half-height cells.
 * Every call site shares this one function.
 */
export function perspectiveCellAspect(columns: number, rows: number, cellAspectRatio = 0.5): number {
  return (Math.max(1, columns) * cellAspectRatio) / Math.max(1, rows);
}

/**
 * Orthographic correction, shipped as a separate repo extension with
 * its own projection contract: the frustum height scales by the cell
 * aspect so a unit square still lands square on the cell grid.
 */
export function orthographicCellFrustum(
  columns: number,
  rows: number,
  worldWidth: number,
  cellAspectRatio = 0.5,
): { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number } {
  const aspect = perspectiveCellAspect(columns, rows, cellAspectRatio);
  const half = worldWidth / 2;
  return { left: -half, right: half, top: half / aspect, bottom: -half / aspect };
}

/** Sampler statistics for the diagnostics surfaces. */
export function samplerStatistics(frame: SampledFrame): {
  readonly cells: number;
  readonly litCells: number;
  readonly distinctGlyphs: number;
  readonly distinctForegrounds: number;
} {
  const glyphs = new Set<string>();
  const colors = new Set<number>();
  let lit = 0;
  for (const cell of frame.cells) {
    glyphs.add(cell.glyph);
    const [red, green, blue] = cell.foreground;
    colors.add((red << 16) | (green << 8) | blue);
    if (cell.glyph !== " ") lit += 1;
  }
  return { cells: frame.cells.length, litCells: lit, distinctGlyphs: glyphs.size, distinctForegrounds: colors.size };
}

/** Serializes a frame for capture files and fixtures. */
export function captureSampledFrame(frame: SampledFrame): string {
  return JSON.stringify(frame);
}

/** Deterministic pixel fixtures for ramps, quadrants, and full blocks. */
export const SAMPLER_FIXTURES: Readonly<{
  gradient(width?: number, height?: number): SamplerPixels;
  checker(width?: number, height?: number): SamplerPixels;
  solid(value: number, width?: number, height?: number): SamplerPixels;
}> = Object.freeze({
  /** A left-to-right brightness gradient (exercises every ramp glyph). */
  gradient(width = 16, height = 4): SamplerPixels {
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = Math.round(x * 255 / Math.max(1, width - 1));
        const offset = (y * width + x) * 4;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
      }
    }
    return { pixels, width, height };
  },
  /** A diagonal checker (exercises the quadrant corner glyphs). */
  checker(width = 8, height = 8): SamplerPixels {
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const on = (x < width / 2) === (y < height / 2);
        const value = on ? 255 : 0;
        const offset = (y * width + x) * 4;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
      }
    }
    return { pixels, width, height };
  },
  /** A solid frame (exercises full blocks). */
  solid(value: number, width = 4, height = 4): SamplerPixels {
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      pixels[index * 4] = value;
      pixels[index * 4 + 1] = value;
      pixels[index * 4 + 2] = value;
      pixels[index * 4 + 3] = 255;
    }
    return { pixels, width, height };
  },
});
