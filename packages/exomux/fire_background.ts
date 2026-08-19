// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "@ubernaut/exotui";
import type { ExomuxRgb, ExomuxThemeSpec } from "./model.ts";
import {
  type ExomuxAnimatedBackground,
  type ExomuxBackgroundAdvanceOptions,
  type ExomuxBackgroundCell,
  type ExomuxBackgroundPoint,
  mixExomuxRgb,
} from "./background.ts";

const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const POINTER_LIFETIME_MS = 1_400;
/** Radius, in cells, of the heat bloom the pointer fans into the flames. */
const POINTER_REACH_CELLS = 6;
const POINTER_HEAT = 0.9;

/** Rows nearer the bottom than this fraction carry the ember source. */
const EMBER_BAND = 0.42;
/** Fraction of each cell's heat retained per step; the rest decays as it rises. */
const HEAT_RETAIN = 0.986;
/** Baseline cooling subtracted each step; the flicker rides on top of it. */
const COOL_BASE = 0.018;
const COOL_FLICKER = 0.05;
/** Faint plasma embers scattered above the band so tall windows still catch fire. */
const FLOAT_EMBER = 0.07;
/** A cell dimmer than this is left unpainted so the desktop shows through. */
const MIN_VISIBLE_HEAT = 0.10;

/**
 * Intensity ramp: sparse sparks at the flickering edges, solid block flame in
 * the hot core. Index chosen by heat, so a cell's glyph tracks its temperature.
 */
const FIRE_GLYPHS = [".", ":", "*", "░", "▒", "▓", "█"] as const;

/** One inspection sample of the heat field for deterministic tests. */
export interface ExomuxFireInspection {
  readonly bounds?: Rectangle;
  readonly pointer?: { readonly column: number; readonly row: number };
  /** Mean heat across the field in [0, 1]. */
  readonly meanHeat: number;
  /** Hottest cell value in [0, 1]. */
  readonly maxHeat: number;
  /** Mean heat of the bottom ember row. */
  readonly baseHeat: number;
}

/** Construction options for the fire field. */
export interface ExomuxFireFieldOptions {
  readonly seed?: number;
  /** Scales the ember source; 1 is a lively blaze, lower is a smoulder. */
  readonly intensity?: number;
}

interface FirePointer extends ExomuxBackgroundPoint {
  readonly updatedAt: number;
}

/**
 * Fire-simulation desktop background. A moving plasma drives an ember band along
 * the bottom, and a heat-diffusion cellular automaton carries that heat upward
 * with cooling and flicker, so flame tongues rise and lick the way real fire
 * does — plasma-smooth, but firey. The pointer fans a hot bloom into the field,
 * and windows passed as obstacles become cold voids the flames divert around, so
 * the focused window stays clear while idle ones catch light through the shared
 * overgrowth pass. All colour comes from the theme's danger/warning/text roles.
 */
export class ExomuxFireField implements ExomuxAnimatedBackground {
  readonly #intensity: number;
  #randomState: number;
  #bounds?: Rectangle;
  #width = 0;
  #height = 0;
  #heat = new Float32Array(0);
  #next = new Float32Array(0);
  #obstacles: Rectangle[] = [];
  #obstacleKey?: string;
  #pointer?: FirePointer;
  #lastFrameAt?: number;
  #cells: (ExomuxBackgroundCell | undefined)[][] = [];

  constructor(options: ExomuxFireFieldOptions = {}) {
    this.#intensity = Math.min(1.6, Math.max(0.3, options.intensity ?? 1));
    this.#randomState = (options.seed ?? 0x46_49_52_45) >>> 0;
  }

  setPointer(point: ExomuxBackgroundPoint, now = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = { column: point.column, row: point.row, updatedAt: finite(now, 0) };
  }

  clearPointer(): void {
    this.#pointer = undefined;
  }

