// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "../../types.ts";
import {
  mixShellRgb,
  type ShellBackgroundAdvanceOptions,
  type ShellBackgroundCell,
  type ShellBackgroundPoint,
  type ShellInteractiveBackground,
  type ShellOverlayBackground,
  type ShellOverlayCell,
} from "./contract.ts";
import type { ShellRgb, ShellThemeSpec } from "../shell_theme.ts";

// ── rain constants ──────────────────────────────────────────────────────────

const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const POINTER_LIFETIME_MS = 1_500;
const POINTER_REACH_COLUMNS = 6;
const POINTER_SPEED_MULTIPLIER = 2;
const MIN_TAIL_CELLS = 3;
const MAX_TAIL_CELLS = 14;
/**
 * Drops in flight per desktop cell. Scaling with area rather than width keeps
 * the rain equally dense on a tall terminal — and, because a taller screen is
 * otherwise a longer fall for the same number of drops, keeps the pool filling
 * on a comparable timescale instead of taking a quarter of an hour.
 */
const DROPS_PER_CELL = 0.05;
/** Speed multiplier when a drop is inside an inactive window. */
const INACTIVE_WINDOW_SPEED_FACTOR = 0.35;

const RAIN_SPEED_CLASSES: readonly { readonly weight: number; readonly low: number; readonly high: number }[] = Object
  .freeze([
    Object.freeze({ weight: 0.28, low: 0.09, high: 0.24 }), // drifters
    Object.freeze({ weight: 0.27, low: 0.30, high: 0.62 }), // mid field
    Object.freeze({ weight: 0.45, low: 0.95, high: 1.90 }), // streakers
  ]);

const MAX_DROP_SPEED = RAIN_SPEED_CLASSES[RAIN_SPEED_CLASSES.length - 1]!.high;

/**
 * Streak glyphs per speed class. A falling drop is drawn as one leading head
 * with a vertical trail above it, so the field reads as rain rather than as
 * columns of characters: the slow classes thin out to a dotted thread while
 * streakers pull a solid heavy line behind them.
 */
const RAIN_STREAKS: readonly { readonly head: string; readonly body: string; readonly tip: string }[] = Object.freeze([
  Object.freeze({ head: "╷", body: "┊", tip: "." }),
  Object.freeze({ head: "│", body: "┆", tip: "'" }),
  Object.freeze({ head: "┃", body: "│", tip: "╵" }),
]);

/** Fraction of the trail drawn with the body glyph before it thins to the tip. */
const STREAK_BODY_FRACTION = 0.55;

/**
 * Target blue used to tint theme colors into a cool rain palette. Every theme
 * gets blended toward this so the rain always reads as "blue-ish" without
 * ignoring the theme's own hues entirely.
 */
const RAIN_BLUE_TARGET: ShellRgb = [80, 140, 220];

// ── splash constants ────────────────────────────────────────────────────────

const SPLASH_LIFETIME_MS = 550;

/**
 * Characters ordered by height above the surface for splash arcs.
 */
const SPLASH_HEIGHT_CHARS: readonly string[] = [".", ",", "'", '"', "`", "~"];

/**
 * Base particle arcs for a splash. Peak heights are scaled by drop speed at
 * spawn time so fast streakers throw big crowns while drifters barely ripple.
 */
const SPLASH_ARC_TEMPLATES: readonly { readonly dx: number; readonly peak: number; readonly delay: number }[] = Object
  .freeze([
    Object.freeze({ dx: 0, peak: 2.8, delay: 0 }),
    Object.freeze({ dx: -1, peak: 2.1, delay: 0.06 }),
    Object.freeze({ dx: 1, peak: 2.1, delay: 0.06 }),
    Object.freeze({ dx: -2, peak: 1.3, delay: 0.13 }),
    Object.freeze({ dx: 2, peak: 1.3, delay: 0.13 }),
    Object.freeze({ dx: -3, peak: 0.6, delay: 0.20 }),
    Object.freeze({ dx: 3, peak: 0.6, delay: 0.20 }),
  ]);

/** Minimum splash scale (for the slowest drifters). */
const SPLASH_SCALE_MIN = 0.25;

/**
 * Odds a landing throws a crown at all, from a drifter to a full streaker.
 * Every drop now breaks on something, so crowning all of them turns the three
 * rows above the waterline into a wall of punctuation.
 */
const SPLASH_CHANCE_MIN = 0.08;
const SPLASH_CHANCE_MAX = 0.55;

// ── 2-D fluid constants ─────────────────────────────────────────────────────

/**
 * Water one impact adds to the grid, before the speed weighting. Tuned so the
 * floor is visibly wet within a few seconds and a left-alone desktop takes a
 * couple of minutes to flood — long enough that the drain is a choice rather
 * than a chore.
 */
const RAIN_DEPOSIT_BASE = 0.26;
/** Share of a deposit shed onto a window's top row as the drop runs past it. */
const RAIN_SHED_FRACTION = 0.35;
/** Water level at which a cell counts as a surface a falling drop breaks on. */
const SURFACE_IMPACT_LEVEL = 0.35;
/**
 * Solver sub-steps per background frame. Water only travels one cell per step,
 * so this is what decides how fast a pool can feed the drain from across the
 * desktop; below about six the far edge of a flooded screen never keeps up with
 * the sump and the level stops falling.
 */
