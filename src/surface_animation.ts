// Copyright 2023 Im-Beast. MIT license.

// 039: cell-native transition effects for windows and transient surfaces
// (menus, modals, toasts). An animation consumes a SNAPSHOT of a
// surface's character cells taken at transition start and produces
// timed sparse cell frames; the live application never waits on it —
// state proceeds immediately while the snapshot plays out. The clock is
// caller-owned: `frameAt(elapsedMs)` is pure per elapsed time, so hosts
// drive it from their render loop and tests drive it from a fake clock.
// Effects are NOT confined to the snapshot: debris explodes past the
// window edges, melt runs down the whole screen — the caller declares
// how far cells may travel with `overflow`, and placed cells carry
// snapshot-relative coordinates that may be negative or past the edges.
// Reduced motion is the caller's decision (THEM-008 MotionContext);
// this module only provides the engine.

import { easingValue, type MotionEasing } from "./theme_motion.ts";

/** Concrete effect kinds. */
export type SurfaceAnimationKind =
  | "fall-apart"
  | "explode"
  | "disintegrate"
  | "incinerate"
  | "melt"
  | "fade"
  | "fly";

/** A configured choice: a concrete kind or a per-event random pick. */
export type SurfaceAnimationChoice = SurfaceAnimationKind | "random";

/** Window/surface transitions that can animate. */
export type SurfaceTransition = "open" | "close" | "minimize" | "maximize" | "restore";

/** User-facing speed setting; "off" disables animation entirely. */
export type SurfaceAnimationSpeed = "off" | "fast" | "normal" | "slow";

/** Every concrete kind, in a stable order (settings lists, random picks). */
export const SURFACE_ANIMATION_KINDS: readonly SurfaceAnimationKind[] = [
  "fall-apart",
  "explode",
  "disintegrate",
  "incinerate",
  "melt",
  "fade",
  "fly",
];

/** How far cells may travel beyond the snapshot edges before they are gone. */
export interface SurfaceAnimationOverflow {
  readonly left: number;
  readonly right: number;
  readonly up: number;
  readonly down: number;
}

/**
 * One animated glyph, placed snapshot-relative: `column`/`row` may be
 * negative or beyond the snapshot when the effect spills past its edges.
 * `sourceRow/Column` let renderers reuse the original cell's style.
 */
export interface PlacedSurfaceAnimationCell {
  readonly column: number;
  readonly row: number;
  readonly char: string;
  readonly sourceRow: number;
  readonly sourceColumn: number;
  /** 0..1 ember intensity for burn-style effects; renderers map it to warm tones. */
  readonly heat?: number;
}

/** One frame: sparse placed cells (later entries paint over earlier ones). */
export interface SurfaceAnimationFrame {
  readonly cells: readonly PlacedSurfaceAnimationCell[];
  /** Eased progress in [0,1] along the OUT direction (1 = fully gone). */
  readonly progress: number;
  readonly done: boolean;
}

/** Options for one animation instance. */
export interface SurfaceAnimationOptions {
  /** Snapshot rows (one string per row; rows may be ragged, they pad). */
  readonly snapshot: readonly string[];
  readonly kind: SurfaceAnimationChoice;
  /** "out": the surface leaves (close/minimize). "in": it assembles (open/restore). */
  readonly direction: "in" | "out";
  readonly durationMs: number;
  /** Seed for every per-cell random decision; same seed ⇒ identical frames. */
  readonly seed?: number;
  readonly easing?: MotionEasing;
  /** Travel room beyond each snapshot edge; defaults to 0 (confined). */
  readonly overflow?: Partial<SurfaceAnimationOverflow>;
  /**
   * Snapshot-relative point the "fly" effect converges to ("out") or
   * emerges from ("in") — e.g. a taskbar button. Defaults to the
   * snapshot center; other kinds ignore it.
   */
  readonly flyTarget?: { readonly column: number; readonly row: number };
}

/** Duration multiplier for a speed setting; null means "do not animate". */
export function surfaceAnimationSpeedScale(speed: SurfaceAnimationSpeed): number | null {
  switch (speed) {
    case "off":
      return null;
    case "fast":
      return 0.5;
    case "normal":
      return 1;
    case "slow":
      return 2;
  }
}

/**
 * The natural play direction of a transition. Only "open" assembles in;
 * every other transition animates the snapshot of the OLD cells out
 * (for maximize the new layout paints underneath immediately, so the
 * dissolving ghost reads as a morph). Hosts override per pattern — a
 * restore that flies back out of its taskbar button plays "in".
 */
