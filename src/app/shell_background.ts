// Copyright 2023 Im-Beast. MIT license.

// The metaball background, promoted from exomux. A deterministic cell-field
// simulation: pointer-attracted, window-averse (obstacles), rasterized to
// per-cell intensity levels the host colours however it likes. Pure state —
// no painter, no palette — which is what let it move here unchanged.

import type { Rectangle } from "../types.ts";
import type { AnimatedBackground, AnimatedBackgroundCell } from "./animated_background.ts";
import { mixAnimatedBackgroundRgb } from "./animated_background.ts";
import type { ShellThemeSpec } from "./shell_theme.ts";
import type { ShellRgb } from "./workbench_shell.ts";

/** Low-rate cadence keeps the animated desktop responsive over remote terminals. */
export const SHELL_METABALL_FRAME_INTERVAL_MS = 125;
/** Intensity levels the field rasterizes to; 0 is the theme ground. */
export const SHELL_METABALL_LEVELS = 6;

const DEFAULT_BALL_COUNT = 8;
const DEFAULT_POINTER_LIFETIME_MS = 1_800;
const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const FIELD_THRESHOLD = 1.15;
const FIELD_GAIN = 0.55;
const CELL_ROW_ASPECT = 2;

/** A pointer position in desktop cell coordinates. */
export interface ShellMetaballPoint {
  readonly column: number;
  readonly row: number;
}

/** Per-frame inputs: the body bounds, obstacle rects, and the clock. */
export interface ShellMetaballAdvanceOptions {
  readonly bounds: Rectangle;
  readonly obstacles?: readonly Rectangle[];
  readonly now?: number;
}

/** Clone-safe simulation state, for tests and diagnostics. */
export interface ShellMetaballInspection {
  readonly bounds?: Rectangle;
  readonly pointer?: ShellMetaballPoint & { readonly updatedAt: number };
  readonly balls: readonly Readonly<{
    x: number;
    y: number;
    radius: number;
    strength: number;
    vx: number;
    vy: number;
  }>[];
}

/** Construction options: ball count, seed, and pointer decay. */
export interface ShellMetaballFieldOptions {
  readonly count?: number;
  readonly seed?: number;
  readonly pointerLifetimeMs?: number;
}

interface ShellMetaball {
  x: number;
  y: number;
  radius: number;
  strength: number;
  vx: number;
  vy: number;
}

interface ShellMetaballPointer extends ShellMetaballPoint {
  readonly updatedAt: number;
}

/**
 * Deterministic terminal-cell adaptation of recordMyScreen's Canvas2D lava
 * field. It owns only simulation state; the Exomux retained painter remains
 * responsible for palette selection and ANSI output.
 */
export class ShellMetaballField {
  readonly #count: number;
  readonly #pointerLifetimeMs: number;
  #randomState: number;
  #bounds?: Rectangle;
  #pointer?: ShellMetaballPointer;
  #lastFrameAt?: number;
  #balls: ShellMetaball[] = [];
  #levels = new Uint8Array();

  constructor(options: ShellMetaballFieldOptions = {}) {
    this.#count = clampInteger(options.count ?? DEFAULT_BALL_COUNT, 1, 24);
    this.#pointerLifetimeMs = Math.max(0, finite(options.pointerLifetimeMs, DEFAULT_POINTER_LIFETIME_MS));
    this.#randomState = (options.seed ?? 0x4d_55_58_32) >>> 0;
  }

