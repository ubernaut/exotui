// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "../../types.ts";
import {
  mixShellRgb,
  type ShellAnimatedBackground,
  type ShellBackgroundAdvanceOptions,
  type ShellBackgroundCell,
  type ShellBackgroundPoint,
} from "./contract.ts";
import type { ShellRgb, ShellThemeSpec } from "../shell_theme.ts";

const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const DEFAULT_POINTER_LIFETIME_MS = 1_500;
const CELL_ROW_ASPECT = 2;
const HORIZON_RATIO = 0.45;
const SUN_WIDTH_RATIO = 0.4;
const SUN_PERIOD_MS = 40_000;
const SUN_PHASE_OFFSET = 0.9;
const STRIPE_CYCLE_ROWS = 4;
const STRIPE_DRIFT_MS_PER_ROW = 1_600;
const GRID_LINE_COUNT = 12;
const GRID_Z_NEAR = 1;
const GRID_Z_SPAN = 6;
const GRID_LINE_SPEED = 0.055;
const RADIAL_SPACING_RATIO = 1 / 12;
const PARALLAX_LIMIT_RATIO = 0.1;
const PARALLAX_EASE = 0.06;
const HAZE_BAND_COUNT = 3;
const HAZE_DRIFT_MS_PER_COLUMN = 1_200;
const STAR_DENSITY = 0.03;

const STAR_GLYPHS: readonly string[] = [".", "·", "˙"];
const RADIAL_GLYPHS = new Set(["░", "▒", "▓"]);

/** Construction options shared by the Shell animated background catalog. */
export interface ShellVaporwaveFieldOptions {
  readonly seed?: number;
  readonly pointerLifetimeMs?: number;
}

/** Terse deterministic state snapshot exposed for tests. */
export interface ShellVaporwaveInspection {
  readonly bounds?: Rectangle;
  readonly time: number;
  readonly parallax: number;
  readonly horizonRow?: number;
  readonly lineDepths: readonly number[];
}

interface VaporwaveStar {
  readonly column: number;
  readonly row: number;
  readonly glyph: number;
  readonly brightness: number;
}

interface VaporwavePointer extends ShellBackgroundPoint {
  readonly updatedAt: number;
}

/**
 * Vaporwave / outrun sunset: a striped half-disc sun rising and setting on the
 * horizon, a starred gradient sky with drifting haze bands, and a perspective
 * grid floor whose horizontal lines continuously rush toward the viewer. All
 * state derives from one LCG so identical seeds and timestamps reproduce
 * identical grids.
 */
export class ShellVaporwaveField implements ShellAnimatedBackground {
  #randomState: number;
  readonly #pointerLifetimeMs: number;
  #bounds?: Rectangle;
  #pointer?: VaporwavePointer;
  #lastFrameAt?: number;
  #time = 0;
  #parallax = 0;
  #lineDepths: number[] = [];
  #stars: VaporwaveStar[] = [];
  #hazeRows: number[] = [];
  #cells: (ShellBackgroundCell | undefined)[][] = [];

  constructor(options: ShellVaporwaveFieldOptions = {}) {
    this.#randomState = (options.seed ?? 0x56_41_50_4f) >>> 0;
    this.#pointerLifetimeMs = Math.max(0, finite(options.pointerLifetimeMs, DEFAULT_POINTER_LIFETIME_MS));
  }

  /** Updates the transient parallax target without coupling it to input routing. */
  setPointer(point: ShellBackgroundPoint, now: number = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = {
      column: point.column,
      row: point.row,
      updatedAt: finite(now, performance.now()),
    };
  }

  clearPointer(): void {
    this.#pointer = undefined;
  }

  /** Advances grid depth, sun/stripe phase, haze drift, and pointer parallax once. */
  advance(options: ShellBackgroundAdvanceOptions): boolean {
    const bounds = normalizeBounds(options.bounds);
    if (!bounds) return false;
    this.#ensureBounds(bounds);
    const now = finite(options.now, performance.now());
    const elapsed = this.#lastFrameAt === undefined
      ? FRAME_BASELINE_MS
      : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - this.#lastFrameAt));
    this.#lastFrameAt = now;
    if (elapsed <= 0) return false;
    const delta = elapsed / FRAME_BASELINE_MS;
    this.#time += elapsed;

    const pointer = this.#pointer && now - this.#pointer.updatedAt <= this.#pointerLifetimeMs
      ? this.#pointer
      : undefined;
    const limit = bounds.width * PARALLAX_LIMIT_RATIO;
    const target = pointer ? clamp(pointer.column - bounds.column - bounds.width / 2, -limit, limit) : 0;
    this.#parallax += (target - this.#parallax) * Math.min(1, PARALLAX_EASE * delta);

    for (let index = 0; index < this.#lineDepths.length; index += 1) {
      let z = this.#lineDepths[index]! - GRID_LINE_SPEED * delta;
      while (z < GRID_Z_NEAR) z += GRID_Z_SPAN;
      this.#lineDepths[index] = z;
    }
    return true;
  }

