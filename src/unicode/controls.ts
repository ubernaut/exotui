// Copyright 2023 Im-Beast. MIT license.

// TXT-010: tab and control-character handling as one reversible contract.
// Tabs expand against configurable tab stops, control scalars render through
// an explicit policy (hidden, Unicode control pictures, or caret notation),
// and every produced cell records the UTF-16 source range it came from — so
// cursor movement, selection, wrapping, and copy all agree by construction:
// they read the same mapping instead of re-deriving expansions ad hoc.

import { segmentEmojiSequences } from "./emoji.ts";
import type { EmojiAwareWidthOptions } from "./emoji.ts";

/** Tab-stop configuration: explicit columns, then a repeating interval. */
export interface TerminalTabStops {
  /** Explicit ascending stop columns (0-based) applied first. */
  readonly stops?: readonly number[];
  /** Interval for stops past the explicit list (default 8). */
  readonly interval?: number;
}

/** How control scalars render. */
export type ControlRenderMode = "hidden" | "picture" | "caret";

/** Options for expanding a line's tabs and controls into cells. */
export interface ControlExpansionOptions extends EmojiAwareWidthOptions {
  readonly tabStops?: TerminalTabStops;
  /** Rendering for C0 controls and DEL (default "picture"). */
  readonly controls?: ControlRenderMode;
  /** Column the line starts at (affects the first tab stop). */
  readonly startColumn?: number;
}

/** One output cell with its reversible source mapping. */
export interface ControlExpandedCell {
  readonly glyph: string;
  /** UTF-16 range in the source this cell came from. */
  readonly sourceStart: number;
  readonly sourceEnd: number;
  /** True for cells synthesized by expansion (tab padding, caret second cell). */
  readonly synthesized: boolean;
}

/** The full reversible expansion of one source string. */
export interface ControlExpansion {
  readonly cells: readonly ControlExpandedCell[];
  /** Source offset owning each cell; equals cells[i].sourceStart. */
  sourceOffsetAt(cell: number): number | undefined;
  /** The half-open cell range covering one source offset. */
  cellRangeForSource(offset: number): { start: number; end: number } | undefined;
  /** Reconstructs the exact source text for a half-open cell range. */
  copy(startCell: number, endCell: number): string;
}

/** The next tab stop strictly after a column. */
export function nextTerminalTabStop(column: number, tabStops: TerminalTabStops = {}): number {
  const interval = Math.max(1, Math.floor(tabStops.interval ?? 8));
  for (const stop of tabStops.stops ?? []) {
    const at = Math.floor(stop);
    if (at > column) return at;
  }
  // Past the explicit list the stops repeat every `interval` from its end.
  const base = tabStops.stops?.length ? Math.floor(tabStops.stops.at(-1)!) : 0;
  const offset = Math.max(0, column - base);
  return base + (Math.floor(offset / interval) + 1) * interval;
}

const CONTROL_PICTURES_BASE = 0x2400;

function controlGlyphs(codePoint: number, mode: ControlRenderMode): readonly string[] {
  if (mode === "hidden") return [];
  if (mode === "caret") {
    if (codePoint === 0x7f) return ["^", "?"];
    return ["^", String.fromCharCode(codePoint + 0x40)];
  }
  if (codePoint === 0x7f) return ["␡"];
  return [String.fromCodePoint(CONTROL_PICTURES_BASE + codePoint)];
}

/**
 * Expands one line's tabs and controls into reversible cells. Grapheme
 * clusters pass through as single cells (wide clusters occupy their cells via
 * the emoji-aware spans); newlines are the caller's line breaks and must not
 * appear in the input.
 */
export function expandTerminalControls(text: string, options: ControlExpansionOptions = {}): ControlExpansion {
  const mode = options.controls ?? "picture";
  const startColumn = Math.max(0, Math.floor(options.startColumn ?? 0));
  const cells: ControlExpandedCell[] = [];
  let column = startColumn;

  for (const span of segmentEmojiSequences(text, options)) {
    const codePoint = span.cluster.codePointAt(0)!;
    if (span.cluster === "\t") {
      const stop = nextTerminalTabStop(column, options.tabStops);
      const width = Math.max(1, stop - column);
      for (let pad = 0; pad < width; pad += 1) {
        cells.push({
          glyph: " ",
          sourceStart: span.start,
          sourceEnd: span.end,
          synthesized: pad > 0,
        });
      }
      column += width;
      continue;
    }
    if (codePoint < 0x20 || codePoint === 0x7f) {
      const glyphs = controlGlyphs(codePoint, mode);
      glyphs.forEach((glyph, index) => {
        cells.push({ glyph, sourceStart: span.start, sourceEnd: span.end, synthesized: index > 0 });
      });
      column += glyphs.length;
      continue;
    }
    cells.push({ glyph: span.cluster, sourceStart: span.start, sourceEnd: span.end, synthesized: false });
    // Wide clusters own their trailing column too, mapped to the same source.
    for (let extra = 1; extra < span.cells; extra += 1) {
      cells.push({ glyph: "", sourceStart: span.start, sourceEnd: span.end, synthesized: true });
    }
    column += span.cells;
  }

  const frozen = Object.freeze(cells.map((cell) => Object.freeze(cell)));
  return {
    cells: frozen,
    sourceOffsetAt: (cell) => frozen[cell]?.sourceStart,
    cellRangeForSource: (offset) => {
      let start = -1;
      let end = -1;
      for (let index = 0; index < frozen.length; index += 1) {
        const cell = frozen[index]!;
        if (offset >= cell.sourceStart && offset < cell.sourceEnd) {
          if (start < 0) start = index;
          end = index + 1;
        }
      }
      return start < 0 ? undefined : { start, end };
    },
    copy: (startCell, endCell) => {
      const from = Math.max(0, Math.floor(startCell));
      const to = Math.min(frozen.length, Math.floor(endCell));
      let sourceStart = Number.POSITIVE_INFINITY;
      let sourceEnd = -1;
      for (let index = from; index < to; index += 1) {
        const cell = frozen[index]!;
        sourceStart = Math.min(sourceStart, cell.sourceStart);
        sourceEnd = Math.max(sourceEnd, cell.sourceEnd);
      }
      return sourceEnd < 0 ? "" : text.slice(sourceStart, sourceEnd);
    },
  };
}