  /** Advances the heat field one diffusion step; true whenever it can paint. */
  advance(options: ExomuxBackgroundAdvanceOptions): boolean {
    const bounds = normalizeBounds(options.bounds);
    if (!bounds) return false;
    this.#ensureLayout(bounds);
    if (this.#width === 0 || this.#height === 0) return false;
    const now = finite(options.now, performance.now());
    // The plasma phase is wall-clock based so motion stays smooth regardless of
    // how the host throttles the frame cadence; one diffusion step runs per call.
    const elapsed = this.#lastFrameAt === undefined
      ? FRAME_BASELINE_MS
      : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - this.#lastFrameAt));
    this.#lastFrameAt = now;
    if (elapsed <= 0) return false;
    const seconds = now / 1000;

    this.#syncObstacles(options, bounds);
    this.#diffuse(seconds);
    this.#injectPointer(bounds, now);
    this.#applyObstacles();
    return true;
  }

  /** Maps the heat field to a theme-coloured flame grid. */
  rasterizeCells(
    bounds: Rectangle,
    theme: ExomuxThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>> {
    const normalized = normalizeBounds(bounds);
    if (!normalized) return [];
    this.#ensureLayout(normalized);
    const width = this.#width;
    const height = this.#height;
    this.#ensureCellBuffer(width, height);

    // Cold to hot: ember red, through amber, into a near-white core.
    const ember = mixExomuxRgb(theme.background, theme.danger, 0.85);
    const flame = theme.warning;
    const core = mixExomuxRgb(theme.warning, theme.text, 0.7);

    for (let y = 0; y < height; y += 1) {
      const row = this.#cells[y]!;
      for (let x = 0; x < width; x += 1) {
        const heat = this.#heat[y * width + x]!;
        if (heat < MIN_VISIBLE_HEAT) {
          row[x] = undefined;
          continue;
        }
        row[x] = {
          char: FIRE_GLYPHS[Math.min(FIRE_GLYPHS.length - 1, Math.floor(heat * FIRE_GLYPHS.length))]!,
          foreground: fireColor(heat, ember, flame, core),
          ...(heat > 0.82 ? { bold: true } : {}),
        };
      }
    }
    return this.#cells;
  }

  /** Serializable heat summary for deterministic tests. */
  inspect(): ExomuxFireInspection {
    const total = this.#heat.length;
    let sum = 0;
    let max = 0;
    for (let index = 0; index < total; index += 1) {
      const heat = this.#heat[index]!;
      sum += heat;
      if (heat > max) max = heat;
    }
    let baseSum = 0;
    if (this.#height > 0) {
      const base = (this.#height - 1) * this.#width;
      for (let x = 0; x < this.#width; x += 1) baseSum += this.#heat[base + x]!;
    }
    return {
      bounds: this.#bounds ? { ...this.#bounds } : undefined,
      pointer: this.#pointer ? { column: this.#pointer.column, row: this.#pointer.row } : undefined,
      meanHeat: total > 0 ? sum / total : 0,
      maxHeat: max,
      baseHeat: this.#width > 0 ? baseSum / this.#width : 0,
    };
  }

  #ensureLayout(bounds: Rectangle): void {
    if (this.#bounds?.width === bounds.width && this.#bounds.height === bounds.height) {
      this.#bounds = { ...bounds };
      return;
    }
    this.#bounds = { ...bounds };
    this.#width = bounds.width;
    this.#height = bounds.height;
    this.#heat = new Float32Array(this.#width * this.#height);
    this.#next = new Float32Array(this.#width * this.#height);
    this.#obstacleKey = undefined;
    this.#lastFrameAt = undefined;
  }

  #ensureCellBuffer(width: number, height: number): void {
    if (this.#cells.length === height && this.#cells[0]?.length === width) return;
    this.#cells = Array.from(
      { length: height },
      () => new Array<ExomuxBackgroundCell | undefined>(width).fill(undefined),
    );
  }

  /** One upward heat-diffusion step over the whole field. */
  #diffuse(seconds: number): void {
    const width = this.#width;
    const height = this.#height;
    const heat = this.#heat;
    const next = this.#next;
    const bandStart = Math.floor(height * (1 - EMBER_BAND));
    for (let y = 0; y < height; y += 1) {
      const below = y + 1 < height ? (y + 1) * width : -1;
      const self = y * width;
      for (let x = 0; x < width; x += 1) {
        // Read from the row below so heat rises; the bottom row is source-only.
        let value: number;
        if (below < 0) {
          value = 0;
        } else {
          const left = x > 0 ? heat[below + x - 1]! : heat[below + x]!;
          const right = x + 1 < width ? heat[below + x + 1]! : heat[below + x]!;
          value = HEAT_RETAIN * (0.42 * heat[below + x]! + 0.14 * left + 0.14 * right + 0.30 * heat[self + x]!);
        }
        const cooling = COOL_BASE + COOL_FLICKER * this.#noise(x, y, seconds);
        const source = this.#source(x, y, height, bandStart, seconds);
        next[self + x] = clamp01(value + source - cooling);
      }
    }
    this.#heat = next;
    this.#next = heat;
  }

  /** Plasma-modulated ember source: a hot band at the base, faint sparks above. */
  #source(x: number, y: number, height: number, bandStart: number, seconds: number): number {
    // Moving plasma: overlaid sine waves give drifting hot spots and cool gaps.
    const plasma = 0.42 +
      0.30 * Math.sin(x * 0.28 + seconds * 1.7) +
      0.16 * Math.sin(x * 0.11 - seconds * 1.1) +
      0.12 * Math.sin(x * 0.5 + y * 0.2 + seconds * 2.6);
    const tongue = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(x * 0.6 - seconds * 3.1));
    if (y >= bandStart) {
      // Deeper into the band burns hotter, so the very base is brightest.
      const depth = (y - bandStart) / Math.max(1, height - bandStart);
      return this.#intensity * (0.32 + 0.5 * depth) * clamp01(plasma) * tongue;
    }
    // A little floating heat above the band keeps flames licking up the screen.
    return FLOAT_EMBER * this.#intensity * clamp01(plasma) * clamp01(plasma);
  }

  /** Adds a decaying heat bloom around a recent pointer so flames chase it. */
  #injectPointer(bounds: Rectangle, now: number): void {
    const pointer = this.#pointer;
    if (!pointer) return;
    const age = now - pointer.updatedAt;
    if (age > POINTER_LIFETIME_MS) return;
    const strength = POINTER_HEAT * (1 - age / POINTER_LIFETIME_MS);
    const px = pointer.column - bounds.column;
    const py = pointer.row - bounds.row;
    const width = this.#width;
    const height = this.#height;
    const x0 = Math.max(0, Math.floor(px - POINTER_REACH_CELLS));
    const x1 = Math.min(width - 1, Math.ceil(px + POINTER_REACH_CELLS));
    const y0 = Math.max(0, Math.floor(py - POINTER_REACH_CELLS));
    const y1 = Math.min(height - 1, Math.ceil(py + POINTER_REACH_CELLS));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const distance = Math.hypot(x - px, y - py);
        if (distance > POINTER_REACH_CELLS) continue;
        const falloff = 1 - distance / POINTER_REACH_CELLS;
        const index = y * width + x;
        this.#heat[index] = clamp01(this.#heat[index]! + strength * falloff * falloff);
      }
    }
  }

  #syncObstacles(options: ExomuxBackgroundAdvanceOptions, bounds: Rectangle): void {
    const local: Rectangle[] = [];
    for (const rectangle of options.obstacles ?? []) {
      const normalized = normalizeBounds(rectangle);
      if (!normalized) continue;
      local.push({
        column: normalized.column - bounds.column,
        row: normalized.row - bounds.row,
        width: normalized.width,
        height: normalized.height,
      });
    }
    const key = local
      .map((rectangle) => `${rectangle.column},${rectangle.row},${rectangle.width},${rectangle.height}`)
      .join(";");
    if (key === this.#obstacleKey) return;
    this.#obstacleKey = key;
    this.#obstacles = local;
  }

  /** Forces obstacle regions cold, so flames flow around the focused window. */
  #applyObstacles(): void {
    if (this.#obstacles.length === 0) return;
    const width = this.#width;
    const height = this.#height;
    for (const rectangle of this.#obstacles) {
      const x0 = Math.max(0, rectangle.column);
      const y0 = Math.max(0, rectangle.row);
      const x1 = Math.min(width - 1, rectangle.column + rectangle.width - 1);
      const y1 = Math.min(height - 1, rectangle.row + rectangle.height - 1);
      for (let y = y0; y <= y1; y += 1) {
        this.#heat.fill(0, y * width + x0, y * width + x1 + 1);
      }
    }
  }

  /** Stable per-cell noise in [0, 1); advances slowly with time for flicker. */
  #noise(x: number, y: number, seconds: number): number {
    const t = Math.floor(seconds * 20);
    let hash = Math.imul(x + 0x9e_37_79_b9, 0x85_eb_ca_6b) ^
      Math.imul(y + 0x16_56_67_b1, 0xc2_b2_ae_35) ^
      Math.imul(t + this.#randomState, 0x27_d4_eb_2f);
    hash = Math.imul(hash ^ (hash >>> 15), 0x2_54_5f_49_11 >>> 0);
    return ((hash >>> 0) % 100_000) / 100_000;
  }
}

/** Blends the fire ramp for one heat value: ember → flame → core. */
function fireColor(heat: number, ember: ExomuxRgb, flame: ExomuxRgb, core: ExomuxRgb): ExomuxRgb {
  if (heat < 0.55) return mixExomuxRgb(ember, flame, heat / 0.55);
  if (heat < 0.82) return mixExomuxRgb(flame, core, (heat - 0.55) / 0.27);
  return core;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

function normalizeBounds(value: Rectangle): Rectangle | undefined {
  if (
    !Number.isFinite(value.column) || !Number.isFinite(value.row) ||
    !Number.isFinite(value.width) || !Number.isFinite(value.height)
  ) return undefined;
  const width = Math.floor(value.width);
  const height = Math.floor(value.height);
  if (width <= 0 || height <= 0) return undefined;
  return { column: Math.floor(value.column), row: Math.floor(value.row), width, height };
}