const FLUID_ITERATIONS = 8;
/** How much of a proposed vertical flow actually moves per iteration. */
const VERTICAL_DAMPING = 0.95;
/**
 * Share of the height difference a cell hands to each horizontal neighbour.
 * A third is the stiffest value that cannot overshoot: a full cell between two
 * dry ones settles at exactly one third each.
 */
const LATERAL_SHARE = 3;
/**
 * Sideways flow per unit of head difference between two submerged cells. The
 * level rule alone cannot move water at depth — two full cells look identical
 * to it however much water is stacked on top of each — so without this the
 * drain digs a funnel it can never refill from the far side of the desktop.
 */
const PRESSURE_RATE = 0.14;
/** Ceiling on one pressure transfer, which keeps a deep pool from sloshing. */
const MAX_PRESSURE_FLOW = 0.5;
/** Level at which a cell counts as submerged and answers to head instead. */
const SUBMERGED_LEVEL = 0.9;
/** Nominal capacity of one cell. */
const MAX_WATER = 1;
/** Extra water a pressurized cell holds before pushing the surplus upward. */
const MAX_COMPRESSION = 0.02;
/** Cap on how much water crosses one cell boundary per solver iteration. */
const MAX_FLOW = 1;
/** Flows above this are halved, which damps the oscillation at a waterline. */
const MIN_FLOW = 0.01;
/** Below this a cell is swept dry, so traces never keep the field repainting. */
const MIN_WATER = 0.004;
/** Water level at which a cell is painted at all. */
const MIN_RENDER_WATER = 0.03;

/** Sub-cell waterline glyphs; index by eighths of a cell. */
const SURFACE_BLOCKS: readonly string[] = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
/** Body glyph one row under the waterline, before it goes fully solid. */
const SUBSURFACE_CHAR = "▓";
const SUBMERGED_CHAR = "█";
/** Distinct shades in the depth ramp; deeper water paints darker. */
const WATER_SHADES = 10;
/** Rows below the surface at which the depth ramp bottoms out. */
const WATER_SHADE_DEPTH = 9;

const WATER_SHALLOW: ShellRgb = [96, 170, 235];
const WATER_DEEP: ShellRgb = [20, 54, 108];

// ── surface wave constants ──────────────────────────────────────────────────

/**
 * The height solver is diffusive: it has no momentum, so however fast it is
 * made it can only ever smooth a disturbance away in place, and a settled pool
 * renders as a motionless bar. Waves are carried instead by a damped 1-D wave
 * equation along the waterline, which is what makes the liquid read as thin and
 * quick rather than thick — a landing drop sends a ring travelling outward
 * instead of being absorbed on the spot.
 *
 * Squared wave speed, in cells per frame. Must stay at or below 1 or the
 * leapfrog integration goes unstable and the surface tears itself apart.
 */
const RIPPLE_STIFFNESS = 0.7;
/**
 * Energy a ripple loses per frame — the surface's viscosity, and the knob to
 * turn if the water should look thinner still. Lower carries a ring further.
 */
const RIPPLE_DAMPING = 0.018;
/**
 * Sub-cell dimple a landing punches into the surface, before speed weighting.
 * Spread over three columns rather than one: a single-column delta is the
 * highest frequency the field can hold, and a storm of them reads as static
 * instead of as rings.
 */
const RIPPLE_IMPACT = 0.3;
/** Amplitude ceiling, so a heavy storm cannot shake the waterline to pieces. */
const MAX_RIPPLE = 0.9;

// ── drain constants ─────────────────────────────────────────────────────────

/** Half-width of the sump; the drain pulls from `2 * half + 1` columns. */
const DRAIN_APERTURE_HALF = 3;
/** Water the centre sump column swallows per solver iteration. */
const DRAIN_PER_ITERATION = 3;
/**
 * Share of a cell's water dragged one column toward the plug per iteration
 * while the drain is open. Diffusion alone is far too slow to feed a hole this
 * small — the sump empties its own neighbourhood in a second and then waits on
 * a level difference that takes minutes to arrive — so pulling the plug also
 * tilts the floor, and the pool sheets toward the middle as a visible current.
 */
const DRAIN_PULL = 0.1;
/** Cells either side of centre the clickable plug fixture occupies. */
const PLUG_HALF_WIDTH = 1;
/** Swirl cycled through the open plug; one step per background frame. */
const DRAIN_SWIRL: readonly string[] = ["◐", "◓", "◑", "◒"];
const PLUG_CLOSED_CHAR = "▣";

// ── interfaces ──────────────────────────────────────────────────────────────

interface RainyDrop {
  column: number;
  y: number;
  speed: number;
  /** Index into {@link RAIN_STREAKS}; fixed for the life of the drop. */
  streak: number;
  tail: number;
  boost: number;
}

interface RainySplash {
  column: number;
  row: number;
  spawnedAt: number;
  /** Speed-proportional scale applied to all arc peaks. */
  scale: number;
}

interface RainyPointer extends ShellBackgroundPoint {
  readonly updatedAt: number;
}

/** Reused overlay entry; the field owns these and rewrites them every frame. */
interface MutableOverlayCell {
  column: number;
  row: number;
  readonly cell: { char: string; foreground: ShellRgb; bold: boolean };
}

/** Construction options. */
export interface ShellRainyWindowsFieldOptions {
  readonly seed?: number;
  readonly density?: number;
}

