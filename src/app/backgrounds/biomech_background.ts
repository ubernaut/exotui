// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "../../types.ts";
import type { ShellThemeSpec } from "../shell_theme.ts";
import {
  mixShellRgb,
  type ShellAnimatedBackground,
  type ShellBackgroundAdvanceOptions,
  type ShellBackgroundCell,
  type ShellBackgroundPoint,
} from "./contract.ts";

const TAU = Math.PI * 2;
const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const POINTER_BULGE_LIFETIME_MS = 1_500;
const POINTER_BULGE_SIGMA_CELLS = 5;
const COLUMN_MIN_SPACING = 5;
const COLUMN_SPACING_SPREAD = 5;
const RIB_PERIOD_ROWS = 4;
const RECESS_CUTOFF = 0.14;
const VERTEBRA_CYCLE = ["╬", "╪", "╫", "║", "▌", "▐"] as const;
const SHADE_RAMP = ["░", "▒", "▓", "█"] as const;
const TUBE_GLYPHS = ["≈", "∽", "~", "="] as const;

/** Construction options for the biomechanical background. */
export interface ShellBiomechFieldOptions {
  readonly seed?: number;
  readonly density?: number;
}

interface BiomechWave {
  readonly kx: number;
  readonly ky: number;
  readonly phase: number;
  readonly speed: number;
  readonly weight: number;
}

interface BiomechTube {
  readonly xFraction: number;
  readonly amplitude: number;
  readonly wavelength: number;
  readonly phase: number;
  readonly speed: number;
  readonly glyphOffset: number;
  readonly paired: boolean;
}

interface BiomechPiston {
  readonly columnFraction: number;
  readonly topFraction: number;
  readonly spanFraction: number;
  readonly periodMs: number;
  readonly phase: number;
}

interface BiomechAnchor {
  readonly x: number;
  readonly phaseA: number;
  readonly phaseB: number;
  readonly speed: number;
  readonly glyphOffset: number;
  readonly depth: number;
}

interface BiomechBulge {
  readonly column: number;
  readonly row: number;
  readonly strength: number;
}

interface BiomechPointer extends ShellBackgroundPoint {
  readonly updatedAt: number;
}

/**
 * Deterministic Giger-flavored wall relief: wandering vertebral columns every
 * 5-9 cells, rib arcs and shade recesses bridging them, snaking tube bundles,
 * and embedded pistons, all displaced by layered breathing phase fields. Owns
 * simulation state only; theming stays in `rasterizeCells`.
 */
export class ShellBiomechField implements ShellAnimatedBackground {
  #randomState: number;
  readonly #hashSeed: number;
  readonly #waves: readonly BiomechWave[];
  readonly #tubes: readonly BiomechTube[];
  readonly #pistons: readonly BiomechPiston[];
  #bounds?: Rectangle;
  #pointer?: BiomechPointer;
  #bulge: BiomechBulge = { column: 0, row: 0, strength: 0 };
  #lastFrameAt?: number;
  #timeMs = 0;
  #cells: (ShellBackgroundCell | undefined)[][] = [];
  #anchors: BiomechAnchor[] = [];
  #anchorsWidth = -1;
  #centers: number[][] = [];

