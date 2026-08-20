// Copyright 2023 Im-Beast. MIT license.

// Live data, as a function of time, for every rank.
//
// One contract covers the lot: a producer pushes readings, a visualisation asks
// for the latest one or for history. Making this uniform is what lets a renderer
// declare "I draw 1dt" and be handed per-core CPU load, network throughput per
// interface, or audio bands, without knowing which.

import { type DataKind, type DataRank, kindFor, rankOfValue, type Reading, type Sample } from "./data.ts";

export interface DataStreamOptions {
  /** Readings to keep. Older ones are dropped as new ones arrive. */
  readonly capacity?: number;
  /** A fixed domain for renderers that should not rescale as data arrives. */
  readonly domain?: { readonly min: number; readonly max: number };
  readonly label?: string;
}

/** How many readings a stream keeps unless told otherwise. */
export const DEFAULT_CAPACITY = 512;

/**
 * A bounded, append-only history of readings at one rank.
 *
 * Capacity is a ring in effect but an array in fact: terminals draw a few
 * hundred columns at most, and the copy on eviction is cheaper than the
 * indirection every read would otherwise pay.
 */
export class DataStream<R extends DataRank = DataRank> {
  readonly rank: R;
  readonly label: string;
  readonly capacity: number;
  readonly #domain?: { readonly min: number; readonly max: number };
  #samples: Sample<R>[] = [];

  constructor(rank: R, options: DataStreamOptions = {}) {
    this.rank = rank;
    this.label = options.label ?? "";
    this.capacity = Math.max(1, Math.floor(options.capacity ?? DEFAULT_CAPACITY));
    if (options.domain) this.#domain = options.domain;
  }

  /** What this stream can satisfy: its rank, with history. */
  get kind(): DataKind {
    return kindFor(this.rank, true);
  }

  get length(): number {
    return this.#samples.length;
  }

  /** The domain a renderer should scale against, if one was fixed. */
  get domain(): { readonly min: number; readonly max: number } | undefined {
    return this.#domain;
  }

  /**
   * Appends a reading.
   *
   * A reading of the wrong rank is refused rather than stored: a stream that
   * silently accepts a number where a vector belongs produces a chart that is
   * wrong in a way nobody can see.
   */
  push(value: Reading<R>, at: number = Date.now()): void {
    const rank = rankOfValue(value);
    if (rank !== this.rank) {
      throw new TypeError(`stream of rank ${this.rank} was pushed a rank ${rank} reading`);
    }
    this.#samples.push({ at, value });
    // Trimmed on every push. Batching the trim would save a copy per push and
    // cost the buffer's own contract: `length`, `values` and `since` all read
    // the array, so a buffer allowed to run over capacity reports readings it
    // has promised to forget. Measured against the work a chart does with the
    // history, the copy is not worth an inconsistency.
    if (this.#samples.length > this.capacity) {
      this.#samples = this.#samples.slice(this.#samples.length - this.capacity);
    }
  }

  /** The most recent reading, or undefined before anything has arrived. */
  latest(): Reading<R> | undefined {
    return this.#samples.at(-1)?.value;
  }

  latestSample(): Sample<R> | undefined {
    return this.#samples.at(-1);
  }

  /** History, oldest first, optionally only the most recent `count`. */
  history(count?: number): readonly Sample<R>[] {
    if (count === undefined || count >= this.#samples.length) return this.#samples;
    return this.#samples.slice(this.#samples.length - Math.max(0, count));
  }

  /** History with the timestamps dropped, which is what most renderers want. */
  values(count?: number): readonly Reading<R>[] {
    return this.history(count).map((sample) => sample.value);
  }

  /** Readings no older than `windowMs` before the newest one. */
  since(windowMs: number): readonly Sample<R>[] {
    const newest = this.#samples.at(-1);
    if (!newest) return [];
    const cutoff = newest.at - windowMs;
    let start = this.#samples.length;
    while (start > 0 && this.#samples[start - 1]!.at >= cutoff) start -= 1;
    return this.#samples.slice(start);
  }

  clear(): void {
    this.#samples = [];
  }
}

/** A stream of single numbers: overall CPU load, one temperature, a rate. */
export function scalarStream(options?: DataStreamOptions): DataStream<0> {
  return new DataStream(0, options);
}

/** A stream of arrays read at one instant: per-core load, audio bands. */
export function vectorStream(options?: DataStreamOptions): DataStream<1> {
  return new DataStream(1, options);
}

/** A stream of grids: a heatmap read whole each tick. */
export function matrixStream(options?: DataStreamOptions): DataStream<2> {
  return new DataStream(2, options);
}

/** A stream of stacks of grids. */
export function volumeStream(options?: DataStreamOptions): DataStream<3> {
  return new DataStream(3, options);
}