/**
 * "Rainy windows" background: streaking rain over a two-dimensional shallow
 * water simulation. Drops break on whatever they land on — the floor, a window
 * roof, or the rising pool — and the water they leave behind flows, pools, and
 * presses back up under its own weight until it is deep enough to drown the
 * desktop. A drain plug sits in the bottom middle: click it to pull the plug.
 *
 * Windows are solid to the water but transparent to the rain, which keeps the
 * pool off legible terminal text while still letting streaks run down the glass
 * over an idle window during the overgrowth pass.
 */
export class ShellRainyWindowsField implements ShellOverlayBackground, ShellInteractiveBackground {
  #randomState: number;
  readonly #density: number;
  #bounds?: Rectangle;
  #pointer?: RainyPointer;
  #lastFrameAt?: number;
  #frame = 0;

  // Rain.
  #drops: RainyDrop[] = [];
  #cells: (ShellBackgroundCell | undefined)[][] = [];

  // Window interaction.
  #inactiveObstacles: Rectangle[] = [];
  #splashes: RainySplash[] = [];

  // 2-D fluid over the whole desktop body.
  #gridWidth = 0;
  #gridHeight = 0;
  #water = new Float32Array(0);
  #waterNext = new Float32Array(0);
  #head = new Float32Array(0);
  #solid = new Uint8Array(0);
  /** Waterline displacement per column, and the frame before it. */
  #ripple = new Float32Array(0);
  #ripplePrevious = new Float32Array(0);
  #totalWater = 0;

  // Drain.
  #drainOpen = false;
  #drained = 0;

  // Overlay emission; pooled so a flooded desktop does not allocate per cell.
  readonly #overlayPool: MutableOverlayCell[] = [];
  readonly #overlay: MutableOverlayCell[] = [];
  readonly #shades: ShellRgb[] = [];

  constructor(options: ShellRainyWindowsFieldOptions = {}) {
    this.#randomState = (options.seed ?? 0x52_41_49_4e) >>> 0;
    this.#density = clamp(finite(options.density, 1), 0.1, 4);
  }

  /** True while the plug is pulled and the sump is swallowing water. */
  get drainOpen(): boolean {
    return this.#drainOpen;
  }

  /** Total water currently held by the grid, in cell-fill units. */
  get waterVolume(): number {
    return this.#totalWater;
  }

  /** Cumulative water the drain has swallowed since the field was created. */
  get drainedVolume(): number {
    return this.#drained;
  }

