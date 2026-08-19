// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "@ubernaut/exotui";
import {
  type ExomuxAnimatedBackground,
  type ExomuxBackgroundAdvanceOptions,
  type ExomuxBackgroundCell,
  type ExomuxBackgroundPoint,
  mixExomuxRgb,
} from "./background.ts";
import type { ExomuxThemeSpec } from "./model.ts";

const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const POINTER_LIFETIME_MS = 1_500;
const POINTER_REACH_COLUMNS = 6;
const POINTER_SPEED_MULTIPLIER = 2;
const MIN_TAIL_CELLS = 4;
const MAX_TAIL_CELLS = 18;
/** Speed multiplier when a drop is inside an inactive window. */
const INACTIVE_WINDOW_SPEED_FACTOR = 0.35;
const SPLASH_LIFETIME_MS = 550;
const GUTTER_H_SPEED_LOW = 0.7;
const GUTTER_H_SPEED_HIGH = 1.4;
const GUTTER_V_SPEED_LOW = 0.12;
const GUTTER_V_SPEED_HIGH = 0.35;
const GUTTER_SLIDE_TAIL = 2;
const GUTTER_FALL_TAIL_MIN = 2;
const GUTTER_FALL_TAIL_MAX = 4;

/**
 * Characters ordered by height above the surface. Index 0 sits right on the
 * window border; higher indices float further above it, forming the crown of
 * a side-view droplet splash.
 */
const SPLASH_HEIGHT_CHARS: readonly string[] = [".", ",", "'", '"', "`", "~"];

/**
 * Fixed particle arcs for every splash. Each entry describes one droplet
 * fragment: its horizontal offset from the impact column, the peak height
 * of its parabolic arc (in cell rows), and a start-delay as a fraction of
 * the total lifetime so outer fragments lag behind the center.
 */
const SPLASH_ARC_PARTICLES: readonly { readonly dx: number; readonly peak: number; readonly delay: number }[] = Object
  .freeze([
    // Center column — tallest bounce.
    Object.freeze({ dx: 0, peak: 2.8, delay: 0 }),
    // Inner pair.
    Object.freeze({ dx: -1, peak: 2.1, delay: 0.06 }),
    Object.freeze({ dx: 1, peak: 2.1, delay: 0.06 }),
    // Mid pair — lower arc, more lateral.
    Object.freeze({ dx: -2, peak: 1.3, delay: 0.13 }),
    Object.freeze({ dx: 2, peak: 1.3, delay: 0.13 }),
    // Outer spray — barely lifts off.
    Object.freeze({ dx: -3, peak: 0.6, delay: 0.20 }),
    Object.freeze({ dx: 3, peak: 0.6, delay: 0.20 }),
  ]);

/**
 * Speed classes for falling columns. A uniform spread made every column drift
 * at much the same rate; tiering it keeps a slow-drifting majority while a few
 * streakers tear down the screen roughly an order of magnitude faster.
 *
 * Weights are spawn probabilities, not the mix you see: a streaker clears the
 * screen in a fraction of a drifter's lifetime, so it occupies its column for
 * proportionally less time. The fast weight is skewed well above its intended
 * on-screen share to compensate.
 */
const MATRIX_SPEED_CLASSES: readonly { readonly weight: number; readonly low: number; readonly high: number }[] = Object
  .freeze([
    Object.freeze({ weight: 0.28, low: 0.09, high: 0.24 }), // drifters
    Object.freeze({ weight: 0.27, low: 0.30, high: 0.62 }), // mid field
    Object.freeze({ weight: 0.45, low: 0.95, high: 1.90 }), // streakers
  ]);
const DROPS_PER_COLUMN = 1.1;
const CELLS_PER_GLYPH_MUTATION = 70;

/** Deterministic glyph pool: halfwidth katakana, digits, and sparse symbols. */
const MATRIX_GLYPHS: readonly string[] = Array.from("ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇ0123456789:･=*+-");

/** Construction options shared by the Exomux animated background catalog. */
export interface ExomuxMatrixRainFieldOptions {
  readonly seed?: number;
  /** Scales the active drop count; 1 keeps roughly one drop per two columns. */
  readonly density?: number;
}

/** One falling glyph column snapshot exposed for deterministic tests. */
export interface ExomuxMatrixRainDropSnapshot {
  readonly column: number;
  readonly y: number;
  readonly speed: number;
  readonly tail: number;
  readonly boost: number;
}

