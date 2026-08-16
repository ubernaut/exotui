// Copyright 2023 Im-Beast. MIT license.

// TXT-005: an immutable index over one string that maps between UTF-16 code
// units, code points, extended grapheme clusters, terminal cells, and UTF-8
// byte offsets. Grapheme boundaries (TXT-002) are the only positions all five
// coordinate systems share, so every conversion resolves to a boundary: an
// offset that already sits on one round-trips exactly, and anything inside a
// cluster (or inside a wide cluster's second cell) returns an explicit
// inexact result carrying both enclosing boundaries.

import { type EmojiAwareWidthOptions, segmentEmojiSequences } from "./emoji.ts";

/** Coordinate systems the index converts between. */
export type UnicodeTextUnit = "utf16" | "codePoint" | "grapheme" | "cell" | "byte";

/** One grapheme boundary expressed in every coordinate system at once. */
export interface UnicodeTextPosition {
  readonly utf16: number;
  readonly codePoint: number;
  readonly grapheme: number;
  readonly cell: number;
  readonly byte: number;
}

/** Result of resolving an offset: exact on a boundary, or explicitly between two. */
export type UnicodeTextResolution =
  | { readonly exact: true; readonly position: UnicodeTextPosition }
  | {
    readonly exact: false;
    /** The boundary at or before the offset. */
    readonly floor: UnicodeTextPosition;
    /** The boundary after the offset. */
    readonly ceiling: UnicodeTextPosition;
  };

/** Bounded input guard: an index is a per-document structure, not a stream. */
export const UNICODE_TEXT_INDEX_MAX_UTF16 = 1_000_000;

const encoder = new TextEncoder();

/** Immutable multi-coordinate index over one string. */
export class UnicodeTextIndex {
  readonly text: string;
  readonly #boundaries: readonly UnicodeTextPosition[];

  constructor(text: string, options: EmojiAwareWidthOptions = {}) {
    if (typeof text !== "string") throw new TypeError("UnicodeTextIndex expects a string");
    if (text.length > UNICODE_TEXT_INDEX_MAX_UTF16) {
      throw new RangeError(`text exceeds the ${UNICODE_TEXT_INDEX_MAX_UTF16} UTF-16 unit index limit`);
    }
    this.text = text;
    const boundaries: UnicodeTextPosition[] = [];
    let utf16 = 0;
    let codePoint = 0;
    let grapheme = 0;
    let cell = 0;
    let byte = 0;
    for (const span of segmentEmojiSequences(text, options)) {
      boundaries.push(Object.freeze({ utf16, codePoint, grapheme, cell, byte }));
      utf16 = span.end;
      codePoint += [...span.cluster].length;
      grapheme += 1;
      cell += span.cells;
      byte += encoder.encode(span.cluster).byteLength;
    }
    boundaries.push(Object.freeze({ utf16, codePoint, grapheme, cell, byte }));
    this.#boundaries = Object.freeze(boundaries);
    Object.freeze(this);
  }

  /** Totals in every coordinate system (the final boundary). */
  get totals(): UnicodeTextPosition {
    return this.#boundaries[this.#boundaries.length - 1]!;
  }

  /** Every grapheme boundary, in order, in all five coordinate systems. */
  boundaries(): readonly UnicodeTextPosition[] {
    return this.#boundaries;
  }

  /**
   * Resolves an offset in one coordinate system to a grapheme boundary.
   * Grapheme offsets are always exact (they are the boundary numbering);
   * offsets inside a cluster or inside a wide cluster's trailing cell return
   * `exact: false` with both enclosing boundaries. Out-of-range offsets clamp
   * to the nearest end.
   */
  resolve(unit: UnicodeTextUnit, offset: number): UnicodeTextResolution {
    const boundaries = this.#boundaries;
    const last = boundaries[boundaries.length - 1]!;
    const safe = Math.max(0, Math.min(Math.floor(Number.isFinite(offset) ? offset : 0), last[unit]));
    let low = 0;
    let high = boundaries.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (boundaries[middle]![unit] <= safe) low = middle;
      else high = middle - 1;
    }
    const floor = boundaries[low]!;
    if (floor[unit] === safe) return { exact: true, position: floor };
    return { exact: false, floor, ceiling: boundaries[Math.min(low + 1, boundaries.length - 1)]! };
  }

  /**
   * Converts an offset between coordinate systems. Exact when the offset sits
   * on a grapheme boundary; otherwise the explicit resolution is returned so
   * the caller chooses a side instead of receiving a silently rounded number.
   */
  convert(from: UnicodeTextUnit, offset: number, to: UnicodeTextUnit): number | UnicodeTextResolution {
    const resolved = this.resolve(from, offset);
    return resolved.exact ? resolved.position[to] : resolved;
  }
}

/** Builds an immutable text index; see {@linkcode UnicodeTextIndex}. */
export function createUnicodeTextIndex(text: string, options: EmojiAwareWidthOptions = {}): UnicodeTextIndex {
  return new UnicodeTextIndex(text, options);
}
