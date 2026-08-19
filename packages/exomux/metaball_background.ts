// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "@ubernaut/exotui";

/** Low-rate cadence keeps the animated desktop responsive over remote terminals. */
export const EXOMUX_METABALL_FRAME_INTERVAL_MS = 125;
export const EXOMUX_METABALL_LEVELS = 6;

const DEFAULT_BALL_COUNT = 8;
const DEFAULT_POINTER_LIFETIME_MS = 1_800;
const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const FIELD_THRESHOLD = 1.15;
const FIELD_GAIN = 0.55;
const CELL_ROW_ASPECT = 2;

export interface ExomuxMetaballPoint {
  readonly column: number;
  readonly row: number;
}

export interface ExomuxMetaballAdvanceOptions {
  readonly bounds: Rectangle;
  readonly obstacles?: readonly Rectangle[];
  readonly now?: number;
}

export interface ExomuxMetaballInspection {
  readonly bounds?: Rectangle;
  readonly pointer?: ExomuxMetaballPoint & { readonly updatedAt: number };
  readonly balls: readonly Readonly<{
    x: number;
    y: number;
    radius: number;
    strength: number;
    vx: number;
    vy: number;
  }>[];
}

export interface ExomuxMetaballFieldOptions {
  readonly count?: number;
  readonly seed?: number;
  readonly pointerLifetimeMs?: number;
}

interface ExomuxMetaball {
  x: number;
  y: number;
  radius: number;
  strength: number;
  vx: number;
  vy: number;
}

interface ExomuxMetaballPointer extends ExomuxMetaballPoint {
  readonly updatedAt: number;
}

/**
 * Deterministic terminal-cell adaptation of recordMyScreen's Canvas2D lava
 * field. It owns only simulation state; the Exomux retained painter remains
 * responsible for palette selection and ANSI output.
 */
export class ExomuxMetaballField {
  readonly #count: number;
  readonly #pointerLifetimeMs: number;
  #randomState: number;
  #bounds?: Rectangle;
  #pointer?: ExomuxMetaballPointer;
  #lastFrameAt?: number;
  #balls: ExomuxMetaball[] = [];
  #levels = new Uint8Array();

  constructor(options: ExomuxMetaballFieldOptions = {}) {
    this.#count = clampInteger(options.count ?? DEFAULT_BALL_COUNT, 1, 24);
    this.#pointerLifetimeMs = Math.max(0, finite(options.pointerLifetimeMs, DEFAULT_POINTER_LIFETIME_MS));
    this.#randomState = (options.seed ?? 0x4d_55_58_32) >>> 0;
  }

  /** Updates the transient attraction point without coupling it to input routing. */
  setPointer(point: ExomuxMetaballPoint, now = performance.now()): void {
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
  advance(options: ExomuxMetaballAdvanceOptions): boolean {
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
  rasterize(bounds: Rectangle, levelCount = EXOMUX_METABALL_LEVELS): Uint8Array {
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

  inspect(): ExomuxMetaballInspection {
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

  #createBall(bounds: Rectangle): ExomuxMetaball {
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
  ball: ExomuxMetaball,
  pointer: ExomuxMetaballPoint,
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

function applyObstacleRepulsion(ball: ExomuxMetaball, obstacle: Rectangle, delta: number): void {
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

function capVelocity(ball: ExomuxMetaball, maximum: number): void {
  const speed = Math.hypot(ball.vx, ball.vy * CELL_ROW_ASPECT);
  if (speed <= maximum) return;
  const scale = maximum / speed;
  ball.vx *= scale;
  ball.vy *= scale;
}

function bounceIntoBounds(ball: ExomuxMetaball, bounds: Rectangle): void {
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