  /** Water level at one cell, in bounds-relative coordinates. */
  waterAt(column: number, row: number): number {
    if (column < 0 || column >= this.#gridWidth || row < 0 || row >= this.#gridHeight) return 0;
    return this.#water[row * this.#gridWidth + column] ?? 0;
  }

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

  /**
   * Toggles the drain plug when the click lands on the fixture. Everything else
   * falls through so an ordinary desktop click still reaches the window host.
   */
  pick(column: number, row: number, _now: number = performance.now()): boolean {
    if (!this.#hitsPlug(column, row)) return false;
    this.#drainOpen = !this.#drainOpen;
    return true;
  }

  /**
   * The plug is painted in the post-window overlay, so it stays visible — and
   * must stay clickable — even when a window is tiled over the bottom row.
   */
  picksOverWindows(column: number, row: number): boolean {
    return this.#hitsPlug(column, row);
  }

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
    this.#frame += 1;
    const pointer = this.#pointer && now - this.#pointer.updatedAt <= POINTER_LIFETIME_MS ? this.#pointer : undefined;
    const pointerColumn = pointer ? pointer.column - bounds.column : undefined;

    const active = options.activeObstacle ? this.#toLocal(options.activeObstacle, bounds) : undefined;

    // Inactive windows only slow the rain sheeting over them; they are still
    // solid to the water, which is resolved from the collision list below.
    this.#inactiveObstacles = [];
    for (const raw of options.obstacles ?? []) {
      const obstacle = this.#toLocal(raw, bounds);
      if (!obstacle || (active && sameRect(obstacle, active))) continue;
      this.#inactiveObstacles.push(obstacle);
    }

    // `obstacles` drops windows the desktop has begun reclaiming, which is right
    // for routing but wrong for physics: a window still occupies its rectangle
    // while it is being overgrown. `solidObstacles` carries the unfiltered set.
    const collisions: Rectangle[] = [];
    for (const raw of options.solidObstacles ?? options.obstacles ?? []) {
      const obstacle = this.#toLocal(raw, bounds);
      if (obstacle) collisions.push(obstacle);
    }
    if (active && !collisions.some((rect) => sameRect(rect, active))) collisions.push(active);
    this.#syncSolids(collisions);

    let changed = false;
    for (const drop of this.#drops) {
      if (this.#advanceDrop(drop, bounds, pointerColumn, delta, now)) changed = true;
    }

    for (let iteration = 0; iteration < FLUID_ITERATIONS; iteration += 1) {
      this.#fluidIteration();
      this.#pressureIteration();
      this.#drainCurrent();
      this.#drainIteration();
    }
    const wetBefore = this.#totalWater;
    this.#settleWater();
    this.#rippleStep();
    if (this.#totalWater > 0 || wetBefore > 0) changed = true;

    const splashesBefore = this.#splashes.length;
    this.#splashes = this.#splashes.filter((splash) => now - splash.spawnedAt < SPLASH_LIFETIME_MS);
    if (this.#splashes.length !== splashesBefore || this.#splashes.length > 0) changed = true;
    if (this.#drainOpen) changed = true;

    return changed;
  }

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

    // Derive a blue-tinted rain palette that harmonizes with the current theme.
    const rainBright = mixShellRgb(mixShellRgb(theme.text, RAIN_BLUE_TARGET, 0.45), theme.accent, 0.2);
    const rainBody = mixShellRgb(theme.accent, RAIN_BLUE_TARGET, 0.5);

    // Rain falls in front of every window: the grid is painted under the window
    // stack for the bare desktop and read back by the overgrowth pass, which is
    // what lets streaks bleed down over an idle window.
    for (const drop of this.#drops) {
      const { column } = drop;
      if (column < 0 || column >= width) continue;
      const streak = RAIN_STREAKS[drop.streak] ?? RAIN_STREAKS[0]!;
      const head = Math.floor(drop.y);
      const bodyReach = Math.max(1, Math.round(drop.tail * STREAK_BODY_FRACTION));
      for (let offset = 0; offset <= drop.tail; offset += 1) {
        const row = head - offset;
        if (row < 0 || row >= height) continue;
        if (offset === 0) {
          const foreground = drop.boost > 0 ? mixShellRgb(rainBright, theme.text, 0.45 * drop.boost) : rainBright;
          this.#cells[row]![column] = { char: streak.head, foreground, bold: true };
          continue;
        }
        const fade = (0.18 + 0.8 * (offset / drop.tail)) * (1 - 0.3 * drop.boost);
        this.#cells[row]![column] = {
          char: offset <= bodyReach ? streak.body : streak.tip,
          foreground: mixShellRgb(rainBody, theme.background, fade),
        };
      }
    }

    return this.#cells;
  }

  /**
   * Overlay cells painted AFTER windows so the pool, the splashes, and the plug
   * stay visible even when tiled windows cover the background grid.
   */
  rasterizeOverlayCells(
    bounds: Rectangle,
    theme: ShellThemeSpec,
  ): readonly ShellOverlayCell[] {
    this.#overlay.length = 0;
    const normalized = normalizeBounds(bounds);
    if (!normalized) return this.#overlay;
    const { width, height } = normalized;
    if (width !== this.#gridWidth || height !== this.#gridHeight) return this.#overlay;

    const rainBright = mixShellRgb(mixShellRgb(theme.text, RAIN_BLUE_TARGET, 0.45), theme.accent, 0.2);
    this.#syncShades(theme);

    // ── splash arcs (scaled by impact speed) ────────────────────────────
    const now = this.#lastFrameAt ?? 0;
    for (const splash of this.#splashes) {
      const globalLife = (now - splash.spawnedAt) / SPLASH_LIFETIME_MS;
      if (globalLife >= 1) continue;
      for (const arc of SPLASH_ARC_TEMPLATES) {
        const localT = (globalLife - arc.delay) / (1 - arc.delay);
        if (localT < 0 || localT > 1) continue;
        const scaledPeak = arc.peak * splash.scale;
        const heightCells = scaledPeak * Math.sin(Math.PI * localT);
        const cellRow = splash.row - 1 - Math.round(heightCells);
        if (cellRow < 0 || cellRow >= height) continue;
        const col = splash.column + arc.dx;
        if (col < 0 || col >= width) continue;
        const charIndex = Math.min(
          SPLASH_HEIGHT_CHARS.length - 1,
          Math.floor(heightCells / Math.max(0.1, scaledPeak) * (SPLASH_HEIGHT_CHARS.length - 0.01)),
        );
        const char = SPLASH_HEIGHT_CHARS[charIndex] ?? SPLASH_HEIGHT_CHARS[0]!;
        const arcFade = Math.sin(Math.PI * localT);
        const distanceDim = 1 - Math.abs(arc.dx) * 0.12;
        const alpha = arcFade * distanceDim;
        if (alpha <= 0.05) continue;
        // A crown thrown up beside a window must not blow across its face; the
        // overlay is painted after the window stack, so nothing else clips it.
        if (this.#solid[cellRow * width + col]) continue;
        this.#emit(col, cellRow, char, mixShellRgb(theme.background, rainBright, alpha), alpha > 0.6);
      }
    }

    // ── the pool ────────────────────────────────────────────────────────
    if (this.#totalWater > 0) {
      for (let column = 0; column < width; column += 1) {
        // Depth restarts at every solid cell and every dry gap, so a puddle on a
        // window roof shades from its own surface rather than the one below it.
        let depth = 0;
        for (let row = 0; row < height; row += 1) {
          const index = row * width + column;
          if (this.#solid[index]) {
            depth = 0;
            continue;
          }
          const level = this.#water[index]!;
          if (level < MIN_RENDER_WATER) {
            depth = 0;
            continue;
          }
          const shade = this
            .#shades[Math.min(WATER_SHADES - 1, Math.round(depth / WATER_SHADE_DEPTH * (WATER_SHADES - 1)))]!;
          if (depth > 0) {
            this.#emit(column, row, depth === 1 ? SUBSURFACE_CHAR : SUBMERGED_CHAR, shade, false);
            depth += 1;
            continue;
          }
          // The waterline carries the wave field. A crest rising past a full cell
          // spills into the row above, which is what makes a passing ring read as
          // a moving peak rather than as another shade of the same glyph.
          const lifted = level + this.#ripple[column]!;
          if (lifted < MIN_RENDER_WATER) {
            // A trough deep enough to swallow this cell: leave it empty and let
            // the row below become the waterline, so a passing dip actually
            // moves the surface down instead of flattening against the floor.
            continue;
          }
          if (lifted > 1 && row > 0 && !this.#solid[index - width]) {
            this.#emit(column, row, SUBSURFACE_CHAR, shade, false);
            this.#emit(column, row - 1, surfaceBlock(lifted - 1), this.#shades[0]!, false);
          } else {
            this.#emit(column, row, surfaceBlock(lifted), shade, false);
          }
          depth += 1;
        }
      }
    }

    // ── the drain plug, painted last so it is never submerged ───────────
    const plug = this.#plugColumn();
    if (plug !== undefined) {
      const row = height - 1;
      const swirl = DRAIN_SWIRL[this.#frame % DRAIN_SWIRL.length]!;
      const rim = mixShellRgb(theme.border, theme.background, 0.15);
      const core = this.#drainOpen ? theme.warning : mixShellRgb(theme.muted, theme.text, 0.2);
      for (let dx = -PLUG_HALF_WIDTH; dx <= PLUG_HALF_WIDTH; dx += 1) {
        const column = plug + dx;
        if (column < 0 || column >= width) continue;
        const char = dx === 0 ? (this.#drainOpen ? swirl : PLUG_CLOSED_CHAR) : dx < 0 ? "[" : "]";
        this.#emit(column, row, char, dx === 0 ? core : rim, dx === 0);
      }
    }

    return this.#overlay;
  }

  // ── private helpers ─────────────────────────────────────────────────────

  /** Centre column of the plug fixture, or undefined when the body is too narrow. */
  #plugColumn(): number | undefined {
    if (this.#gridWidth < 2 * PLUG_HALF_WIDTH + 1 || this.#gridHeight < 1) return undefined;
    return Math.floor(this.#gridWidth / 2);
  }

  /** True when an absolute desktop cell lands on the plug fixture. */
  #hitsPlug(column: number, row: number): boolean {
    const bounds = this.#bounds;
    const plug = this.#plugColumn();
    if (!bounds || plug === undefined) return false;
    const x = Math.floor(column - bounds.column);
    const y = Math.floor(row - bounds.row);
    return y === this.#gridHeight - 1 && Math.abs(x - plug) <= PLUG_HALF_WIDTH;
  }

  #toLocal(rect: Rectangle, bounds: Rectangle): Rectangle | undefined {
    const normalized = normalizeBounds(rect);
    if (!normalized) return undefined;
    return {
      column: normalized.column - bounds.column,
      row: normalized.row - bounds.row,
      width: normalized.width,
      height: normalized.height,
    };
  }

  /**
   * Advances one drop and resolves what it lands on. Returns true when the drop
   * moved far enough to change a painted cell.
   */
  #advanceDrop(
    drop: RainyDrop,
    bounds: Rectangle,
    pointerColumn: number | undefined,
    delta: number,
    now: number,
  ): boolean {
    const boosted = pointerColumn !== undefined && Math.abs(drop.column - pointerColumn) <= POINTER_REACH_COLUMNS;
    drop.boost = boosted ? 1 : Math.max(0, drop.boost - 0.12 * delta);
    const previousHead = Math.floor(drop.y);
    let speedFactor = boosted ? POINTER_SPEED_MULTIPLIER : 1;
    for (const rect of this.#inactiveObstacles) {
      if (
        drop.column >= rect.column && drop.column < rect.column + rect.width &&
        previousHead >= rect.row && previousHead < rect.row + rect.height
      ) {
        speedFactor *= INACTIVE_WINDOW_SPEED_FACTOR;
        break;
      }
    }
    drop.y += drop.speed * speedFactor * delta;
    const currentHead = Math.floor(drop.y);
    let changed = currentHead !== previousHead;

    const deposit = RAIN_DEPOSIT_BASE * (0.4 + 0.6 * Math.min(1, drop.speed / MAX_DROP_SPEED));
    for (let row = Math.max(0, previousHead + 1); row <= currentHead; row += 1) {
      if (row >= this.#gridHeight) {
        // The floor: everything the drop is carrying joins the pool.
        this.#land(drop, this.#gridHeight - 1, deposit, now);
        this.#respawnDrop(drop, bounds);
        return true;
      }
      const index = row * this.#gridWidth + drop.column;
      if (this.#solid[index]) {
        // A window roof. The drop sheds part of its load onto the roof and keeps
        // falling, because the rain is on the glass in front of the window.
        if (row > 0 && !this.#solid[index - this.#gridWidth]) {
          this.#deposit(drop.column, row - 1, deposit * RAIN_SHED_FRACTION);
          this.#splash(drop, row - 1, now, RAIN_SHED_FRACTION);
          changed = true;
        }
        continue;
      }
      if (this.#water[index]! >= SURFACE_IMPACT_LEVEL) {
        this.#land(drop, row, deposit, now);
        this.#respawnDrop(drop, bounds);
        return true;
      }
    }

    if (drop.y - drop.tail > bounds.height) {
      this.#respawnDrop(drop, bounds);
      changed = true;
    }
    return changed;
  }

  /** Breaks a drop on a surface: one splash crown plus its whole water load. */
  #land(drop: RainyDrop, row: number, deposit: number, now: number): void {
    this.#deposit(drop.column, row, deposit);
    this.#splash(drop, row, now, 1);
  }

  #splash(drop: RainyDrop, row: number, now: number, weight: number): void {
    const fast = Math.min(1, drop.speed / MAX_DROP_SPEED);
    // Every landing rings the surface, even the ones too slow to throw a crown.
    this.#disturb(drop.column, RIPPLE_IMPACT * (0.35 + 0.65 * fast) * weight);
    const chance = (SPLASH_CHANCE_MIN + (SPLASH_CHANCE_MAX - SPLASH_CHANCE_MIN) * fast) * weight;
    if (this.#random() >= chance) return;
    const speedScale = SPLASH_SCALE_MIN + (1 - SPLASH_SCALE_MIN) * fast;
    this.#splashes.push({ column: drop.column, row, spawnedAt: now, scale: speedScale * weight });
  }

  #deposit(column: number, row: number, amount: number): void {
    if (column < 0 || column >= this.#gridWidth || row < 0 || row >= this.#gridHeight) return;
    const index = row * this.#gridWidth + column;
    if (this.#solid[index]) return;
    this.#water[index] = this.#water[index]! + amount;
    this.#totalWater += amount;
  }

  /** Rebuilds the collision map, lifting water out of newly covered cells. */
  #syncSolids(rects: readonly Rectangle[]): void {
    const width = this.#gridWidth;
    const height = this.#gridHeight;
    const solid = this.#solid;
    solid.fill(0);
    for (const rect of rects) {
      const fromRow = Math.max(0, rect.row);
      const toRow = Math.min(height, rect.row + rect.height);
      const fromColumn = Math.max(0, rect.column);
      const toColumn = Math.min(width, rect.column + rect.width);
      for (let row = fromRow; row < toRow; row += 1) {
        solid.fill(1, row * width + fromColumn, row * width + toColumn);
      }
    }
    // A window that opens over standing water displaces it upward rather than
    // deleting it, so the pool volume survives a layout change.
    for (let row = height - 1; row >= 0; row -= 1) {
      for (let column = 0; column < width; column += 1) {
        const index = row * width + column;
        if (!solid[index]) continue;
        const trapped = this.#water[index]!;
        if (trapped <= 0) continue;
        this.#water[index] = 0;
        let target = row - 1;
        while (target >= 0 && solid[target * width + column]) target -= 1;
        if (target >= 0) this.#water[target * width + column] = this.#water[target * width + column]! + trapped;
        else this.#totalWater -= trapped;
      }
    }
  }

  /**
   * One step of a compressible shallow-water cellular automaton: each wet cell
   * pushes down first, equalizes sideways, then vents any surplus upward, which
   * is what lets a connected pool find one level instead of piling up.
   */
  #fluidIteration(): void {
    const width = this.#gridWidth;
    const height = this.#gridHeight;
    const water = this.#water;
    const next = this.#waterNext;
    const solid = this.#solid;
    next.set(water);

    for (let row = height - 1; row >= 0; row -= 1) {
      for (let column = 0; column < width; column += 1) {
        const index = row * width + column;
        if (solid[index]) continue;
        let remaining = water[index]!;
        if (remaining <= MIN_WATER) continue;

        if (row + 1 < height) {
          const below = index + width;
          if (!solid[below]) {
            const flow = damp(stableLevel(remaining + water[below]!) - water[below]!, remaining);
            if (flow > 0) {
              next[index] = next[index]! - flow;
              next[below] = next[below]! + flow;
              remaining -= flow;
            }
          }
        }
        if (remaining <= MIN_WATER) continue;

        if (column > 0 && !solid[index - 1]) {
          const flow = spread(remaining - water[index - 1]!, remaining);
          if (flow > 0) {
            next[index] = next[index]! - flow;
            next[index - 1] = next[index - 1]! + flow;
            remaining -= flow;
          }
        }
        if (remaining <= MIN_WATER) continue;

        if (column + 1 < width && !solid[index + 1]) {
          const flow = spread(remaining - water[index + 1]!, remaining);
          if (flow > 0) {
            next[index] = next[index]! - flow;
            next[index + 1] = next[index + 1]! + flow;
            remaining -= flow;
          }
        }
        if (remaining <= MIN_WATER) continue;

        if (row > 0) {
          const above = index - width;
          if (!solid[above]) {
            const flow = damp(remaining - stableLevel(remaining + water[above]!), remaining);
            if (flow > 0) {
              next[index] = next[index]! - flow;
              next[above] = next[above]! + flow;
            }
          }
        }
      }
    }

    this.#water = next;
    this.#waterNext = water;
  }

  /**
   * Hydrostatic correction. Recomputes how much water each cell is carrying on
   * its back, then pushes submerged neighbours toward equal head, which is what
   * lets a pool on the far side of the desktop actually reach an open drain
   * instead of standing there while the middle empties out.
   */
  #pressureIteration(): void {
    const width = this.#gridWidth;
    const height = this.#gridHeight;
    const water = this.#water;
    const next = this.#waterNext;
    const head = this.#head;
    const solid = this.#solid;

    // Head resets at every solid cell and dry gap, so a puddle on a window roof
    // never presses against the flood standing beside the window.
    for (let column = 0; column < width; column += 1) {
      let above = 0;
      for (let row = 0; row < height; row += 1) {
        const index = row * width + column;
        const level = water[index]!;
        if (solid[index] || level <= MIN_WATER) {
          above = 0;
          head[index] = 0;
          continue;
        }
        head[index] = above;
        above += level;
      }
    }

    next.set(water);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column + 1 < width; column += 1) {
        const index = row * width + column;
        const right = index + 1;
        if (solid[index] || solid[right]) continue;
        const left = water[index]!;
        const other = water[right]!;
        if (left < SUBMERGED_LEVEL || other < SUBMERGED_LEVEL) continue;
        const difference = head[index]! - head[right]!;
        if (difference === 0) continue;
        const wanted = clamp(difference * PRESSURE_RATE, -MAX_PRESSURE_FLOW, MAX_PRESSURE_FLOW);
        const flow = wanted > 0 ? Math.min(wanted, left) : -Math.min(-wanted, other);
        next[index] = next[index]! - flow;
        next[right] = next[right]! + flow;
      }
    }

    this.#water = next;
    this.#waterNext = water;
  }