/** Inspection payload mirroring the metaball field's test hook. */
export interface ExomuxMatrixRainInspection {
  readonly bounds?: Rectangle;
  readonly drops: readonly ExomuxMatrixRainDropSnapshot[];
}

interface MatrixDrop {
  column: number;
  y: number;
  speed: number;
  tail: number;
  boost: number;
}

interface MatrixSplash {
  column: number;
  /** Top-edge row of the window (in local coordinates). */
  row: number;
  spawnedAt: number;
}

interface MatrixGutterDrop {
  /** Fractional column position (slides horizontally then locks to edge). */
  x: number;
  /** Fractional row position (locks to window top while sliding, then falls). */
  y: number;
  /** -1 heading left, +1 heading right. */
  direction: number;
  hSpeed: number;
  vSpeed: number;
  /** True once the drop reached the window edge and is drizzling down. */
  falling: boolean;
  /** The column of the window edge this drop drizzles along. */
  edgeColumn: number;
  /** Window top row (local coords). */
  windowTop: number;
  /** Window bottom row (local coords, exclusive). */
  windowBottom: number;
  /** Vertical tail length while falling. */
  tail: number;
}

interface MatrixPointer extends ExomuxBackgroundPoint {
  readonly updatedAt: number;
}

/**
 * Classic "digital rain" background: independent glyph columns fall at seeded
 * speeds with bright heads and fading tails. All state derives from one LCG so
 * identical seeds and timestamps reproduce identical grids.
 */
export class ExomuxMatrixRainField implements ExomuxAnimatedBackground {
  #randomState: number;
  readonly #density: number;
  #bounds?: Rectangle;
  #pointer?: MatrixPointer;
  #lastFrameAt?: number;
  #drops: MatrixDrop[] = [];
  #splashes: MatrixSplash[] = [];
  #gutterDrops: MatrixGutterDrop[] = [];
  #activeObstacle?: Rectangle;
  #inactiveObstacles: Rectangle[] = [];
  #glyphs = new Uint8Array();
  #cells: (ExomuxBackgroundCell | undefined)[][] = [];

  constructor(options: ExomuxMatrixRainFieldOptions = {}) {
    this.#randomState = (options.seed ?? 0x4d_41_54_52) >>> 0;
    this.#density = clamp(finite(options.density, 1), 0.1, 4);
  }