  /** Paints sky, sun, horizon, and perspective grid into a reused row-major buffer. */
  rasterizeCells(
    bounds: Rectangle,
    theme: ShellThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ShellBackgroundCell | undefined>> {
    const normalized = normalizeBounds(bounds);
    if (!normalized) {
      this.#cells = [];
      return this.#cells;
    }
    this.#ensureBounds(normalized);
    const { width, height } = normalized;
    this.#ensureCellBuffer(width, height);

    const horizonRow = vaporwaveHorizonRow(height);
    const centerColumn = width / 2 + this.#parallax;
    const radiusColumns = clamp(width * SUN_WIDTH_RATIO / 2, 2, Math.max(2, width / 2 - 1));
    const radiusRows = Math.max(2, radiusColumns / CELL_ROW_ASPECT);
    const visible = 0.65 + 0.35 * Math.sin((this.#time / SUN_PERIOD_MS) * Math.PI * 2 + SUN_PHASE_OFFSET);
    const sunCenterRow = horizonRow + (1 - visible) * radiusRows;
    const sunTopRow = Math.max(0, Math.ceil(sunCenterRow - radiusRows));
    const stripeDrift = this.#time / STRIPE_DRIFT_MS_PER_ROW;

    this.#paintSky(theme, width, horizonRow, centerColumn, sunCenterRow, radiusColumns);
    this.#paintSun(
      theme,
      width,
      horizonRow,
      centerColumn,
      sunCenterRow,
      radiusColumns,
      radiusRows,
      sunTopRow,
      stripeDrift,
    );
    this.#paintFloor(theme, width, height, horizonRow, centerColumn);
    return this.#cells;
  }

  inspect(): ShellVaporwaveInspection {
    return {
      ...(this.#bounds ? { bounds: { ...this.#bounds }, horizonRow: vaporwaveHorizonRow(this.#bounds.height) } : {}),
      time: this.#time,
      parallax: this.#parallax,
      lineDepths: [...this.#lineDepths],
    };
  }

  #paintSky(
    theme: ShellThemeSpec,
    width: number,
    horizonRow: number,
    sunColumn: number,
    sunCenterRow: number,
    sunRadiusColumns: number,
  ): void {
    const horizonBlend = mixShellRgb(theme.danger, theme.surface, 0.5);
    const skyColor = (row: number): ShellRgb => {
      const t = horizonRow <= 1 ? 1 : row / (horizonRow - 1);
      return mixShellRgb(theme.background, horizonBlend, 0.45 * Math.pow(t, 1.6));
    };
    for (let row = 0; row < horizonRow; row += 1) {
      const foreground = skyColor(row);
      for (let column = 0; column < width; column += 1) {
        this.#cells[row]![column] = { char: "░", foreground };
      }
    }

    const hazeShift = Math.floor(this.#time / HAZE_DRIFT_MS_PER_COLUMN);
    for (let band = 0; band < this.#hazeRows.length; band += 1) {
      const row = this.#hazeRows[band]!;
      if (row < 0 || row >= horizonRow) continue;
      const foreground = mixShellRgb(skyColor(row), theme.muted, 0.45);
      for (let column = 0; column < width; column += 1) {
        if ((((column + hazeShift + band * 3) % 7) + 7) % 7 >= 5) continue;
        this.#cells[row]![column] = { char: "─", foreground };
      }
    }

    for (const star of this.#stars) {
      if (star.row >= horizonRow || star.column < 0 || star.column >= width) continue;
      const dx = star.column - sunColumn;
      const dy = (star.row - sunCenterRow) * CELL_ROW_ASPECT;
      if (Math.hypot(dx, dy) < sunRadiusColumns * 1.35) continue;
      this.#cells[star.row]![star.column] = {
        char: STAR_GLYPHS[star.glyph] ?? STAR_GLYPHS[0]!,
        foreground: mixShellRgb(skyColor(star.row), theme.muted, 0.35 + 0.45 * star.brightness),
      };
    }
  }

  #paintSun(
    theme: ShellThemeSpec,
    width: number,
    horizonRow: number,
    centerColumn: number,
    centerRow: number,
    radiusColumns: number,
    radiusRows: number,
    topRow: number,
    stripeDrift: number,
  ): void {
    const span = Math.max(1, horizonRow - 1 - topRow);
    for (let row = topRow; row < horizonRow; row += 1) {
      const vertical = (centerRow - row) / radiusRows;
      if (vertical >= 1) continue;
      const halfWidth = radiusColumns * Math.sqrt(Math.max(0, 1 - vertical * vertical));
      if (halfWidth < 0.35) continue;
      const level = horizonRow - row;
      if (sunStripeGap(level, stripeDrift)) continue;
      const gradient = clamp((row - topRow) / span, 0, 1);
      const foreground = mixShellRgb(theme.warning, theme.danger, gradient);
      const bold = gradient < 0.4;
      const rowChar = row === topRow ? "▀" : level > 1 && sunStripeGap(level - 1, stripeDrift) ? "▄" : "█";
      const first = Math.max(0, Math.ceil(centerColumn - halfWidth));
      const last = Math.min(width - 1, Math.floor(centerColumn + halfWidth));
      for (let column = first; column <= last; column += 1) {
        const edge = Math.abs(column - centerColumn) > halfWidth - 1.2;
        const char = rowChar === "█" && edge ? "▓" : rowChar;
        this.#cells[row]![column] = { char, foreground, bold };
      }
    }
  }

  #paintFloor(
    theme: ShellThemeSpec,
    width: number,
    height: number,
    horizonRow: number,
    centerColumn: number,
  ): void {
    if (horizonRow < height) {
      const foreground = mixShellRgb(theme.accent, theme.danger, 0.4);
      for (let column = 0; column < width; column += 1) {
        this.#cells[horizonRow]![column] = { char: "▄", foreground };
      }
    }
    const floorRows = height - 1 - horizonRow;
    if (floorRows < 1) return;

    const spacing = Math.max(3, width * RADIAL_SPACING_RATIO);
    const maxIndex = Math.ceil(width / spacing) + 1;
    for (let index = -maxIndex; index <= maxIndex; index += 1) {
      for (let row = horizonRow + 1; row < height; row += 1) {
        const progress = (row - horizonRow) / floorRows;
        const column = Math.round(centerColumn + index * spacing * progress);
        if (column < 0 || column >= width) continue;
        const fade = 0.15 + 0.7 * (1 - progress);
        this.#cells[row]![column] = {
          char: radialBlockGlyph(progress),
          foreground: mixShellRgb(theme.accent, theme.background, fade),
        };
      }
    }

    for (const depth of this.#lineDepths) {
      const row = horizonRow + Math.max(1, Math.floor(floorRows / depth));
      if (row >= height) continue;
      const fade = clamp(0.1 + 0.75 * ((depth - GRID_Z_NEAR) / GRID_Z_SPAN), 0, 1);
      const lineColor = mixShellRgb(theme.accent, theme.background, fade);
      const crossColor = mixShellRgb(lineColor, theme.text, 0.35);
      const bold = depth < 1.6;
      const lineGlyph = fade > 0.6 ? "░" : fade > 0.3 ? "▒" : "▄";
      for (let column = 0; column < width; column += 1) {
        const existing = this.#cells[row]![column];
        this.#cells[row]![column] = existing && RADIAL_GLYPHS.has(existing.char)
          ? { char: "█", foreground: crossColor, bold }
          : { char: lineGlyph, foreground: lineColor, bold };
      }
    }
  }

