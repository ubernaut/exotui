// Copyright 2023 Im-Beast. MIT license.

// The animated-desktop-background contract, promoted from the exomux terminal
// multiplexer where a catalog of fields (metaballs, matrix rain, procedural
// circuitry, fire, rainy windows, a WebGPU butterchurn port, …) implements it.
//
// A field owns only deterministic simulation state; the host paints the grid
// `rasterizeCells` returns. The contract is generic over the host's theme
// type so any palette shape can ride through unchanged — a field colours its
// cells from whatever theme the host renders with. Optional capabilities
// (post-window overlays, desktop clicks, preset catalogs, disposal) are
// separate narrowing interfaces with runtime guards, so a host can offer each
// affordance exactly when a field supports it.

import type { Rectangle } from "../types.ts";

/** One renderable RGB triple. */
export type AnimatedBackgroundRgb = readonly [number, number, number];

/** One painted background cell over the host's background color; undefined cells stay blank. */
export interface AnimatedBackgroundCell {
  readonly char: string;
  readonly foreground: AnimatedBackgroundRgb;
  readonly bold?: boolean;
}

/** Pointer position in desktop cell coordinates. */
export interface AnimatedBackgroundPoint {
  readonly column: number;
  readonly row: number;
}

/** Per-frame simulation inputs shared by every background field. */
export interface AnimatedBackgroundAdvanceOptions {
  readonly bounds: Rectangle;
  /** Window rects the background may avoid or react to. */
  readonly obstacles?: readonly Rectangle[];
  /**
   * Every window rect, including ones the host has begun reclaiming and so
   * dropped from `obstacles`. Fields that model physical collision read this.
   */
  readonly solidObstacles?: readonly Rectangle[];
  /** Rect of the focused window; backgrounds may emphasize connections to it. */
  readonly activeObstacle?: Rectangle;
  readonly now?: number;
}

/**
 * Contract every selectable animated background implements. `TTheme` is the
 * host's theme shape; the field reads whatever colors it needs from it.
 */
export interface AnimatedBackground<TTheme = unknown> {
  setPointer(point: AnimatedBackgroundPoint, now?: number): void;
  clearPointer(): void;
  /** Advances the simulation once; returns true when the visible field changed. */
  advance(options: AnimatedBackgroundAdvanceOptions): boolean;
  /** Row-major cell grid for `bounds`; index [row][column] relative to the rect origin. */
  rasterizeCells(
    bounds: Rectangle,
    theme: TTheme,
  ): ReadonlyArray<ReadonlyArray<AnimatedBackgroundCell | undefined>>;
}

/** A single positioned cell for post-window overlay painting. */
export interface AnimatedBackgroundOverlayCell {
  /** Column relative to the bounds origin. */
  readonly column: number;
  /** Row relative to the bounds origin. */
  readonly row: number;
  readonly cell: AnimatedBackgroundCell;
}

/**
 * Backgrounds that paint effects on top of window chrome (puddles, drizzle,
 * splashes). The overlay is rendered after all windows so it stays visible
 * even when tiled windows cover the background grid.
 */
export interface OverlayAnimatedBackground<TTheme = unknown> extends AnimatedBackground<TTheme> {
  rasterizeOverlayCells(bounds: Rectangle, theme: TTheme): readonly AnimatedBackgroundOverlayCell[];
}

/** Narrows a background to one that paints post-window overlays. */
export function animatedBackgroundHasOverlay<TTheme>(
  field: AnimatedBackground<TTheme> | undefined,
): field is OverlayAnimatedBackground<TTheme> {
  return typeof (field as OverlayAnimatedBackground<TTheme> | undefined)?.rasterizeOverlayCells === "function";
}

/**
 * Backgrounds that answer clicks on bare desktop. Implementations return true
 * when the click landed on something they own, which claims the event.
 */
export interface InteractiveAnimatedBackground<TTheme = unknown> extends AnimatedBackground<TTheme> {
  /** Handles a click at one desktop cell; true when the field consumed it. */
  pick(column: number, row: number, now?: number): boolean;
  /** True when the field owns this cell even though a window covers it. */
  picksOverWindows?(column: number, row: number): boolean;
}

/** Narrows a background to one that accepts clicks. */
export function animatedBackgroundAcceptsPicks<TTheme>(
  field: AnimatedBackground<TTheme> | undefined,
): field is InteractiveAnimatedBackground<TTheme> {
  return typeof (field as InteractiveAnimatedBackground<TTheme> | undefined)?.pick === "function";
}

/** Backgrounds built from a catalog of presets the user can step through. */
export interface PresetAnimatedBackground<TTheme = unknown> extends AnimatedBackground<TTheme> {
  /** Index of the preset on screen, within this field's own rotation. */
  readonly presetIndex: number;
  readonly presetName: string;
  readonly presetCount: number;
  /** Selects a preset by rotation index, wrapping in both directions. */
  selectPreset(index: number): void;
  /**
   * Moves through the field's own play order by `delta`. Distinct from
   * `selectPreset(presetIndex + delta)`: a field that shuffles steps back
   * through what it actually showed, not to a catalog neighbour.
   */
  stepPreset?(delta: number): void;
}

/** Narrows a background to one the user can step through. */
export function animatedBackgroundHasPresets<TTheme>(
  field: AnimatedBackground<TTheme> | undefined,
): field is PresetAnimatedBackground<TTheme> {
  return typeof (field as PresetAnimatedBackground<TTheme> | undefined)?.selectPreset === "function";
}

/** A background field that holds a resource it must give back when idle. */
export interface DisposableAnimatedBackground<TTheme = unknown> extends AnimatedBackground<TTheme> {
  dispose(): void;
}

/** Narrows a background to one that owns a releasable resource. */
export function animatedBackgroundIsDisposable<TTheme>(
  field: AnimatedBackground<TTheme> | undefined,
): field is DisposableAnimatedBackground<TTheme> {
  return typeof (field as DisposableAnimatedBackground<TTheme> | undefined)?.dispose === "function";
}

/**
 * Disposes and drops every cached field except `keep`, in place. A host caches
 * one field per background id so switching away and back resumes the same
 * simulation; a field owning an operating-system handle (a microphone, a GPU
 * device) must give it back the moment the host stops drawing it.
 */
export function releaseIdleAnimatedBackgrounds<TId, TTheme>(
  fields: Map<TId, AnimatedBackground<TTheme>>,
  keep?: TId,
): void {
  for (const [id, field] of fields) {
    if (id === keep || !animatedBackgroundIsDisposable(field)) continue;
    field.dispose();
    fields.delete(id);
  }
}

/** Linear blend between two colors; `mix` is clamped to [0, 1]. */
export function mixAnimatedBackgroundRgb(
  from: AnimatedBackgroundRgb,
  to: AnimatedBackgroundRgb,
  mix: number,
): AnimatedBackgroundRgb {
  const amount = Math.min(1, Math.max(0, mix));
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
  ];
}
