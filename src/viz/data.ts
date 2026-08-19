// Copyright 2023 Im-Beast. MIT license.

// The dimensional data model every visualisation in this package speaks.
//
// Two axes describe any signal worth drawing in a terminal: how many dimensions
// one reading has, and whether history is kept. Overall CPU load is one number
// (rank 0); the same number kept over time is what a sparkline draws. Per-core
// load is an array read at one instant (rank 1); the same array kept over time
// is what a waterfall or heatmap draws. The pattern continues: a rank-2 reading
// is a grid, and its history is a stack of grids.
//
// Writing that out as `0d`, `0dt`, `1d`, `1dt` … is the vocabulary the rest of
// the package uses, so a renderer can declare what it accepts and a caller can
// be told, in a type, that it is feeding the wrong thing to it.

/** How many dimensions a single reading has. */
export type DataRank = 0 | 1 | 2 | 3;

/** A reading of rank 0: one number. */
export type Scalar = number;
/** A reading of rank 1: values across one axis, read at one instant. */
export type Vector = readonly number[];
/** A reading of rank 2: values across two axes — a grid. */
export type Matrix = readonly Vector[];
/** A reading of rank 3: a stack of grids. */
export type Volume = readonly Matrix[];

/** The reading type for a rank. */
export type Reading<R extends DataRank> = R extends 0 ? Scalar
  : R extends 1 ? Vector
  : R extends 2 ? Matrix
  : Volume;

/** One reading and when it was taken. */
export interface Sample<R extends DataRank = DataRank> {
  /** Milliseconds on whatever clock the producer uses; only differences matter. */
  readonly at: number;
  readonly value: Reading<R>;
}

/**
 * What a visualisation accepts, as the shorthand the model is named for.
 * The `t` suffix means "over time": the same rank, with history.
 */
export type DataKind = "0d" | "0dt" | "1d" | "1dt" | "2d" | "2dt" | "3d" | "3dt";

export const DATA_KINDS: readonly DataKind[] = Object.freeze(
  ["0d", "0dt", "1d", "1dt", "2d", "2dt", "3d", "3dt"] as const,
);

/** The rank a kind carries, ignoring whether it is a series. */
export function rankOf(kind: DataKind): DataRank {
  return Number(kind[0]) as DataRank;
}

/** Whether a kind keeps history. */
export function isTemporal(kind: DataKind): boolean {
  return kind.endsWith("t");
}

/** The kind for a rank, with or without history. */
export function kindFor(rank: DataRank, temporal: boolean): DataKind {
  return `${rank}d${temporal ? "t" : ""}` as DataKind;
}

/**
 * Whether a stream of `have` can be drawn by a visualisation wanting `want`.
 *
 * A temporal visualisation can always draw a stream that keeps history, and a
 * momentary one can draw the latest reading out of a temporal stream — the
 * reverse is what cannot work, because history that was never kept cannot be
 * invented.
 */
export function satisfies(have: DataKind, want: DataKind): boolean {
  if (rankOf(have) !== rankOf(want)) return false;
  return isTemporal(have) || !isTemporal(want);
}

/**
 * The kind a visualisation should be handed, given what a stream carries.
 *
 * A visualisation may accept more than one — a psychograph draws one line or
 * several, and "several lines over time" and "several lines right now" are
 * different kinds of the same picture. An exact match wins, so a temporal
 * stream is given its history rather than having it dropped when both are on
 * offer.
 */
export function acceptedKind(have: DataKind, accepts: DataKind | readonly DataKind[]): DataKind | undefined {
  const options = typeof accepts === "string" ? [accepts] : accepts;
  return options.find((want) => want === have) ?? options.find((want) => satisfies(have, want));
}

/** The extent of a reading along each of its axes, outermost first. */
export function shapeOf(value: unknown): readonly number[] {
  if (typeof value === "number") return [];
  if (!Array.isArray(value)) return [];
  const first = value[0];
  return [value.length, ...shapeOf(first)];
}

/** The rank a value actually has, for validating what a producer supplies. */
export function rankOfValue(value: unknown): DataRank {
  const shape = shapeOf(value);
  return Math.min(3, shape.length) as DataRank;
}

/** Every finite number in a reading, whatever its rank. */
export function* flatten(value: unknown): Generator<number> {
  if (typeof value === "number") {
    if (Number.isFinite(value)) yield value;
    return;
  }
  if (!Array.isArray(value)) return;
  for (const entry of value) yield* flatten(entry);
}

/** The smallest and largest finite value in a reading, or undefined if it has none. */
export function extentOf(value: unknown): { readonly min: number; readonly max: number } | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const number of flatten(value)) {
    if (number < min) min = number;
    if (number > max) max = number;
  }
  return min === Infinity ? undefined : { min, max };
}
