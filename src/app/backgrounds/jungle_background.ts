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
const POINTER_ACTIVE_MS = 1_800;
const POINTER_RUSTLE_REACH_CELLS = 7;
const RUSTLE_LIFETIME_MS = 1_200;
const GUST_MIN_INTERVAL_MS = 8_000;
const GUST_INTERVAL_SPREAD_MS = 12_000;
const FRONT_TEXT_BLEND = 0.2;
const FROND_MIN_LENGTH = 15;
const FROND_LENGTH_SPREAD = 25;
const SIDES = [-1, 1] as const;

interface JungleLayerSpec {
  readonly frondBase: number;
  readonly swayAmplitude: number;
}

const LAYER_SPECS: readonly JungleLayerSpec[] = [
  { frondBase: 17, swayAmplitude: 0.7 },
  { frondBase: 14, swayAmplitude: 1.4 },
  { frondBase: 12, swayAmplitude: 2.2 },
];

interface JungleFrond {
  readonly edge: number;
  readonly anchorFraction: number;
  readonly angle: number;
  readonly curl: number;
  readonly lengthFraction: number;
  readonly swayPhase: number;
  readonly swaySpeed: number;
  readonly leafletPhase: number;
  readonly glyphSeed: number;
  lastRustleAt: number;
}

interface JungleLayer {
  readonly spec: JungleLayerSpec;
  readonly swayPhaseA: number;
  readonly swayPhaseB: number;
  readonly swaySpeedA: number;
  readonly swaySpeedB: number;
  readonly fronds: readonly JungleFrond[];
}

interface JunglePointer extends ShellBackgroundPoint {
  readonly updatedAt: number;
}

/**
 * Deterministic layered palm canopy: three depths of edge-anchored arcing
 * fronds with paired leaflets, swaying on layered sine breezes with seeded
 * gusts, pointer rustles, and rustles from windows that moved since the
 * previous frame.
 */
export class ShellJungleField implements ShellAnimatedBackground {
  #randomState: number;
  readonly #layers: readonly JungleLayer[];
  #bounds?: Rectangle;
  #pointer?: JunglePointer;
  #previousObstacles: readonly Rectangle[] = [];
  #lastFrameAt?: number;
  #timeMs = 0;
  #gustStartAt = Number.NEGATIVE_INFINITY;
  #gustDurationMs = 0;
  #nextGustAt: number;
  #cells: (ShellBackgroundCell | undefined)[][] = [];

  constructor(options: { readonly seed?: number; readonly density?: number } = {}) {
    this.#randomState = (options.seed ?? 0x4a_55_4e_47) >>> 0;
    const density = clamp(finite(options.density, 1), 0.25, 2);
    this.#layers = LAYER_SPECS.map((spec) => this.#createLayer(spec, density));
    this.#nextGustAt = GUST_MIN_INTERVAL_MS + this.#random() * GUST_INTERVAL_SPREAD_MS;
  }

  /** Records the transient pointer that rustles nearby fronds during advance. */
  setPointer(point: ShellBackgroundPoint, now: number = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = { column: point.column, row: point.row, updatedAt: finite(now, performance.now()) };
  }

  clearPointer(): void {
    this.#pointer = undefined;
  }