  /**
   * Drags the pool toward the plug while it is open. Each half of the desktop is
   * swept starting from the column beside the sump, so an entire run of cells
   * shifts inward in one pass rather than one cell per iteration; that is what
   * turns the drain from a slow dimple into a current the whole surface follows.
   */
  #drainCurrent(): void {
    if (!this.#drainOpen) return;
    const plug = this.#plugColumn();
    if (plug === undefined) return;
    const width = this.#gridWidth;
    const height = this.#gridHeight;
    const water = this.#water;
    const solid = this.#solid;
    for (let row = 0; row < height; row += 1) {
      const base = row * width;
      for (let column = plug - 1; column >= 0; column -= 1) {
        this.#pull(base + column, base + column + 1, water, solid);
      }
      for (let column = plug + 1; column < width; column += 1) {
        this.#pull(base + column, base + column - 1, water, solid);
      }
    }
  }

  /** Moves one share of `from` into `to`, never past a cell's nominal capacity. */
  #pull(from: number, to: number, water: Float32Array, solid: Uint8Array): void {
    if (solid[from] || solid[to]) return;
    const level = water[from]!;
    if (level <= MIN_WATER) return;
    const room = MAX_WATER - water[to]!;
    if (room <= 0) return;
    const flow = Math.min(level * DRAIN_PULL, room);
    water[from] = level - flow;
    water[to] = water[to]! + flow;
  }

  /**
   * Pulls water through the open sump. The centre column swallows the most and
   * the aperture tapers off to either side, so the surface visibly funnels
   * toward the plug instead of dropping flat.
   */
  #drainIteration(): void {
    if (!this.#drainOpen) return;
    const plug = this.#plugColumn();
    if (plug === undefined) return;
    const width = this.#gridWidth;
    const height = this.#gridHeight;
    for (let dx = -DRAIN_APERTURE_HALF; dx <= DRAIN_APERTURE_HALF; dx += 1) {
      const column = plug + dx;
      if (column < 0 || column >= width) continue;
      // The sump sits under the floor, so it drains whatever the lowest reachable
      // cell in the column holds even when a window is tiled over the bottom row.
      let row = height - 1;
      while (row >= 0 && this.#solid[row * width + column]) row -= 1;
      if (row < 0) continue;
      const index = row * width + column;
      const level = this.#water[index]!;
      if (level <= 0) continue;
      const capacity = DRAIN_PER_ITERATION * (1 - Math.abs(dx) / (DRAIN_APERTURE_HALF + 1));
      const taken = Math.min(level, capacity);
      this.#water[index] = level - taken;
      this.#drained += taken;
    }
  }

  /**
   * Advances the waterline wave field one frame. Standard leapfrog: the new
   * state is written over the older of the two buffers, which then becomes the
   * current one. Edges mirror, so a ring reaching the wall bounces back.
   */
  #rippleStep(): void {
    const width = this.#gridWidth;
    const current = this.#ripple;
    const previous = this.#ripplePrevious;
    for (let column = 0; column < width; column += 1) {
      const here = current[column]!;
      const left = current[column > 0 ? column - 1 : 0]!;
      const right = current[column + 1 < width ? column + 1 : width - 1]!;
      const next = (2 * here - previous[column]! + RIPPLE_STIFFNESS * (left - 2 * here + right)) *
        (1 - RIPPLE_DAMPING);
      previous[column] = clamp(next, -MAX_RIPPLE, MAX_RIPPLE);
    }
    this.#ripple = previous;
    this.#ripplePrevious = current;
  }

  /** Punches a dimple into the waterline where something landed. */
  #disturb(column: number, depth: number): void {
    this.#dent(column, depth * 0.6);
    this.#dent(column - 1, depth * 0.2);
    this.#dent(column + 1, depth * 0.2);
  }

  #dent(column: number, depth: number): void {
    if (column < 0 || column >= this.#gridWidth) return;
    this.#ripple[column] = clamp(this.#ripple[column]! - depth, -MAX_RIPPLE, MAX_RIPPLE);
  }

  /** Sweeps trace water away and refreshes the cached volume. */
  #settleWater(): void {
    const water = this.#water;
    let total = 0;
    for (let index = 0; index < water.length; index += 1) {
      const level = water[index]!;
      if (level <= MIN_WATER) {
        if (level !== 0) water[index] = 0;
        continue;
      }
      total += level;
    }
    this.#totalWater = total;
  }

  #ensureBounds(bounds: Rectangle): void {
    const previous = this.#bounds;
    if (previous?.width === bounds.width && previous.height === bounds.height) {
      this.#bounds = { ...bounds };
      return;
    }
    this.#bounds = { ...bounds };
    this.#gridWidth = bounds.width;
    this.#gridHeight = bounds.height;
    const area = bounds.width * bounds.height;
    // A resize has no meaningful mapping for the pool, so the desktop dries out
    // rather than smearing the old surface across the new geometry.
    this.#water = new Float32Array(area);
    this.#waterNext = new Float32Array(area);
    this.#head = new Float32Array(area);
    this.#solid = new Uint8Array(area);
    this.#ripple = new Float32Array(bounds.width);
    this.#ripplePrevious = new Float32Array(bounds.width);
    this.#totalWater = 0;
    this.#splashes = [];
    const count = Math.max(1, Math.round(area * DROPS_PER_CELL * this.#density));
    this.#drops = Array.from({ length: count }, () => this.#createDrop(bounds));
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

  /** Rebuilds the depth ramp; recomputing it per cell would allocate per frame. */
  #syncShades(theme: ShellThemeSpec): void {
    const surface = mixShellRgb(WATER_SHALLOW, theme.accent, 0.25);
    const deep = mixShellRgb(WATER_DEEP, theme.background, 0.35);
    this.#shades.length = 0;
    for (let index = 0; index < WATER_SHADES; index += 1) {
      this.#shades.push(mixShellRgb(surface, deep, index / (WATER_SHADES - 1)));
    }
  }

  #emit(column: number, row: number, char: string, foreground: ShellRgb, bold: boolean): void {
    const index = this.#overlay.length;
    let entry = this.#overlayPool[index];
    if (!entry) {
      entry = { column, row, cell: { char, foreground, bold } };
      this.#overlayPool[index] = entry;
      this.#overlay.push(entry);
      return;
    }
    entry.column = column;
    entry.row = row;
    entry.cell.char = char;
    entry.cell.foreground = foreground;
    entry.cell.bold = bold;
    this.#overlay.push(entry);
  }

  #createDrop(bounds: Rectangle): RainyDrop {
    const streak = this.#rollSpeedClass();
    const speed = this.#rollSpeed(streak);
    return {
      column: Math.floor(this.#random() * bounds.width),
      y: -this.#random() * bounds.height,
      speed,
      streak,
      tail: this.#rollTail(speed),
      boost: 0,
    };
  }

  #respawnDrop(drop: RainyDrop, bounds: Rectangle): void {
    drop.column = Math.floor(this.#random() * bounds.width);
    drop.y = -(1 + this.#random() * bounds.height * 0.6);
    drop.streak = this.#rollSpeedClass();
    drop.speed = this.#rollSpeed(drop.streak);
    drop.tail = this.#rollTail(drop.speed);
    drop.boost = 0;
  }

  #rollSpeedClass(): number {
    let roll = this.#random();
    for (let index = 0; index < RAIN_SPEED_CLASSES.length; index += 1) {
      if (roll < RAIN_SPEED_CLASSES[index]!.weight) return index;
      roll -= RAIN_SPEED_CLASSES[index]!.weight;
    }
    return RAIN_SPEED_CLASSES.length - 1;
  }

  #rollSpeed(streak: number): number {
    const speedClass = RAIN_SPEED_CLASSES[streak] ?? RAIN_SPEED_CLASSES[RAIN_SPEED_CLASSES.length - 1]!;
    return speedClass.low + this.#random() * (speedClass.high - speedClass.low);
  }

  #rollTail(speed: number): number {
    const span = MAX_TAIL_CELLS - MIN_TAIL_CELLS;
    const bias = Math.min(1, speed / MAX_DROP_SPEED);
    const base = MIN_TAIL_CELLS + span * bias * 0.6;
    return Math.min(MAX_TAIL_CELLS, Math.round(base + this.#random() * span * 0.4));
  }

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
}