  /** Updates the transient attraction point without coupling it to input routing. */
  setPointer(point: ShellMetaballPoint, now: number = performance.now()): void {
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

  /** Advances bounded motion, pointer attraction, and window repulsion once. */
  advance(options: ShellMetaballAdvanceOptions): boolean {
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
    const pointer = this.#pointer && now - this.#pointer.updatedAt <= this.#pointerLifetimeMs
      ? this.#pointer
      : undefined;
    const obstacles = options.obstacles ?? [];

    for (const ball of this.#balls) {
      if (pointer) applyPointerAttraction(ball, pointer, bounds, delta);
      for (const obstacle of obstacles) applyObstacleRepulsion(ball, obstacle, delta);
      const damping = Math.pow(0.994, delta);
      ball.vx *= damping;
      ball.vy *= damping;
      capVelocity(ball, 0.18);
      ball.x += ball.vx * delta;
      ball.y += ball.vy * delta;
      bounceIntoBounds(ball, bounds);
    }
    return true;
  }

  /** Returns a reused row-major buffer of quantized scalar-field intensity. */
  rasterize(bounds: Rectangle, levelCount = SHELL_METABALL_LEVELS): Uint8Array {
    const normalized = normalizeBounds(bounds);
    if (!normalized) {
      this.#levels = new Uint8Array();
      return this.#levels;
    }
    this.#ensureBounds(normalized);
    const levels = clampInteger(levelCount, 2, 16);
    const length = normalized.width * normalized.height;
    if (this.#levels.length !== length) this.#levels = new Uint8Array(length);
    let offset = 0;
    for (let row = normalized.row; row < normalized.row + normalized.height; row += 1) {
      for (let column = normalized.column; column < normalized.column + normalized.width; column += 1) {
        let field = 0;
        for (const ball of this.#balls) {
          const dx = column - ball.x;
          const dy = (row - ball.y) * CELL_ROW_ASPECT;
          field += ball.strength / (dx * dx + dy * dy + 0.8);
        }
        const intensity = Math.min(1, Math.max(0, (field - FIELD_THRESHOLD) * FIELD_GAIN));
        this.#levels[offset++] = intensity <= 0
          ? 0
          : 1 + Math.min(levels - 2, Math.floor(Math.pow(intensity, 1.35) * (levels - 1)));
      }
    }
    return this.#levels;
  }

  inspect(): ShellMetaballInspection {
    return {
      ...(this.#bounds ? { bounds: { ...this.#bounds } } : {}),
      ...(this.#pointer ? { pointer: { ...this.#pointer } } : {}),
      balls: this.#balls.map((ball) => ({ ...ball })),
    };
  }

  #ensureBounds(bounds: Rectangle): void {
    const previous = this.#bounds;
    if (
      previous?.column === bounds.column && previous.row === bounds.row &&
      previous.width === bounds.width && previous.height === bounds.height
    ) return;
    this.#bounds = { ...bounds };
    this.#levels = new Uint8Array(bounds.width * bounds.height);
    if (!previous || this.#balls.length === 0) {
      this.#balls = Array.from({ length: this.#count }, () => this.#createBall(bounds));
      return;
    }
    const scaleX = bounds.width / previous.width;
    const scaleY = bounds.height / previous.height;
    const radiusScale = Math.min(scaleX, scaleY * CELL_ROW_ASPECT);
    const radiusRange = metaballRadiusRange(bounds);
    for (const ball of this.#balls) {
      ball.x = bounds.column + (ball.x - previous.column) * scaleX;
      ball.y = bounds.row + (ball.y - previous.row) * scaleY;
      ball.radius = clamp(ball.radius * radiusScale, radiusRange.minimum, radiusRange.maximum);
      ball.strength = ball.radius * ball.radius;
      ball.vx *= scaleX;
      ball.vy *= scaleY;
      bounceIntoBounds(ball, bounds);
    }
  }

  #createBall(bounds: Rectangle): ShellMetaball {
    const radiusRange = metaballRadiusRange(bounds);
    const radius = radiusRange.minimum + this.#random() * (radiusRange.maximum - radiusRange.minimum);
    const speed = 0.035 + this.#random() * 0.065;
    const angle = this.#random() * Math.PI * 2;
    return {
      x: bounds.column + this.#random() * Math.max(0, bounds.width - 1),
      y: bounds.row + this.#random() * Math.max(0, bounds.height - 1),
      radius,
      strength: radius * radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed / CELL_ROW_ASPECT,
    };
  }

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
}

function applyPointerAttraction(
  ball: ShellMetaball,
  pointer: ShellMetaballPoint,
  bounds: Rectangle,
  delta: number,
): void {
  const dx = pointer.column - ball.x;
  const dy = (pointer.row - ball.y) * CELL_ROW_ASPECT;
  const distance = Math.hypot(dx, dy) + 0.001;
  const reach = Math.max(4, Math.min(bounds.width, bounds.height * CELL_ROW_ASPECT) * 0.7);
  const influence = Math.max(0, 1 - distance / reach);
  const pull = 0.012 * influence * delta;
  ball.vx += (dx / distance) * pull;
  ball.vy += (dy / distance) * pull / CELL_ROW_ASPECT;
}

function applyObstacleRepulsion(ball: ShellMetaball, obstacle: Rectangle, delta: number): void {
  const normalized = normalizeBounds(obstacle);
  if (!normalized) return;
  const horizontalPadding = Math.max(1, ball.radius * 0.7);
  const verticalPadding = Math.max(1, horizontalPadding / CELL_ROW_ASPECT);
  const left = normalized.column - horizontalPadding;
  const right = normalized.column + normalized.width - 1 + horizontalPadding;
  const top = normalized.row - verticalPadding;
  const bottom = normalized.row + normalized.height - 1 + verticalPadding;
  if (ball.x < left || ball.x > right || ball.y < top || ball.y > bottom) return;

  const distances = [
    { distance: ball.x - left, dx: -1, dy: 0 },
    { distance: right - ball.x, dx: 1, dy: 0 },
    { distance: (ball.y - top) * CELL_ROW_ASPECT, dx: 0, dy: -1 },
    { distance: (bottom - ball.y) * CELL_ROW_ASPECT, dx: 0, dy: 1 },
  ];
  let nearest = distances[0]!;
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index]!.distance < nearest.distance) nearest = distances[index]!;
  }
  const reach = Math.max(1, ball.radius * 0.7);
  const influence = Math.max(0.15, 1 - Math.max(0, nearest.distance) / reach);
  const force = 0.04 * influence * influence * delta;
  ball.vx += nearest.dx * force;
  ball.vy += nearest.dy * force / CELL_ROW_ASPECT;
}

