// Copyright 2023 Im-Beast. MIT license.

// 039: the shared coordinator between window hosts and the cell-native
// animation engine. A host reports a transition with the surface's cell
// snapshot at that instant; the application proceeds immediately while
// this coordinator plays the detached snapshot out. Each render tick
// the renderer asks `framesAt(now)` for the overlays to composite.
// Settings (per-transition kind, speed) and reduced motion (THEM-008
// MotionContext) resolve here, so hosts stay declarative.

import type { Rectangle } from "../types.ts";
import type { MotionContext } from "../theme_motion.ts";
import {
  createSurfaceAnimation,
  type SurfaceAnimation,
  type SurfaceAnimationChoice,
  type SurfaceAnimationFrame,
  type SurfaceAnimationSpeed,
  surfaceAnimationSpeedScale,
  type SurfaceTransition,
  surfaceTransitionDirection,
} from "../surface_animation.ts";

/** Per-transition kind choices plus a global speed. */
export interface SurfaceTransitionSettings {
  readonly speed: SurfaceAnimationSpeed;
  readonly kinds: Partial<Record<SurfaceTransition, SurfaceAnimationChoice>>;
}

/** Default look: quick fades for chrome, disintegrate on close. */
export const DEFAULT_SURFACE_TRANSITION_SETTINGS: SurfaceTransitionSettings = {
  speed: "normal",
  kinds: {
    open: "fade",
    close: "disintegrate",
    minimize: "fade",
    maximize: "fade",
    restore: "fade",
  },
};

/** Base durations before the speed scale (ms). */
export const SURFACE_TRANSITION_BASE_DURATION_MS: Record<SurfaceTransition, number> = {
  open: 220,
  close: 320,
  minimize: 200,
  maximize: 200,
  restore: 200,
};

/** One playing overlay. */
export interface SurfaceTransitionOverlay {
  readonly surfaceId: string;
  readonly transition: SurfaceTransition;
  readonly rect: Rectangle;
  readonly frame: SurfaceAnimationFrame;
}

interface ActiveTransition {
  readonly surfaceId: string;
  readonly transition: SurfaceTransition;
  readonly rect: Rectangle;
  readonly animation: SurfaceAnimation;
  readonly startedAt: number;
}

export interface SurfaceTransitionAnimatorOptions {
  readonly settings?: SurfaceTransitionSettings;
  /** Reduced motion consults this context (motion token per transition). */
  readonly motion?: MotionContext;
  /** Seed base; per-begin seeds derive from it so runs are reproducible. */
  readonly seed?: number;
}

export interface BeginSurfaceTransitionOptions {
  readonly surfaceId: string;
  readonly transition: SurfaceTransition;
  /** Where the snapshot sits on screen (the overlay composites here). */
  readonly rect: Rectangle;
  /** The surface's character cells at transition start, one string per row. */
  readonly snapshot: readonly string[];
  /** The caller-owned clock's current time in ms. */
  readonly now: number;
}

/** Motion token names consulted on a MotionContext, per transition. */
export function surfaceTransitionMotionToken(transition: SurfaceTransition): string {
  return `surface.${transition}`;
}

/**
 * Plays surface transitions on detached snapshots. Never blocks input:
 * `begin` returns immediately (false when the transition resolves to
 * "no animation"), and renderers composite `framesAt(now)` overlays.
 */
export class SurfaceTransitionAnimator {
  #settings: SurfaceTransitionSettings;
  readonly #motion?: MotionContext;
  readonly #seed: number;
  #sequence = 0;
  #active: ActiveTransition[] = [];

  constructor(options: SurfaceTransitionAnimatorOptions = {}) {
    this.#settings = options.settings ?? DEFAULT_SURFACE_TRANSITION_SETTINGS;
    this.#motion = options.motion;
    this.#seed = options.seed ?? 0;
  }

  settings(): SurfaceTransitionSettings {
    return this.#settings;
  }

  setSettings(settings: SurfaceTransitionSettings): void {
    this.#settings = settings;
  }

  /** True while any overlay is playing (renderers keep scheduling frames). */
  animating(): boolean {
    return this.#active.length > 0;
  }

  /**
   * Starts a transition on a snapshot. Returns false when settings or
   * reduced motion resolve to "instant" — the caller simply proceeds.
   */
  begin(options: BeginSurfaceTransitionOptions): boolean {
    const kind = this.#settings.kinds[options.transition];
    if (!kind) return false;
    const scale = surfaceAnimationSpeedScale(this.#settings.speed);
    if (scale === null) return false;
    if (options.snapshot.length === 0) return false;

    let durationMs = SURFACE_TRANSITION_BASE_DURATION_MS[options.transition] * scale;
    if (this.#motion) {
      const resolved = this.#motion.resolve(surfaceTransitionMotionToken(options.transition));
      if (resolved.kind === "static") return false;
      // A declared token's duration wins over the built-in base.
      if (resolved.durationMs > 0) durationMs = resolved.durationMs * scale;
    }

    this.#sequence += 1;
    // One surface animates one transition at a time; a new one replaces it.
    this.#active = this.#active.filter((entry) => entry.surfaceId !== options.surfaceId);
    this.#active.push({
      surfaceId: options.surfaceId,
      transition: options.transition,
      rect: options.rect,
      startedAt: options.now,
      animation: createSurfaceAnimation({
        snapshot: options.snapshot,
        kind,
        direction: surfaceTransitionDirection(options.transition),
        durationMs,
        seed: this.#seed + this.#sequence * 7919,
      }),
    });
    return true;
  }

  /** Current overlays; finished ones are pruned after this call. */
  framesAt(now: number): SurfaceTransitionOverlay[] {
    if (this.#active.length === 0) return [];
    const overlays: SurfaceTransitionOverlay[] = [];
    const surviving: ActiveTransition[] = [];
    for (const entry of this.#active) {
      const frame = entry.animation.frameAt(now - entry.startedAt);
      overlays.push({
        surfaceId: entry.surfaceId,
        transition: entry.transition,
        rect: entry.rect,
        frame,
      });
      if (!frame.done) surviving.push(entry);
    }
    this.#active = surviving;
    return overlays;
  }

  /** Drops every playing overlay (workspace switch, resize storms). */
  cancelAll(): void {
    this.#active = [];
  }

  /** Drops one surface's overlay (its window came back, e.g. re-open). */
  cancel(surfaceId: string): void {
    this.#active = this.#active.filter((entry) => entry.surfaceId !== surfaceId);
  }
}

/** Creates a surface transition animator. */
export function createSurfaceTransitionAnimator(
  options: SurfaceTransitionAnimatorOptions = {},
): SurfaceTransitionAnimator {
  return new SurfaceTransitionAnimator(options);
}