export function surfaceTransitionDirection(transition: SurfaceTransition): "in" | "out" {
  return transition === "open" ? "in" : "out";
}

/** Resolves "random" to a concrete kind, deterministically per seed. */
export function resolveSurfaceAnimationKind(
  choice: SurfaceAnimationChoice,
  seed = 0,
): SurfaceAnimationKind {
  if (choice !== "random") return choice;
  return SURFACE_ANIMATION_KINDS[hashUnit(seed, 971, 331) * SURFACE_ANIMATION_KINDS.length | 0]!;
}

const DISSOLVE_RAMP = ["▓", "▒", "░"] as const;
const EMBER_CHARS = ["▓", "▒", "░"] as const;

/**
 * One playing surface animation. Construct at transition start with the
 * surface snapshot; call `frameAt(elapsedMs)` from the render loop.
 */
export class SurfaceAnimation {
  readonly kind: SurfaceAnimationKind;
  readonly direction: "in" | "out";
  readonly durationMs: number;
  readonly #rows: number;
  readonly #columns: number;
  readonly #snapshot: readonly string[];
  readonly #seed: number;
  readonly #easing: MotionEasing;
  readonly #overflow: SurfaceAnimationOverflow;
  readonly #flyTarget: { readonly column: number; readonly row: number };

