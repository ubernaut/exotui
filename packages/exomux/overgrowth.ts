// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "@ubernaut/exotui";
import type { ExomuxBackgroundId } from "./model.ts";

/**
 * Backgrounds that reclaim idle windows. Only the organic/structural fields
 * read well creeping across a terminal; the sun, skull and metaball fields are
 * composed around a focal point and smear into noise when tiled over chrome.
 */
export const EXOMUX_OVERGROWTH_BACKGROUND_IDS: readonly ExomuxBackgroundId[] = Object.freeze([
  "jungle",
  "matrix",
  "rainy windows",
  "circuit",
  "ivy",
  "fire",
  "turbulence",
]);

/** True when the given background participates in inactive-window overgrowth. */
export function exomuxBackgroundOvergrows(id: ExomuxBackgroundId): boolean {
  return EXOMUX_OVERGROWTH_BACKGROUND_IDS.includes(id);
}

/**
 * Which window borders a background's reclaim frontier advances from. Growth
 * closes in from every edge by default; rain only ever falls, so it runs down
 * the glass from the title bar instead.
 */
export type ExomuxOvergrowthEdges = "all" | "top";

/** Reclaim profile for one background. */
export function exomuxOvergrowthEdges(id: ExomuxBackgroundId): ExomuxOvergrowthEdges {
  return id === "rainy windows" ? "top" : "all";
}

/**
 * Fraction of an inactive window the background has reclaimed. Ramps linearly
 * from 0 at the moment focus is lost to MAX_OVERGROWTH_RATIO after `fullMs`.
 */
export const EXOMUX_MAX_OVERGROWTH_RATIO = 0.82;

/** Computes the reclaim ratio for one window from how long it has been idle. */
export function exomuxOvergrowthRatio(idleMs: number, fullMs: number): number {
  if (!Number.isFinite(idleMs) || idleMs <= 0) return 0;
  const span = Number.isFinite(fullMs) && fullMs > 0 ? fullMs : 1;
  return Math.min(EXOMUX_MAX_OVERGROWTH_RATIO, (idleMs / span) * EXOMUX_MAX_OVERGROWTH_RATIO);
}

/**
 * Per-cell resistance to being reclaimed, in [0, 1]. Cells nearest the window
 * border fall first and the centre holds out longest, so growth reads as
 * creeping inward rather than dissolving uniformly; a stable hash breaks up the
 * contour so the frontier looks organic instead of like a shrinking rectangle.
 */
export function exomuxOvergrowthThreshold(
  column: number,
  row: number,
  rect: Rectangle,
  edges: ExomuxOvergrowthEdges = "all",
): number {
  if (rect.width <= 0 || rect.height <= 0) return 1;
  const insetColumns = Math.min(column - rect.column, rect.column + rect.width - 1 - column);
  const insetRows = Math.min(row - rect.row, rect.row + rect.height - 1 - row);
  if (insetColumns < 0 || insetRows < 0) return 1;
  if (edges === "top") return topEdgeThreshold(column, row, rect);
  const reach = Math.max(1, Math.min((rect.width - 1) / 2, (rect.height - 1) / 2));
  const edge = Math.min(1, Math.min(insetColumns, insetRows) / reach);
  return Math.min(1, edge * 0.72 + overgrowthNoise(column, row) * 0.28);
}

/**
 * Top-only frontier: depth below the window's first row is what decides when a
 * cell falls, so the reclaim sheets downward. Most of the remaining weight is a
 * per-column bias, which is what turns a flat descending waterline into ragged
 * streaks running at different lengths down the glass.
 */
function topEdgeThreshold(column: number, row: number, rect: Rectangle): number {
  const reach = Math.max(1, rect.height - 1);
  const depth = Math.min(1, (row - rect.row) / reach);
  const columnBias = overgrowthNoise(column, rect.column * 31 + rect.width);
  return Math.min(1, depth * 0.6 + columnBias * 0.32 + overgrowthNoise(column, row) * 0.08);
}

/** True when the background has reclaimed this cell at the given ratio. */
export function exomuxOvergrowthCovers(
  column: number,
  row: number,
  rect: Rectangle,
  ratio: number,
  edges: ExomuxOvergrowthEdges = "all",
): boolean {
  if (ratio <= 0) return false;
  return exomuxOvergrowthThreshold(column, row, rect, edges) < ratio;
}

/**
 * True when a reclaimed cell is actually visible. Windows stacked above the
 * reclaimed one clip it, so an idle window's overgrowth can never sprout
 * background characters across the focused window sitting on top of it.
 */
export function exomuxOvergrowthVisible(
  column: number,
  row: number,
  rect: Rectangle,
  ratio: number,
  occluders: readonly Rectangle[],
  edges: ExomuxOvergrowthEdges = "all",
): boolean {
  if (!exomuxOvergrowthCovers(column, row, rect, ratio, edges)) return false;
  for (const occluder of occluders) {
    if (
      column >= occluder.column && column < occluder.column + occluder.width &&
      row >= occluder.row && row < occluder.row + occluder.height
    ) {
      return false;
    }
  }
  return true;
}

/** Stable per-cell hash in [0, 1); no Math.random so frames stay reproducible. */
function overgrowthNoise(column: number, row: number): number {
  let hash = Math.imul(column + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(row + 0x165667b1, 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491);
  return ((hash >>> 0) % 100_000) / 100_000;
}

/** Tracks how long each window has been unfocused, in wall-clock milliseconds. */
export class ExomuxOvergrowthTracker {
  readonly #idleSince = new Map<string, number>();

  /** Records the current focus state; the active window resets to zero idle. */
  sync(windowIds: readonly string[], activeWindowId: string | undefined, now: number): void {
    for (const id of windowIds) {
      if (id === activeWindowId) this.#idleSince.delete(id);
      else if (!this.#idleSince.has(id)) this.#idleSince.set(id, now);
    }
    for (const id of [...this.#idleSince.keys()]) {
      if (!windowIds.includes(id)) this.#idleSince.delete(id);
    }
  }

  /** Milliseconds the window has been unfocused, or 0 while it holds focus. */
  idleMs(windowId: string, now: number): number {
    const since = this.#idleSince.get(windowId);
    return since === undefined ? 0 : Math.max(0, now - since);
  }

  /** Drops all tracked idle state, e.g. when overgrowth is switched off. */
  clear(): void {
    this.#idleSince.clear();
  }
}