  /** Advances breeze, gusts, and rustle triggers once; true whenever phases moved. */
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
    if (this.#timeMs >= this.#nextGustAt) {
      this.#gustStartAt = this.#nextGustAt;
      this.#gustDurationMs = 2_500 + this.#random() * 1_500;
      this.#nextGustAt = this.#gustStartAt + this.#gustDurationMs + GUST_MIN_INTERVAL_MS +
        this.#random() * GUST_INTERVAL_SPREAD_MS;
    }
    const pointer = this.#pointer && now - this.#pointer.updatedAt <= POINTER_ACTIVE_MS ? this.#pointer : undefined;
    const obstacles = (options.obstacles ?? [])
      .map(normalizeBounds)
      .filter((rect): rect is Rectangle => rect !== undefined);
    const changedObstacles = obstacles.filter((rect) =>
      !this.#previousObstacles.some((previous) => sameRectangle(previous, rect))
    );
    this.#previousObstacles = obstacles;
    for (const layer of this.#layers) {
      for (const frond of layer.fronds) {
        const samples = frondSamples(frond, bounds);
        if (
          pointer &&
          samples.some(([x, y]) => Math.hypot(pointer.column - x, pointer.row - y) <= POINTER_RUSTLE_REACH_CELLS)
        ) {
          frond.lastRustleAt = this.#timeMs;
          continue;
        }
        for (const rect of changedObstacles) {
          if (frondTouchesRectangle(samples, rect)) {
            frond.lastRustleAt = this.#timeMs;
            break;
          }
        }
      }
    }
    return true;
  }

  /** Paints back, mid, then front frond layers into a reused row-major grid. */
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
    for (let depth = 0; depth < this.#layers.length; depth += 1) {
      this.#paintLayer(this.#layers[depth]!, depth, normalized, theme);
    }
    return this.#cells;
  }

  #createLayer(spec: JungleLayerSpec, density: number): JungleLayer {
    const frondCount = clampInteger(Math.round(spec.frondBase * density), 4, 30);
    return {
      spec,
      swayPhaseA: this.#random() * TAU,
      swayPhaseB: this.#random() * TAU,
      swaySpeedA: 0.25 + this.#random() * 0.35,
      swaySpeedB: 0.6 + this.#random() * 0.5,
      fronds: Array.from({ length: frondCount }, () => {
        const edge = Math.floor(this.#random() * 4);
        const inward = edge === 0 ? -Math.PI / 2 : edge === 1 ? Math.PI / 2 : edge === 2 ? 0 : Math.PI;
        return {
          edge,
          anchorFraction: this.#random(),
          angle: inward + (this.#random() - 0.5) * 1.7,
          curl: this.#random() * 2 - 1,
          lengthFraction: this.#random(),
          swayPhase: this.#random() * TAU,
          swaySpeed: 0.5 + this.#random() * 0.7,
          leafletPhase: this.#random() * TAU,
          glyphSeed: Math.floor(this.#random() * 0xffff),
          lastRustleAt: Number.NEGATIVE_INFINITY,
        };
      }),
    };
  }

  #gustFactor(): number {
    const age = this.#timeMs - this.#gustStartAt;
    if (age < 0 || this.#gustDurationMs <= 0 || age > this.#gustDurationMs) return 1;
    return 1 + Math.sin(Math.PI * (age / this.#gustDurationMs));
  }

  #layerSway(layer: JungleLayer): number {
    const seconds = this.#timeMs / 1_000;
    const wave = Math.sin(layer.swaySpeedA * seconds + layer.swayPhaseA) +
      0.5 * Math.sin(layer.swaySpeedB * seconds + layer.swayPhaseB);
    return layer.spec.swayAmplitude * this.#gustFactor() * (wave / 1.5);
  }

  #frondRustle(frond: JungleFrond): number {
    return Math.max(0, 1 - (this.#timeMs - frond.lastRustleAt) / RUSTLE_LIFETIME_MS);
  }

  #paintLayer(layer: JungleLayer, depth: number, bounds: Rectangle, theme: ShellThemeSpec): void {
    const sway = this.#layerSway(layer);
    const seconds = this.#timeMs / 1_000;
    for (const frond of layer.fronds) {
      this.#paintFrond(frond, layer, depth, sway, seconds, bounds, theme);
    }
  }

  #paintFrond(
    frond: JungleFrond,
    layer: JungleLayer,
    depth: number,
    sway: number,
    seconds: number,
    bounds: Rectangle,
    theme: ShellThemeSpec,
  ): void {
    const [ax, ay] = frondAnchor(frond, bounds);
    const len = frondLength(frond);
    const rustle = this.#frondRustle(frond);
    const dirX = Math.cos(frond.angle);
    const dirY = Math.sin(frond.angle);
    const perpX = -dirY;
    const perpY = dirX;
    const wobble = Math.sin(seconds * frond.swaySpeed + frond.swayPhase);
    const shake = rustle > 0 ? rustle * 1.5 * Math.sin(this.#timeMs * 0.02 + frond.swayPhase) : 0;
    const drift = sway * (0.6 + 0.4 * wobble) + wobble * 0.5 * layer.spec.swayAmplitude + shake;
    const curlOffset = frond.curl * len * 0.35;
    const midX = ax + dirX * len * 0.55 + perpX * curlOffset * 0.5 + drift;
    const midY = ay + dirY * len * 0.55 + perpY * curlOffset * 0.5;
    const tipX = ax + dirX * len + perpX * curlOffset + drift * 1.7;
    const tipY = ay + dirY * len + perpY * curlOffset;
    const steps = len * 2;
    let prevX = ax;
    let prevY = ay;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      const bx = u * u * ax + 2 * u * t * midX + t * t * tipX;
      const by = u * u * ay + 2 * u * t * midY + t * t * tipY;
      const tanX = bx - prevX;
      const tanY = by - prevY;
      prevX = bx;
      prevY = by;
      this.#setCell(
        bounds,
        Math.round(bx),
        Math.round(by),
        this.#leafCell(depth, ribGlyph(tanX, tanY), 0.85, 0.35 + 0.4 * rustle, rustle, false, theme),
      );
      if (i % 2 !== 0) continue;
      const tangent = Math.atan2(tanY, tanX);
      const spread = 0.95 + 0.25 * Math.sin(seconds * 1.3 + frond.leafletPhase + i * 0.6) * (1 + rustle);
      const leafletLength = clampInteger(2 + Math.round(4 * u), 2, 6);
      for (const side of SIDES) {
        const angle = tangent + side * spread;
        const lx = Math.cos(angle);
        const ly = Math.sin(angle);
        for (let j = 1; j <= leafletLength; j += 1) {
          const px = Math.round(bx + lx * j);
          const py = Math.round(by + ly * j * 0.6);
          const hash = hashCell(frond.glyphSeed, i * 2 + side, j);
          const shade = 1 - j / (leafletLength + 1);
          const highlight = clamp(((hash % 97) / 97) * 0.5 + u * 0.4 + 0.5 * rustle, 0, 1);
          const filler = j === 1;
          const char = filler ? (hash & 1 ? "▒" : "▓") : leafletGlyph(lx, ly, hash);
          this.#setCell(bounds, px, py, this.#leafCell(depth, char, shade, highlight, rustle, !filler, theme));
        }
      }
    }
  }

  #leafCell(
    depth: number,
    char: string,
    shade: number,
    highlight: number,
    rustle: number,
    leaflet: boolean,
    theme: ShellThemeSpec,
  ): ShellBackgroundCell {
    if (depth === 0) {
      return { char, foreground: mixShellRgb(theme.background, theme.muted, 0.3 + 0.3 * shade + 0.15 * rustle) };
    }
    if (depth === 1) {
      const blend = mixShellRgb(theme.muted, theme.success, 0.35 + 0.65 * shade);
      return { char, foreground: mixShellRgb(theme.background, blend, 0.6 + 0.15 * shade + 0.2 * rustle) };
    }
    const base = mixShellRgb(theme.success, theme.accent, highlight * 0.85);
    const visible = mixShellRgb(base, theme.text, FRONT_TEXT_BLEND);
    return leaflet && highlight > 0.7 ? { char, foreground: visible, bold: true } : { char, foreground: visible };
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

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
}