  constructor(options: ShellBiomechFieldOptions = {}) {
    this.#randomState = (options.seed ?? 0x42_49_4f_4d) >>> 0;
    const density = clamp(finite(options.density, 1), 0.25, 2);
    this.#hashSeed = Math.floor(this.#random() * 0xffff_ffff) >>> 0;
    this.#waves = [1, 0.6, 0.35].map((weight) => ({
      kx: 0.05 + this.#random() * 0.11,
      ky: 0.14 + this.#random() * 0.26,
      phase: this.#random() * TAU,
      speed: (0.35 + this.#random() * 0.85) * (this.#random() < 0.5 ? -1 : 1),
      weight,
    }));
    const tubeCount = clampInteger(Math.round(3 * density), 2, 8);
    this.#tubes = Array.from({ length: tubeCount }, () => ({
      xFraction: this.#random(),
      amplitude: 1 + this.#random() * 1.8,
      wavelength: 3 + this.#random() * 4,
      phase: this.#random() * TAU,
      speed: (0.3 + this.#random() * 0.5) * (this.#random() < 0.5 ? -1 : 1),
      glyphOffset: Math.floor(this.#random() * TUBE_GLYPHS.length),
      paired: this.#random() < 0.5,
    }));
    const pistonCount = clampInteger(Math.round(2.6 + density * 1.8), 3, 6);
    this.#pistons = Array.from({ length: pistonCount }, () => ({
      columnFraction: this.#random(),
      topFraction: 0.05 + this.#random() * 0.4,
      spanFraction: 0.3 + this.#random() * 0.2,
      periodMs: 3_000 + this.#random() * 3_000,
      phase: this.#random() * TAU,
    }));
  }

  /** Records the transient pointer that locally bulges the surrounding relief. */
  setPointer(point: ShellBackgroundPoint, now: number = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = { column: point.column, row: point.row, updatedAt: finite(now, performance.now()) };
  }

  clearPointer(): void {
    this.#pointer = undefined;
  }

  /** Advances phase fields and the pointer bulge once; true whenever phases moved. */
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
    this.#timeMs += elapsed;
    const pointer = this.#pointer;
    if (pointer) {
      const age = Math.max(0, now - pointer.updatedAt);
      this.#bulge = {
        column: pointer.column,
        row: pointer.row,
        strength: Math.max(0, 1 - age / POINTER_BULGE_LIFETIME_MS),
      };
    } else {
      this.#bulge = { column: 0, row: 0, strength: 0 };
    }
    return true;
  }

  /** Paints rib relief, tubes, vertebral columns, then pistons into a reused grid. */
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
    this.#prepareCellBuffer(normalized);
    this.#prepareAnchors(normalized.width);
    this.#prepareCenters(normalized);
    this.#paintRelief(normalized, theme);
    this.#paintTubes(normalized, theme);
    this.#paintColumns(normalized, theme);
    this.#paintPistons(normalized, theme);
    return this.#cells;
  }

  #prepareAnchors(width: number): void {
    if (this.#anchorsWidth === width) return;
    const anchors: BiomechAnchor[] = [];
    let x = -2 - (this.#hash(0, 101) % 3);
    let index = 0;
    while (true) {
      anchors.push({
        x,
        phaseA: TAU * this.#hash01(index, 7),
        phaseB: TAU * this.#hash01(index, 11),
        speed: (0.4 + 0.7 * this.#hash01(index, 13)) * (this.#hash01(index, 17) < 0.5 ? -1 : 1),
        glyphOffset: this.#hash(index, 19) % VERTEBRA_CYCLE.length,
        depth: this.#hash01(index, 23),
      });
      if (x > width + 2) break;
      x += COLUMN_MIN_SPACING + (this.#hash(index, 29) % COLUMN_SPACING_SPREAD);
      index += 1;
    }
    this.#anchors = anchors;
    this.#anchorsWidth = width;
    this.#centers = [];
  }

  #prepareCenters(bounds: Rectangle): void {
    const count = this.#anchors.length;
    if (this.#centers.length !== count || (this.#centers[0]?.length ?? -1) !== bounds.height) {
      this.#centers = Array.from({ length: count }, () => new Array<number>(bounds.height));
    }
    const seconds = this.#timeMs / 1_000;
    for (let index = 0; index < count; index += 1) {
      const anchor = this.#anchors[index]!;
      const rowCenters = this.#centers[index]!;
      for (let y = 0; y < bounds.height; y += 1) {
        const amplitude = 1.35 * (1 + 1.1 * this.#pointerBoost(anchor.x, y, bounds));
        const wave = 0.75 * Math.sin(y * 0.31 + anchor.phaseA + anchor.speed * seconds) +
          0.5 * Math.sin(y * 0.12 + anchor.phaseB - 0.6 * anchor.speed * seconds);
        rowCenters[y] = anchor.x + clamp(Math.round(amplitude * wave), -2, 2);
      }
    }
  }

  #field(x: number, y: number, seconds: number): number {
    let wave = 0;
    let total = 0;
    for (const octave of this.#waves) {
      wave += octave.weight * Math.sin(octave.kx * x + octave.ky * y + octave.phase + octave.speed * seconds);
      total += octave.weight;
    }
    return wave / total;
  }

  #pointerBoost(x: number, y: number, bounds: Rectangle): number {
    const bulge = this.#bulge;
    if (bulge.strength <= 0) return 0;
    const dx = x - (bulge.column - bounds.column);
    const dy = 2 * (y - (bulge.row - bounds.row));
    const sigma = POINTER_BULGE_SIGMA_CELLS;
    return bulge.strength * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  }

  #paintRelief(bounds: Rectangle, theme: ShellThemeSpec): void {
    const seconds = this.#timeMs / 1_000;
    for (let y = 0; y < bounds.height; y += 1) {
      for (let segment = 0; segment + 1 < this.#anchors.length; segment += 1) {
        const left = this.#centers[segment]![y]!;
        const right = this.#centers[segment + 1]![y]!;
        const gap = right - left;
        if (gap < 2) continue;
        const structureMix = this.#hash01(segment, 31);
        const archDepth = 1.6 + structureMix * 1.4;
        const start = Math.max(0, left + 1);
        const end = Math.min(bounds.width - 1, right - 1);
        for (let x = start; x <= end; x += 1) {
          const g = (x - left) / gap;
          const drift = this.#field(x, y, seconds);
          const boost = this.#pointerBoost(x, y, bounds);
          const arch = archDepth * 4 * g * (1 - g);
          const ribPhase = y + arch + 1.7 * drift + 2.6 * boost;
          const modulo = ((ribPhase % RIB_PERIOD_ROWS) + RIB_PERIOD_ROWS) % RIB_PERIOD_ROWS;
          const intensity = clamp(0.5 + 0.5 * drift + 0.45 * boost, 0, 1);
          if (modulo < 0.95) {
            const slope = (-4 * archDepth * (1 - 2 * g)) / gap;
            const glyph = g < 0.16
              ? "("
              : g > 0.84
              ? ")"
              : slope < -0.28 || (Math.abs(slope) <= 0.28 && g < 0.5)
              ? "/"
              : "\\";
            this.#setCell(
              bounds,
              x,
              y,
              this.#reliefCell(glyph, clamp(0.35 + 0.65 * intensity, 0, 1), structureMix, theme),
            );
            continue;
          }
          const ribDistance = Math.min(modulo, RIB_PERIOD_ROWS - modulo) / (RIB_PERIOD_ROWS / 2);
          const level = clamp(intensity * (1.05 - 0.7 * ribDistance), 0, 1);
          if (level < RECESS_CUTOFF) continue;
          const rampIndex = Math.min(SHADE_RAMP.length - 1, Math.floor(level * SHADE_RAMP.length));
          this.#setCell(bounds, x, y, this.#reliefCell(SHADE_RAMP[rampIndex]!, level, structureMix, theme));
        }
      }
    }
  }

  #reliefCell(char: string, level: number, structureMix: number, theme: ShellThemeSpec): ShellBackgroundCell {
    const structure = mixShellRgb(mixShellRgb(theme.muted, theme.border, structureMix), theme.surfaceStrong, 0.3);
    let color = mixShellRgb(theme.background, structure, 0.15 + 0.75 * level);
    if (level > 0.8) color = mixShellRgb(color, theme.accent, (level - 0.8) * 4);
    return level > 0.9 ? { char, foreground: color, bold: true } : { char, foreground: color };
  }

  #paintTubes(bounds: Rectangle, theme: ShellThemeSpec): void {
    const seconds = this.#timeMs / 1_000;
    for (const tube of this.#tubes) {
      const base = Math.round(tube.xFraction * (bounds.width - 1));
      for (let y = 0; y < bounds.height; y += 1) {
        const x = base + Math.round(tube.amplitude * Math.sin(y / tube.wavelength + tube.phase + tube.speed * seconds));
        const level = clamp(0.45 + 0.35 * this.#field(x, y, seconds) + 0.4 * this.#pointerBoost(x, y, bounds), 0, 1);
        const color = mixShellRgb(theme.background, theme.surfaceStrong, 0.3 + 0.5 * level);
        const glyph = TUBE_GLYPHS[(Math.floor(y / 2) + tube.glyphOffset) % TUBE_GLYPHS.length]!;
        this.#setCell(bounds, x, y, { char: glyph, foreground: color });
        if (tube.paired) this.#setCell(bounds, x + 1, y, { char: "│", foreground: color });
      }
    }
  }

  #paintColumns(bounds: Rectangle, theme: ShellThemeSpec): void {
    const seconds = this.#timeMs / 1_000;
    const scroll = Math.floor(seconds * 1.4);
    for (let index = 0; index < this.#anchors.length; index += 1) {
      const anchor = this.#anchors[index]!;
      const structure = mixShellRgb(theme.muted, theme.border, anchor.depth);
      for (let y = 0; y < bounds.height; y += 1) {
        const cx = this.#centers[index]![y]!;
        const boost = this.#pointerBoost(cx, y, bounds);
        const drift = this.#field(cx, y, seconds);
        const level = clamp(0.55 + 0.35 * drift + 0.5 * boost, 0, 1);
        const flank = mixShellRgb(theme.background, theme.surfaceStrong, 0.3 + 0.5 * level);
        this.#setCell(bounds, cx - 1, y, { char: "(", foreground: flank });
        this.#setCell(bounds, cx + 1, y, { char: ")", foreground: flank });
        let color = mixShellRgb(theme.background, structure, 0.35 + 0.6 * level);
        if (level > 0.78) color = mixShellRgb(color, theme.accent, (level - 0.78) * 3);
        const cycle = VERTEBRA_CYCLE.length;
        const glyph = VERTEBRA_CYCLE[(((y + anchor.glyphOffset + scroll) % cycle) + cycle) % cycle]!;
        this.#setCell(
          bounds,
          cx,
          y,
          level > 0.88 ? { char: glyph, foreground: color, bold: true } : { char: glyph, foreground: color },
        );
      }
    }
  }

  #paintPistons(bounds: Rectangle, theme: ShellThemeSpec): void {
    const candidates = this.#anchors.filter((anchor) => anchor.x >= 1 && anchor.x <= bounds.width - 2);
    if (candidates.length === 0) return;
    const housing = mixShellRgb(theme.background, theme.border, 0.7);
    const shaft = mixShellRgb(theme.background, theme.muted, 0.6);
    for (const piston of this.#pistons) {
      const target = piston.columnFraction * (bounds.width - 1);
      let x = candidates[0]!.x;
      for (const anchor of candidates) {
        if (Math.abs(anchor.x - target) < Math.abs(x - target)) x = anchor.x;
      }
      const span = Math.max(5, Math.round(piston.spanFraction * bounds.height));
      const bottom = Math.min(bounds.height - 2, Math.round(piston.topFraction * (bounds.height - 1)) + span);
      const top = Math.max(0, bottom - span);
      if (bottom - top < 4) continue;
      this.#setCell(bounds, x, top, { char: "▓", foreground: housing });
      this.#setCell(bounds, x, bottom + 1, { char: "▓", foreground: housing });
      const extension = 0.5 + 0.5 * Math.sin((TAU * this.#timeMs) / piston.periodMs + piston.phase);
      const headRow = top + 1 + Math.round(extension * (bottom - top - 1));
      for (let y = top + 1; y < headRow; y += 1) {
        this.#setCell(bounds, x, y, { char: "║", foreground: shaft });
      }
      const boost = this.#pointerBoost(x, headRow, bounds);
      this.#setCell(bounds, x, headRow, {
        char: "╦",
        foreground: mixShellRgb(theme.accent, theme.text, 0.15 + 0.25 * boost),
        bold: true,
      });
    }
  }

  #setCell(bounds: Rectangle, x: number, y: number, cell: ShellBackgroundCell): void {
    if (x < 0 || x >= bounds.width || y < 0 || y >= bounds.height) return;
    this.#cells[y]![x] = cell;
  }

  #prepareCellBuffer(bounds: Rectangle): void {
    if (this.#cells.length !== bounds.height || (this.#cells[0]?.length ?? -1) !== bounds.width) {
      this.#cells = Array.from(
        { length: bounds.height },
        () => new Array<ShellBackgroundCell | undefined>(bounds.width),
      );
    }
    for (const row of this.#cells) row.fill(undefined);
  }

  #ensureBounds(bounds: Rectangle): void {
    const previous = this.#bounds;
    if (
      previous?.column === bounds.column && previous.row === bounds.row &&
      previous.width === bounds.width && previous.height === bounds.height
    ) return;
    this.#bounds = { ...bounds };
  }

  #hash(a: number, b: number): number {
    return hashPair(this.#hashSeed, a, b);
  }

  #hash01(a: number, b: number): number {
    return this.#hash(a, b) / 0x1_0000_0000;
  }

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
}

function hashPair(seed: number, a: number, b: number): number {
  let value = (seed ^ Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d) >>> 0;
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39) >>> 0;
  return (value ^ (value >>> 15)) >>> 0;
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

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, minimum))));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