function capVelocity(ball: ShellMetaball, maximum: number): void {
  const speed = Math.hypot(ball.vx, ball.vy * CELL_ROW_ASPECT);
  if (speed <= maximum) return;
  const scale = maximum / speed;
  ball.vx *= scale;
  ball.vy *= scale;
}

function bounceIntoBounds(ball: ShellMetaball, bounds: Rectangle): void {
  const right = bounds.column + bounds.width - 1;
  const bottom = bounds.row + bounds.height - 1;
  if (ball.x < bounds.column || ball.x > right) {
    ball.vx *= -1;
    ball.x = clamp(ball.x, bounds.column, right);
  }
  if (ball.y < bounds.row || ball.y > bottom) {
    ball.vy *= -1;
    ball.y = clamp(ball.y, bounds.row, bottom);
  }
}

function metaballRadiusRange(bounds: Rectangle): { minimum: number; maximum: number } {
  const minimumDimension = Math.max(2, Math.min(bounds.width, bounds.height * CELL_ROW_ASPECT));
  return {
    minimum: Math.max(2, minimumDimension * 0.08),
    maximum: Math.max(3, minimumDimension * 0.2),
  };
}

function normalizeBounds(value: Rectangle): Rectangle | undefined {
  if (
    !Number.isFinite(value.column) || !Number.isFinite(value.row) ||
    !Number.isFinite(value.width) || !Number.isFinite(value.height)
  ) return undefined;
  const width = Math.floor(value.width);
  const height = Math.floor(value.height);
  if (width <= 0 || height <= 0) return undefined;
  return {
    column: Math.floor(value.column),
    row: Math.floor(value.row),
    width,
    height,
  };
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

/** Relative luminance of a colour, for contrast comparisons. */
function shellLuminance(color: ShellRgb): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

/** HSV chroma (max−min): how vivid a colour is, 0 for any grey. */
function shellChroma(color: ShellRgb): number {
  return Math.max(color[0], color[1], color[2]) - Math.min(color[0], color[1], color[2]);
}

/** Hue angle in degrees, or undefined for a grey with no hue. */
function shellHue(color: ShellRgb): number | undefined {
  const [r, g, b] = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return undefined;
  let hue: number;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Shortest angular distance between two hues, 0–180. */
function shellHueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Squared RGB distance; the fallback when a theme has no vivid colours. */
function shellColorDistanceSq(a: ShellRgb, b: ShellRgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * The two most extreme theme colours — the vivid, high-contrast pair the
 * metaballs shade between, brighter one first. Anchored on the theme's most
 * saturated colour, then paired with the colour furthest from it in hue and
 * still vivid; falls back to maximum RGB distance for a theme with no hue.
 */
export function shellMetaballGradientColors(theme: ShellThemeSpec): readonly [ShellRgb, ShellRgb] {
  const candidates: readonly ShellRgb[] = [
    theme.accent,
    theme.success,
    theme.warning,
    theme.danger,
    theme.text,
    theme.muted,
    theme.surfaceStrong,
    theme.border,
  ];
  let anchor = candidates[0]!;
  for (const color of candidates) {
    if (shellChroma(color) > shellChroma(anchor)) anchor = color;
  }
  const anchorHue = shellHue(anchor);
  if (anchorHue === undefined) {
    let best: [ShellRgb, ShellRgb] = [theme.text, theme.surfaceStrong];
    let bestDistance = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const distance = shellColorDistanceSq(candidates[i]!, candidates[j]!);
        if (distance > bestDistance) {
          bestDistance = distance;
          best = [candidates[i]!, candidates[j]!];
        }
      }
    }
    return shellLuminance(best[0]) >= shellLuminance(best[1]) ? best : [best[1], best[0]];
  }
  let partner = anchor;
  let bestScore = -1;
  for (const color of candidates) {
    const hue = shellHue(color);
    if (hue === undefined) continue;
    const score = (shellHueDistance(anchorHue, hue) / 180) * shellChroma(color);
    if (score > bestScore) {
      bestScore = score;
      partner = color;
    }
  }
  if (partner === anchor) partner = theme.surfaceStrong;
  return shellLuminance(anchor) >= shellLuminance(partner) ? [anchor, partner] : [partner, anchor];
}

/** One colour per intensity level: theme ground at 0, then edge→centre. */
export function shellMetaballPalette(theme: ShellThemeSpec): readonly ShellRgb[] {
  const [center, edge] = shellMetaballGradientColors(theme);
  const top = SHELL_METABALL_LEVELS - 1;
  return Array.from({ length: SHELL_METABALL_LEVELS }, (_, level) => {
    if (level === 0) return theme.background;
    const progress = top <= 1 ? 1 : (level - 1) / (top - 1);
    return mixAnimatedBackgroundRgb(edge, center, progress);
  });
}

/**
 * The metaball field behind the generic animated-background contract: the
 * simulation stays `ShellMetaballField`; this adapter rasterizes levels into
 * solid cells through the theme-derived gradient, caching the palette per
 * theme identity.
 */
export class ShellMetaballBackground implements AnimatedBackground<ShellThemeSpec> {
  readonly #field = new ShellMetaballField();
  #palette?: readonly ShellRgb[];
  #paletteThemeId?: string;

  setPointer(point: ShellMetaballPoint, now?: number): void {
    this.#field.setPointer(point, now);
  }

  clearPointer(): void {
    this.#field.clearPointer();
  }

  advance(options: ShellMetaballAdvanceOptions): boolean {
    return this.#field.advance(options);
  }

  rasterizeCells(
    bounds: Rectangle,
    theme: ShellThemeSpec,
  ): ReadonlyArray<ReadonlyArray<AnimatedBackgroundCell | undefined>> {
    if (this.#paletteThemeId !== theme.id || !this.#palette) {
      this.#palette = shellMetaballPalette(theme);
      this.#paletteThemeId = theme.id;
    }
    const palette = this.#palette;
    const levels = this.#field.rasterize(bounds, SHELL_METABALL_LEVELS);
    const rows: (AnimatedBackgroundCell | undefined)[][] = [];
    for (let row = 0; row < bounds.height; row += 1) {
      const line: (AnimatedBackgroundCell | undefined)[] = [];
      for (let column = 0; column < bounds.width; column += 1) {
        const level = levels[row * bounds.width + column] ?? 0;
        line.push(level === 0 ? undefined : { char: "█", foreground: palette[level]! });
      }
      rows.push(line);
    }
    return rows;
  }
}
