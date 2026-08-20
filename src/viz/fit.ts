// Copyright 2023 Im-Beast. MIT license.

// Choosing a visualisation for data, at a size.
//
// A static minimum size is not enough, because what a visualisation needs
// depends on what it is drawing. Eighty-eight cores as bars wants eighty-eight
// columns; four cores wants four. A waterfall of eight audio bands is legible in
// a small box and the same waterfall of two hundred bins is not. So the question
// is never "does this fit" but "how well does this suit *this* data at *this*
// size", and the answer is a score rather than a yes.

import type { DataKind } from "./data.ts";
import type { VizSize } from "./render.ts";

/** What is known about the data a visualisation is being asked to draw. */
export interface VizDataShape {
  readonly kind: DataKind;
  /**
   * Entries along each axis of one reading: `[88]` for eighty-eight cores,
   * `[24, 16]` for a grid. Empty for a scalar.
   */
  readonly extent?: readonly number[];
  /** Readings of history available, which is what a temporal renderer draws. */
  readonly samples?: number;
}

/** How well a visualisation suits data at a size. Higher wins; 0 means unusable. */
export interface VizFit {
  readonly id: string;
  readonly score: number;
  /**
   * How much of the room each entry wants it actually got, 0 to 1.
   *
   * Separate from the score because it answers a different question: the score
   * ranks candidates against each other, this says whether the winner is worth
   * drawing at all. Sixteen cores in one row can be ranked first and still be
   * nonsense.
   */
  readonly crowding: number;
  /** Why, in a phrase, for a settings page that explains its choice. */
  readonly reason: string;
}

/** The entries in a rank-1 reading, or 1 when it is not that shape. */
export function entriesOf(shape: VizDataShape): number {
  return shape.extent?.[0] ?? 1;
}

/**
 * Scores a candidate.
 *
 * The shape of the rule is the same for every visualisation: there is a size
 * below which it says nothing (score 0), a size at which it is honest, and a
 * size at which it is the best thing to show. Between them the score rises, so
 * a tile that grows swaps to a richer visualisation on its own.
 */
export function scoreFit(
  candidate: {
    readonly id: string;
    readonly minimum: VizSize;
    /** Columns, rows, or whole cells one entry wants, when the data has entries. */
    readonly perEntry?: { readonly columns?: number; readonly rows?: number; readonly cells?: number };
    /**
     * Entries below which this stops being the thing it is.
     *
     * A spectrogram of two bands is two coloured slabs. Crowding cannot catch
     * that — two entries in thirty-five columns fit perfectly — so a field
     * renderer says how much data it wants before it earns its weight.
     */
    readonly minimumEntries?: number;
    /** Score at its ideal size, before penalties. */
    readonly weight?: number;
  },
  shape: VizDataShape,
  size: VizSize,
): VizFit {
  const entries = entriesOf(shape);
  const neededColumns = Math.max(candidate.minimum.width, (candidate.perEntry?.columns ?? 0) * entries);
  const neededRows = Math.max(candidate.minimum.height, (candidate.perEntry?.rows ?? 0) * entries);

  if (size.width < candidate.minimum.width || size.height < candidate.minimum.height) {
    return { id: candidate.id, score: 0, crowding: 0, reason: "too small" };
  }
  // Room for every entry to be distinguishable is what separates "drawn" from
  // "drawn honestly": below it, entries share cells and the reading is a blur.
  const columnFit = Math.min(1, size.width / Math.max(1, neededColumns));
  const rowFit = Math.min(1, size.height / Math.max(1, neededRows));
  // A renderer that lays entries out in a grid is not bounded by either axis
  // alone — eighty-eight tiles fit a box that is neither eighty-eight columns
  // nor eighty-eight rows. Area is the honest measure for those.
  const neededCells = (candidate.perEntry?.cells ?? 0) * entries;
  const areaFit = neededCells > 0 ? Math.min(1, (size.width * size.height) / neededCells) : 1;
  const crowding = Math.min(columnFit, rowFit, areaFit);
  const wanted = candidate.minimumEntries ?? 0;
  const sparsity = wanted > 0 ? Math.min(1, entries / wanted) : 1;
  const base = candidate.weight ?? 1;
  const score = base * (0.25 + 0.75 * crowding) * sparsity;
  const reason = sparsity < 1
    ? `only ${entries} to show — wants ${wanted}`
    : crowding >= 1
    ? "fits comfortably"
    : crowding > 0.5
    ? `${entries} entries are tight here`
    : `${entries} entries would blur`;
  return { id: candidate.id, score, crowding, reason };
}

/** Ranks candidates, best first, dropping the ones that cannot draw at all. */
export function rankFits(fits: readonly VizFit[]): VizFit[] {
  return fits.filter((fit) => fit.score > 0).sort((a, b) => b.score - a.score);
}