  #ensureBounds(bounds: Rectangle): void {
    const previous = this.#bounds;
    if (previous?.width === bounds.width && previous.height === bounds.height) {
      this.#bounds = { ...bounds };
      return;
    }
    this.#bounds = { ...bounds };
    const horizonRow = vaporwaveHorizonRow(bounds.height);
    this.#lineDepths = Array.from(
      { length: GRID_LINE_COUNT },
      (_, index) => GRID_Z_NEAR + (index + this.#random() * 0.3) * (GRID_Z_SPAN / GRID_LINE_COUNT),
    );
    const skyRows = Math.max(1, horizonRow);
    const starCount = Math.max(3, Math.round(bounds.width * skyRows * STAR_DENSITY));
    this.#stars = Array.from({ length: starCount }, () => ({
      column: Math.floor(this.#random() * bounds.width),
      row: Math.floor(this.#random() * skyRows),
      glyph: Math.floor(this.#random() * STAR_GLYPHS.length),
      brightness: this.#random(),
    }));
    this.#hazeRows = Array.from(
      { length: HAZE_BAND_COUNT },
      () => 1 + Math.floor(this.#random() * Math.max(1, skyRows - 2)),
    );
  }

  #ensureCellBuffer(width: number, height: number): void {
    if (this.#cells.length === height && (this.#cells[0]?.length ?? -1) === width) {
      for (const row of this.#cells) row.fill(undefined);
      return;
    }
    this.#cells = Array.from(
      { length: height },
      () => new Array<ShellBackgroundCell | undefined>(width).fill(undefined),
    );
  }

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
}

/** Horizon sits at ~45% of the rect height, clamped so sky and floor both exist. */
function vaporwaveHorizonRow(height: number): number {
  return clamp(Math.round(height * HORIZON_RATIO), 1, Math.max(1, height - 2));
}

/** Scanline gaps cut into the sun's lower half; thicker toward the base, crawling with drift. */
function sunStripeGap(level: number, drift: number): boolean {
  const gap = Math.max(0, 2.4 - level * 0.28);
  if (gap <= 0) return false;
  const phase = (((level + drift) % STRIPE_CYCLE_ROWS) + STRIPE_CYCLE_ROWS) % STRIPE_CYCLE_ROWS;
  return phase < gap;
}

/** Block-ramp radial glyph: faint shade at the horizon thickening toward the viewer. */
function radialBlockGlyph(progress: number): string {
  if (progress < 0.33) return "░";
  if (progress < 0.66) return "▒";
  return "▓";
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