  constructor(options: SurfaceAnimationOptions) {
    this.#seed = options.seed ?? 0;
    this.kind = resolveSurfaceAnimationKind(options.kind, this.#seed);
    this.direction = options.direction;
    this.durationMs = Math.max(1, options.durationMs);
    this.#snapshot = options.snapshot;
    this.#rows = options.snapshot.length;
    let columns = 0;
    for (const row of options.snapshot) columns = Math.max(columns, row.length);
    this.#columns = columns;
    this.#easing = options.easing ?? "ease-in";
    this.#overflow = {
      left: Math.max(0, Math.floor(options.overflow?.left ?? 0)),
      right: Math.max(0, Math.floor(options.overflow?.right ?? 0)),
      up: Math.max(0, Math.floor(options.overflow?.up ?? 0)),
      down: Math.max(0, Math.floor(options.overflow?.down ?? 0)),
    };
    this.#flyTarget = options.flyTarget ?? {
      column: (this.#columns - 1) / 2,
      row: (this.#rows - 1) / 2,
    };
  }

  frameAt(elapsedMs: number): SurfaceAnimationFrame {
    const raw = Math.max(0, Math.min(1, elapsedMs / this.durationMs));
    const eased = easingValue(this.#easing, raw);
    // "in" plays the same effect backwards: progress runs 1 → 0.
    const progress = this.direction === "in" ? 1 - eased : eased;
    const cells: PlacedSurfaceAnimationCell[] = [];

    if (progress < 1) {
      for (let row = 0; row < this.#rows; row += 1) {
        const line = this.#snapshot[row]!;
        for (let column = 0; column < line.length; column += 1) {
          const char = line[column]!;
          if (char === " ") continue;
          this.#placeCell(cells, char, row, column, progress);
        }
      }
    }

    return { cells, progress, done: raw >= 1 };
  }

  /** True when a placed position is still on the stage (snapshot + overflow). */
  #onStage(column: number, row: number): boolean {
    return column >= -this.#overflow.left && column < this.#columns + this.#overflow.right &&
      row >= -this.#overflow.up && row < this.#rows + this.#overflow.down;
  }

  #emit(
    cells: PlacedSurfaceAnimationCell[],
    cell: PlacedSurfaceAnimationCell,
  ): void {
    if (this.#onStage(cell.column, cell.row)) cells.push(cell);
  }

  #placeCell(
    cells: PlacedSurfaceAnimationCell[],
    char: string,
    row: number,
    column: number,
    progress: number,
  ): void {
    const noise = hashUnit(this.#seed, row, column);
    switch (this.kind) {
      case "fade": {
        // Uniform ramp: original glyphs hold to ~40%, then shade blocks
        // step down together until the surface is gone at 100%.
        const local = progress + (noise - 0.5) * 0.08;
        const stage = local < 0.4 ? 0 : 1 + Math.floor((local - 0.4) / 0.2);
        if (stage >= 4) return;
        const shown = stage === 0 ? char : DISSOLVE_RAMP[stage - 1]!;
        this.#emit(cells, { char: shown, column, row, sourceRow: row, sourceColumn: column });
        return;
      }
      case "disintegrate": {
        // Cells dissolve in random order across the whole duration; each
        // passes ▒ → ░ → gone in the last 30% of its own window.
        const local = (progress - noise * 0.7) / 0.3;
        if (local >= 1) return;
        const shown = local <= 0 ? char : local < 0.5 ? "▒" : "░";
        this.#emit(cells, { char: shown, column, row, sourceRow: row, sourceColumn: column });
        return;
      }
      case "fall-apart": {
        // Cells detach in staggered order and fall with gravity past the
        // bottom of the stage, drifting sideways as they go.
        const detachAt = noise * 0.45;
        if (progress <= detachAt) {
          this.#emit(cells, { char, column, row, sourceRow: row, sourceColumn: column });
          return;
        }
        const t = (progress - detachAt) / Math.max(0.001, 1 - detachAt);
        const travel = this.#rows + this.#overflow.down - row + 1;
        const fall = t * t * travel;
        const drift = Math.round((hashUnit(this.#seed, column, row) - 0.5) * t * 6);
        this.#emit(cells, {
          char,
          column: column + drift,
          row: Math.floor(row + fall),
          sourceRow: row,
          sourceColumn: column,
        });
        return;
      }
      case "explode": {
        // Cells fly outward from the center and off the stage, decaying
        // to dust late in flight.
        const centerRow = (this.#rows - 1) / 2;
        const centerColumn = (this.#columns - 1) / 2;
        let dx = column - centerColumn;
        let dy = row - centerRow;
        const length = Math.max(0.75, Math.hypot(dx, dy));
        dx /= length;
        dy /= length;
        const span = Math.max(
          this.#columns + this.#overflow.left + this.#overflow.right,
          (this.#rows + this.#overflow.up + this.#overflow.down) * 2,
        );
        const speed = (0.5 + noise) * progress * span * 1.1;
        this.#emit(cells, {
          char: progress > 0.7 ? "·" : char,
          column: Math.round(column + dx * speed),
          row: Math.round(row + dy * speed * 0.5),
          sourceRow: row,
          sourceColumn: column,
        });
        return;
      }
      case "melt": {
        // Whole columns slide down at individual speeds, pooling past the
        // bottom of the stage (the screen, when the caller allows it).
        const columnSpeed = 0.7 + hashUnit(this.#seed, 7, column) * 0.5;
        const travel = this.#rows + this.#overflow.down - row + 1;
        const slide = Math.pow(progress, 1.4) * columnSpeed * travel;
        this.#emit(cells, {
          char,
          column,
          row: Math.floor(row + slide),
          sourceRow: row,
          sourceColumn: column,
        });
        return;
      }
      case "incinerate": {
        // A ragged burn front climbs from the bottom; embers ride the
        // edge and sparks drift up past the top of the surface.
        const jitter = hashUnit(this.#seed, 13, column) * 3;
        const front = this.#rows - progress * (this.#rows + 6) + jitter;
        if (row > front + 2) {
          // Consumed — a few cells linger as rising sparks above the fire.
          if (noise > 0.85) {
            const rise = Math.floor((progress + noise) * 3);
            this.#emit(cells, {
              char: "░",
              column,
              row: Math.floor(front) - rise,
              sourceRow: row,
              sourceColumn: column,
              heat: 0.6,
            });
          }
          return;
        }
        if (row > front) {
          const emberIndex = Math.min(EMBER_CHARS.length - 1, Math.floor((row - front) * 1.5));
          this.#emit(cells, {
            char: EMBER_CHARS[emberIndex]!,
            column,
            row,
            sourceRow: row,
            sourceColumn: column,
            heat: Math.max(0.4, 1 - (row - front) / 3),
          });
          return;
        }
        this.#emit(cells, { char, column, row, sourceRow: row, sourceColumn: column });
        return;
      }
      case "fly": {
        // Cells stream toward the fly target (a taskbar button) with a
        // staggered start; played "in", they emerge from it instead.
        const start = noise * 0.35;
        const t = Math.max(0, Math.min(1, (progress - start) / 0.65));
        if (t >= 1) return;
        const glide = t * t * (3 - 2 * t);
        this.#emit(cells, {
          char,
          column: Math.round(column + (this.#flyTarget.column - column) * glide),
          row: Math.round(row + (this.#flyTarget.row - row) * glide),
          sourceRow: row,
          sourceColumn: column,
        });
        return;
      }
    }
  }
}

/** Creates a surface animation. */
export function createSurfaceAnimation(options: SurfaceAnimationOptions): SurfaceAnimation {
  return new SurfaceAnimation(options);
}

/** Deterministic per-cell noise in [0, 1). */
function hashUnit(seed: number, a: number, b: number): number {
  let h = (seed | 0) ^ (a * 374761393) ^ (b * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