  /** Updates the transient acceleration point without coupling it to input routing. */
  setPointer(point: ExomuxBackgroundPoint, now = performance.now()): void {
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

  /** Advances every drop once; returns true when a head crossed a cell or a glyph mutated. */
  advance(options: ExomuxBackgroundAdvanceOptions): boolean {
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
    const pointer = this.#pointer && now - this.#pointer.updatedAt <= POINTER_LIFETIME_MS ? this.#pointer : undefined;
    const pointerColumn = pointer ? pointer.column - bounds.column : undefined;

    // Resolve active obstacle to local coordinates (relative to bounds origin).
    const active = options.activeObstacle ? normalizeBounds(options.activeObstacle) : undefined;
    if (active) {
      this.#activeObstacle = {
        column: active.column - bounds.column,
        row: active.row - bounds.row,
        width: active.width,
        height: active.height,
      };
    } else {
      this.#activeObstacle = undefined;
    }

    // Build inactive obstacle list (all obstacles minus the active one).
    this.#inactiveObstacles = [];
    if (options.obstacles) {
      for (const raw of options.obstacles) {
        const obs = normalizeBounds(raw);
        if (!obs) continue;
        if (
          active && obs.column === active.column && obs.row === active.row &&
          obs.width === active.width && obs.height === active.height
        ) continue;
        this.#inactiveObstacles.push({
          column: obs.column - bounds.column,
          row: obs.row - bounds.row,
          width: obs.width,
          height: obs.height,
        });
      }
    }

    let changed = false;
    const obstacle = this.#activeObstacle;
    const inactives = this.#inactiveObstacles;
    for (const drop of this.#drops) {
      const boosted = pointerColumn !== undefined &&
        Math.abs(drop.column - pointerColumn) <= POINTER_REACH_COLUMNS;
      drop.boost = boosted ? 1 : Math.max(0, drop.boost - 0.12 * delta);
      // Slow the drop when it is streaking over an inactive window.
      const headRow = Math.floor(drop.y);
      let speedFactor = boosted ? POINTER_SPEED_MULTIPLIER : 1;
      for (const rect of inactives) {
        if (
          drop.column >= rect.column && drop.column < rect.column + rect.width &&
          headRow >= rect.row && headRow < rect.row + rect.height
        ) {
          speedFactor *= INACTIVE_WINDOW_SPEED_FACTOR;
          break;
        }
      }
      const previousHead = headRow;
      drop.y += drop.speed * speedFactor * delta;
      const currentHead = Math.floor(drop.y);
      if (currentHead !== previousHead) changed = true;

      // Splash and gutter drop when the leading head crosses the top edge of the active window.
      if (
        obstacle && currentHead !== previousHead &&
        previousHead < obstacle.row && currentHead >= obstacle.row &&
        drop.column >= obstacle.column && drop.column < obstacle.column + obstacle.width
      ) {
        this.#spawnSplash(drop.column, obstacle.row, now);
        this.#spawnGutterDrop(drop.column, obstacle);
        changed = true;
      }

      if (drop.y - drop.tail > bounds.height) {
        this.#respawnDrop(drop, bounds);
        changed = true;
      }
    }

    // Advance gutter drops: slide horizontally then fall down the side.
    for (const gutter of this.#gutterDrops) {
      if (!gutter.falling) {
        gutter.x += gutter.direction * gutter.hSpeed * delta;
        const reachedEdge = gutter.direction < 0 ? gutter.x <= gutter.edgeColumn : gutter.x >= gutter.edgeColumn;
        if (reachedEdge) {
          gutter.x = gutter.edgeColumn;
          gutter.y = gutter.windowTop;
          gutter.falling = true;
        }
        changed = true;
      } else {
        const prevRow = Math.floor(gutter.y);
        gutter.y += gutter.vSpeed * delta;
        if (Math.floor(gutter.y) !== prevRow) changed = true;
      }
    }
    // Expire gutter drops that fell past the window bottom + their tail.
    const guttersBefore = this.#gutterDrops.length;
    this.#gutterDrops = this.#gutterDrops.filter((g) => g.y - g.tail < g.windowBottom);
    if (this.#gutterDrops.length !== guttersBefore) changed = true;
    if (this.#gutterDrops.length > 0) changed = true;

    // Expire dead splashes.
    const splashesBefore = this.#splashes.length;
    this.#splashes = this.#splashes.filter((splash) => now - splash.spawnedAt < SPLASH_LIFETIME_MS);
    if (this.#splashes.length !== splashesBefore) changed = true;
    if (this.#splashes.length > 0) changed = true;

    const mutations = Math.max(1, Math.floor((bounds.width * bounds.height) / CELLS_PER_GLYPH_MUTATION));
    for (let index = 0; index < mutations; index += 1) {
      const cell = Math.floor(this.#random() * this.#glyphs.length);
      this.#glyphs[cell] = Math.floor(this.#random() * MATRIX_GLYPHS.length);
      changed = true;
    }
    return changed;
  }

  /** Paints heads and fading tails into a reused row-major cell buffer. */
  rasterizeCells(
    bounds: Rectangle,
    theme: ExomuxThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>> {
    const normalized = normalizeBounds(bounds);
    if (!normalized) {
      this.#cells = [];
      return this.#cells;
    }
    this.#ensureBounds(normalized);
    const { width, height } = normalized;
    this.#ensureCellBuffer(width, height);

    const headBase = mixExomuxRgb(theme.text, theme.accent, 0.35);
    const obstacle = this.#activeObstacle;
    for (const drop of this.#drops) {
      const { column } = drop;
      if (column < 0 || column >= width) continue;
      // When the drop's column is inside the active window, the window blocks
      // all cells at or below its top edge — rain lands on the roof.
      const blocked = obstacle !== undefined &&
        column >= obstacle.column && column < obstacle.column + obstacle.width;
      const head = Math.floor(drop.y);
      for (let offset = 0; offset <= drop.tail; offset += 1) {
        const row = head - offset;
        if (row < 0 || row >= height) continue;
        if (blocked && row >= obstacle!.row) continue;
        const glyph = MATRIX_GLYPHS[this.#glyphs[row * width + column] ?? 0] ?? MATRIX_GLYPHS[0]!;
        if (offset === 0) {
          const foreground = drop.boost > 0 ? mixExomuxRgb(headBase, theme.text, 0.45 * drop.boost) : headBase;
          this.#cells[row]![column] = { char: glyph, foreground, bold: true };
          continue;
        }
        const fade = (0.18 + 0.8 * (offset / drop.tail)) * (1 - 0.3 * drop.boost);
        this.#cells[row]![column] = { char: glyph, foreground: mixExomuxRgb(theme.accent, theme.background, fade) };
      }
    }

    // Render splash particles: each follows a parabolic arc above the window
    // top edge, using small punctuation chars sized to height.
    const now = this.#lastFrameAt ?? 0;
    for (const splash of this.#splashes) {
      const globalLife = (now - splash.spawnedAt) / SPLASH_LIFETIME_MS;
      if (globalLife >= 1) continue;
      for (const arc of SPLASH_ARC_PARTICLES) {
        // Each particle starts after its delay and fills the remaining time.
        const localT = (globalLife - arc.delay) / (1 - arc.delay);
        if (localT < 0 || localT > 1) continue;
        // Parabolic arc: sin gives a smooth rise-and-fall.
        const heightCells = arc.peak * Math.sin(Math.PI * localT);
        const cellRow = splash.row - 1 - Math.round(heightCells);
        if (cellRow < 0 || cellRow >= height) continue;
        const col = splash.column + arc.dx;
        if (col < 0 || col >= width) continue;
        // Pick character by height — taller = further into the sequence.
        const charIndex = Math.min(
          SPLASH_HEIGHT_CHARS.length - 1,
          Math.floor(heightCells / arc.peak * (SPLASH_HEIGHT_CHARS.length - 0.01)),
        );
        const char = SPLASH_HEIGHT_CHARS[charIndex] ?? SPLASH_HEIGHT_CHARS[0]!;
        // Fade: full brightness at peak, dim near start and end of arc.
        const arcFade = Math.sin(Math.PI * localT);
        // Outer particles are dimmer overall.
        const distanceDim = 1 - Math.abs(arc.dx) * 0.12;
        const alpha = arcFade * distanceDim;
        if (alpha <= 0.05) continue;
        const foreground = mixExomuxRgb(theme.background, headBase, alpha);
        this.#cells[cellRow]![col] = { char, foreground, bold: alpha > 0.6 };
      }
    }

    // Render gutter drops: horizontal slide along the window top, then
    // vertical drizzle down the side.
    const gutterColor = mixExomuxRgb(theme.accent, theme.background, 0.25);
    for (const gutter of this.#gutterDrops) {
      if (!gutter.falling) {
        // Horizontal slide: short tail trailing behind the head.
        const headCol = Math.floor(gutter.x);
        const slideRow = gutter.windowTop - 1;
        if (slideRow < 0 || slideRow >= height) continue;
        for (let t = 0; t <= GUTTER_SLIDE_TAIL; t += 1) {
          const col = headCol - gutter.direction * t;
          if (col < 0 || col >= width) continue;
          const fade = t / (GUTTER_SLIDE_TAIL + 1);
          const fg = mixExomuxRgb(gutterColor, theme.background, fade);
          const glyph = MATRIX_GLYPHS[this.#glyphs[slideRow * width + col] ?? 0] ?? MATRIX_GLYPHS[0]!;
          this.#cells[slideRow]![col] = { char: glyph, foreground: fg, bold: t === 0 };
        }
      } else {
        // Vertical drizzle down the side of the window.
        const col = gutter.edgeColumn;
        if (col < 0 || col >= width) continue;
        const head = Math.floor(gutter.y);
        for (let t = 0; t <= gutter.tail; t += 1) {
          const row = head - t;
          if (row < 0 || row >= height) continue;
          const fade = t / (gutter.tail + 1);
          const fg = mixExomuxRgb(gutterColor, theme.background, fade);
          const glyph = MATRIX_GLYPHS[this.#glyphs[row * width + col] ?? 0] ?? MATRIX_GLYPHS[0]!;
          this.#cells[row]![col] = { char: glyph, foreground: fg, bold: t === 0 };
        }
      }
    }

    return this.#cells;
  }

  /** Deterministic state snapshot for tests. */
  inspect(): ExomuxMatrixRainInspection {
    return {
      ...(this.#bounds ? { bounds: { ...this.#bounds } } : {}),
      drops: this.#drops.map((drop) => ({ ...drop })),
    };
  }

  #ensureBounds(bounds: Rectangle): void {
    const previous = this.#bounds;
    if (previous?.width === bounds.width && previous.height === bounds.height) {
      this.#bounds = { ...bounds };
      return;
    }
    this.#bounds = { ...bounds };
    const area = bounds.width * bounds.height;
    this.#glyphs = new Uint8Array(area);
    for (let index = 0; index < area; index += 1) {
      this.#glyphs[index] = Math.floor(this.#random() * MATRIX_GLYPHS.length);
    }
    const count = Math.max(1, Math.round(bounds.width * DROPS_PER_COLUMN * this.#density));
    this.#drops = Array.from({ length: count }, () => this.#createDrop(bounds));
  }

  #ensureCellBuffer(width: number, height: number): void {
    if (this.#cells.length === height && (this.#cells[0]?.length ?? -1) === width) {
      for (const row of this.#cells) row.fill(undefined);
      return;
    }
    this.#cells = Array.from(
      { length: height },
      () => new Array<ExomuxBackgroundCell | undefined>(width).fill(undefined),
    );
  }

  #createDrop(bounds: Rectangle): MatrixDrop {
    const speed = this.#rollSpeed();
    return {
      column: Math.floor(this.#random() * bounds.width),
      y: -this.#random() * bounds.height,
      speed,
      tail: this.#rollTail(speed),
      boost: 0,
    };
  }

  #spawnSplash(column: number, row: number, now: number): void {
    this.#splashes.push({ column, row, spawnedAt: now });
  }

  #spawnGutterDrop(column: number, obstacle: Rectangle): void {
    const leftDist = column - obstacle.column;
    const rightDist = (obstacle.column + obstacle.width - 1) - column;
    // Head toward the nearest edge; break ties with the RNG.
    const goLeft = leftDist < rightDist || (leftDist === rightDist && this.#random() < 0.5);
    const direction = goLeft ? -1 : 1;
    const edgeColumn = goLeft ? obstacle.column - 1 : obstacle.column + obstacle.width;
    this.#gutterDrops.push({
      x: column,
      y: obstacle.row,
      direction,
      hSpeed: GUTTER_H_SPEED_LOW + this.#random() * (GUTTER_H_SPEED_HIGH - GUTTER_H_SPEED_LOW),
      vSpeed: GUTTER_V_SPEED_LOW + this.#random() * (GUTTER_V_SPEED_HIGH - GUTTER_V_SPEED_LOW),
      falling: false,
      edgeColumn,
      windowTop: obstacle.row,
      windowBottom: obstacle.row + obstacle.height,
      tail: Math.round(GUTTER_FALL_TAIL_MIN + this.#random() * (GUTTER_FALL_TAIL_MAX - GUTTER_FALL_TAIL_MIN)),
    });
  }

  #respawnDrop(drop: MatrixDrop, bounds: Rectangle): void {
    drop.column = Math.floor(this.#random() * bounds.width);
    drop.y = -(1 + this.#random() * bounds.height * 0.6);
    drop.speed = this.#rollSpeed();
    drop.tail = this.#rollTail(drop.speed);
    drop.boost = 0;
  }

  /** Draws a fall rate from the weighted speed classes. */
  #rollSpeed(): number {
    let roll = this.#random();
    for (const speedClass of MATRIX_SPEED_CLASSES) {
      if (roll < speedClass.weight) {
        return speedClass.low + this.#random() * (speedClass.high - speedClass.low);
      }
      roll -= speedClass.weight;
    }
    const last = MATRIX_SPEED_CLASSES[MATRIX_SPEED_CLASSES.length - 1]!;
    return last.low + this.#random() * (last.high - last.low);
  }

  /** Faster columns stretch longer tails, so streaks read as motion not noise. */
  #rollTail(speed: number): number {
    const span = MAX_TAIL_CELLS - MIN_TAIL_CELLS;
    const bias = Math.min(1, speed / MATRIX_SPEED_CLASSES[MATRIX_SPEED_CLASSES.length - 1]!.high);
    const base = MIN_TAIL_CELLS + span * bias * 0.6;
    return Math.min(MAX_TAIL_CELLS, Math.round(base + this.#random() * span * 0.4));
  }

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
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
