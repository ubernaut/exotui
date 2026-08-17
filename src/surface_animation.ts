// Copyright 2023 Im-Beast. MIT license.

// 039: cell-native transition effects for windows and transient surfaces
// (menus, modals, toasts). An animation consumes a SNAPSHOT of a
// surface's character cells taken at transition start and produces
// timed sparse cell frames; the live application never waits on it —
// state proceeds immediately while the snapshot plays out. The clock is
// caller-owned: `frameAt(elapsedMs)` is pure per elapsed time, so hosts
// drive it from their render loop and tests drive it from a fake clock.
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
  | "fade";

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
];

/** One animated glyph. `sourceRow/Column` let renderers reuse the original cell's style. */
export interface SurfaceAnimationCell {
  readonly char: string;
  readonly sourceRow: number;
  readonly sourceColumn: number;
  /** 0..1 ember intensity for burn-style effects; renderers map it to warm tones. */
  readonly heat?: number;
}

/** One frame: a rows×columns sparse grid; null cells are transparent. */
export interface SurfaceAnimationFrame {
  readonly cells: ReadonlyArray<ReadonlyArray<SurfaceAnimationCell | null>>;
  /** Eased progress in [0,1] along the OUT direction (1 = fully gone). */
  readonly progress: number;
  readonly done: boolean;
}

/** Options for one animation instance. */
export interface SurfaceAnimationOptions {
  /** Snapshot rows (one string per row; rows may be ragged, they pad). */
  readonly snapshot: readonly string[];
  readonly kind: SurfaceAnimationChoice;
  /** "out": the surface leaves (close/minimize). "in": it assembles (open/restore/maximize). */
  readonly direction: "in" | "out";
  readonly durationMs: number;
  /** Seed for every per-cell random decision; same seed ⇒ identical frames. */
  readonly seed?: number;
  readonly easing?: MotionEasing;
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
 * (for maximize/restore the new layout paints underneath immediately,
 * so the dissolving ghost reads as a morph).
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
  }

  frameAt(elapsedMs: number): SurfaceAnimationFrame {
    const raw = Math.max(0, Math.min(1, elapsedMs / this.durationMs));
    const eased = easingValue(this.#easing, raw);
    // "in" plays the same effect backwards: progress runs 1 → 0.
    const progress = this.direction === "in" ? 1 - eased : eased;
    const cells: (SurfaceAnimationCell | null)[][] = [];
    for (let row = 0; row < this.#rows; row += 1) {
      cells.push(new Array<SurfaceAnimationCell | null>(this.#columns).fill(null));
    }

    for (let row = 0; row < this.#rows; row += 1) {
      const line = this.#snapshot[row]!;
      for (let column = 0; column < line.length; column += 1) {
        const char = line[column]!;
        if (char === " ") continue;
        this.#placeCell(cells, char, row, column, progress);
      }
    }

    return { cells, progress, done: raw >= 1 };
  }

  #placeCell(
    cells: (SurfaceAnimationCell | null)[][],
    char: string,
    row: number,
    column: number,
    progress: number,
  ): void {
    // Fully out means gone regardless of any per-cell noise wobble.
    if (progress >= 1) return;
    const noise = hashUnit(this.#seed, row, column);
    switch (this.kind) {
      case "fade": {
        // Uniform ramp: original glyphs hold to ~40%, then shade blocks
        // step down together until the surface is gone at 100%.
        const local = progress + (noise - 0.5) * 0.08;
        const stage = local < 0.4 ? 0 : 1 + Math.floor((local - 0.4) / 0.2);
        if (stage >= 4) return;
        const shown = stage === 0 ? char : DISSOLVE_RAMP[stage - 1]!;
        cells[row]![column] = { char: shown, sourceRow: row, sourceColumn: column };
        return;
      }
      case "disintegrate": {
        // Cells dissolve in random order across the whole duration; each
        // passes ▒ → ░ → gone in the last 30% of its own window.
        const local = (progress - noise * 0.7) / 0.3;
        if (local <= 0) {
          cells[row]![column] = { char, sourceRow: row, sourceColumn: column };
          return;
        }
        if (local < 0.5) {
          cells[row]![column] = { char: "▒", sourceRow: row, sourceColumn: column };
          return;
        }
        if (local < 1) {
          cells[row]![column] = { char: "░", sourceRow: row, sourceColumn: column };
          return;
        }
        return;
      }
      case "fall-apart": {
        // Cells detach in staggered order and fall with gravity, drifting.
        const detachAt = noise * 0.45;
        if (progress <= detachAt) {
          cells[row]![column] = { char, sourceRow: row, sourceColumn: column };
          return;
        }
        const t = progress - detachAt;
        const fall = t * t * (this.#rows * 6);
        const drift = Math.round((hashUnit(this.#seed, column, row) - 0.5) * t * 4);
        const targetRow = Math.floor(row + fall);
        const targetColumn = column + drift;
        if (targetRow >= this.#rows || targetColumn < 0 || targetColumn >= this.#columns) return;
        cells[targetRow]![targetColumn] = { char, sourceRow: row, sourceColumn: column };
        return;
      }
      case "explode": {
        // Cells fly outward from the center, decaying to dust at the end.
        const centerRow = (this.#rows - 1) / 2;
        const centerColumn = (this.#columns - 1) / 2;
        let dx = column - centerColumn;
        let dy = row - centerRow;
        const length = Math.max(0.75, Math.hypot(dx, dy));
        dx /= length;
        dy /= length;
        const speed = (0.5 + noise) * progress * Math.max(this.#columns, this.#rows * 2) * 0.9;
        const targetRow = Math.round(row + dy * speed * 0.5);
        const targetColumn = Math.round(column + dx * speed);
        if (
          targetRow < 0 || targetRow >= this.#rows ||
          targetColumn < 0 || targetColumn >= this.#columns
        ) return;
        const shown = progress > 0.7 ? "·" : char;
        cells[targetRow]![targetColumn] = { char: shown, sourceRow: row, sourceColumn: column };
        return;
      }
      case "melt": {
        // Whole columns slide down at individual speeds and pool away.
        // The slowest column still clears the grid by progress 1 (0.5·2.2 > 1).
        const columnSpeed = 0.5 + hashUnit(this.#seed, 7, column) * 0.5;
        const slide = progress * progress * columnSpeed * (this.#rows * 2.2);
        const targetRow = Math.floor(row + slide);
        if (targetRow >= this.#rows) return;
        cells[targetRow]![column] = { char, sourceRow: row, sourceColumn: column };
        return;
      }
      case "incinerate": {
        // A ragged burn front climbs from the bottom; embers ride the edge.
        const jitter = hashUnit(this.#seed, 13, column) * 3;
        // The sweep overshoots by jitter + ember tail so progress 1 is empty.
        const front = this.#rows - progress * (this.#rows + 6) + jitter;
        if (row > front + 2) return;
        if (row > front) {
          const emberIndex = Math.min(EMBER_CHARS.length - 1, Math.floor((row - front) * 1.5));
          cells[row]![column] = {
            char: EMBER_CHARS[emberIndex]!,
            sourceRow: row,
            sourceColumn: column,
            heat: Math.max(0.4, 1 - (row - front) / 3),
          };
          return;
        }
        cells[row]![column] = { char, sourceRow: row, sourceColumn: column };
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