function frondAnchor(frond: JungleFrond, bounds: Rectangle): readonly [number, number] {
  const maxX = bounds.width - 1;
  const maxY = bounds.height - 1;
  switch (frond.edge) {
    case 0:
      return [frond.anchorFraction * maxX, maxY];
    case 1:
      return [frond.anchorFraction * maxX, 0];
    case 2:
      return [0, frond.anchorFraction * maxY];
    default:
      return [maxX, frond.anchorFraction * maxY];
  }
}

function frondLength(frond: JungleFrond): number {
  return FROND_MIN_LENGTH + Math.round(frond.lengthFraction * FROND_LENGTH_SPREAD);
}

function frondSamples(frond: JungleFrond, bounds: Rectangle): readonly (readonly [number, number])[] {
  const [ax, ay] = frondAnchor(frond, bounds);
  const len = frondLength(frond);
  const tx = ax + Math.cos(frond.angle) * len;
  const ty = ay + Math.sin(frond.angle) * len;
  const ox = bounds.column;
  const oy = bounds.row;
  return [
    [ox + ax, oy + ay],
    [ox + (ax + tx) / 2, oy + (ay + ty) / 2],
    [ox + tx, oy + ty],
  ];
}

function frondTouchesRectangle(samples: readonly (readonly [number, number])[], rect: Rectangle): boolean {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of samples) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const pad = 5;
  return maxX + pad >= rect.column && minX - pad <= rect.column + rect.width - 1 &&
    maxY + pad >= rect.row && minY - pad <= rect.row + rect.height - 1;
}

function ribGlyph(tanX: number, tanY: number): string {
  if (Math.abs(tanX) < 0.4 * Math.abs(tanY)) return "│";
  return tanX * tanY > 0 ? "╲" : "╱";
}

function leafletGlyph(lx: number, ly: number, hash: number): string {
  if (Math.abs(lx) < 0.35) return hash % 3 === 0 ? "y" : hash % 3 === 1 ? "v" : "V";
  const down = lx * ly > 0;
  if (hash % 3 === 0) return down ? "╲" : "╱";
  return down ? "\\" : "/";
}

function sameRectangle(a: Rectangle, b: Rectangle): boolean {
  return a.column === b.column && a.row === b.row && a.width === b.width && a.height === b.height;
}

function hashCell(seed: number, dx: number, dy: number): number {
  let value = (seed ^ Math.imul(dx + 0x7f, 0x9e3779b1) ^ Math.imul(dy + 0x7f, 0x85ebca6b)) >>> 0;
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