// ── module-level helpers ──────────────────────────────────────────────────

/**
 * Level a cell settles at once it and the cell below it share `total` water.
 * Under one cell's worth the answer is simply "all of it"; past that the cell
 * accepts a little compression, which is what gives the pool hydrostatic
 * pressure and lets it climb.
 */
function stableLevel(total: number): number {
  if (total <= MAX_WATER) return MAX_WATER;
  if (total < 2 * MAX_WATER + MAX_COMPRESSION) {
    return (MAX_WATER * MAX_WATER + total * MAX_COMPRESSION) / (MAX_WATER + MAX_COMPRESSION);
  }
  return (total + MAX_COMPRESSION) / 2;
}

/** Waterline glyph for a sub-cell fill fraction; troughs keep a thin skin. */
function surfaceBlock(fill: number): string {
  return SURFACE_BLOCKS[clamp(Math.round(fill * SURFACE_BLOCKS.length) - 1, 0, SURFACE_BLOCKS.length - 1)]!;
}

/** Clamps a proposed vertical flow to what the cell holds and damps overshoot. */
function damp(flow: number, available: number): number {
  const damped = flow > MIN_FLOW ? flow * VERTICAL_DAMPING : flow;
  return clamp(damped, 0, Math.min(MAX_FLOW, available));
}

/**
 * Sideways flow. Unlike the vertical case this needs no damping — the share is
 * already chosen so a cell can never hand a neighbour more than it has — and
 * halving it would make a wide pool far too viscous to feed the drain.
 */
function spread(difference: number, available: number): number {
  return clamp(difference / LATERAL_SHARE, 0, Math.min(MAX_FLOW, available));
}

function sameRect(left: Rectangle, right: Rectangle): boolean {
  return left.column === right.column && left.row === right.row &&
    left.width === right.width && left.height === right.height;
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
