// Copyright 2023 Im-Beast. MIT license.
import type { TerminalScreenCell, TerminalScreenCursor } from "./terminal_screen.ts";

/** Unit selected by a terminal mouse gesture. */
export type TerminalSelectionUnit = "cell" | "word" | "line";

/**
 * Renderer-neutral selection of a terminal viewport. Captures cells at begin()
 * so output arriving during a drag cannot change the text being copied. Hosts
 * paint rows while active, route pointer coordinates relative to that viewport,
 * and clear on keyboard input, scrolling, or geometry changes.
 * Endpoints include the whole cell, including both halves of a wide glyph.
 */
export class TerminalSelectionController {
  #rows: TerminalScreenCell[][] = [];
  #anchor?: TerminalScreenCursor;
  #focus?: TerminalScreenCursor;
  #unit: TerminalSelectionUnit = "cell";
  #moved = false;
  #cachedRange?: [TerminalScreenCursor, TerminalScreenCursor];
  #rangeDirty = true;

  /** Frozen viewport to paint while the selection is active. */
  get rows(): readonly (readonly TerminalScreenCell[])[] {
    return this.#rows;
  }

  /** A plain click arms a drag without selecting or copying a character. */
  get active(): boolean {
    return !!this.#anchor && (this.#moved || this.#unit !== "cell");
  }

  /** Starts a fresh gesture over a snapshot of the supplied viewport. */
  begin(
    rows: readonly (readonly TerminalScreenCell[])[],
    point: TerminalScreenCursor,
    unit: TerminalSelectionUnit = "cell",
  ): void {
    this.clear();
    if (!rows.length) return;
    this.#rows = rows.map((row) => row.map((cell) => ({ ...cell })));
    this.#anchor = this.#focus = this.#clamp(point);
    this.#unit = unit;
  }

  /** Extends in either direction, clamping drags outside the viewport. */
  extend(point: TerminalScreenCursor): void {
    if (!this.#anchor) return;
    this.#focus = this.#clamp(point);
    this.#rangeDirty = true;
    this.#moved = this.#focus.row !== this.#anchor.row || this.#focus.column !== this.#anchor.column;
  }

  /** Discards the selection and releases the captured cells. */
  clear(): void {
    this.#rows = [];
    this.#anchor = this.#focus = undefined;
    this.#moved = false;
    this.#cachedRange = undefined;
    this.#rangeDirty = true;
  }

  /** Whether a viewport cell should receive selection highlighting. */
  contains(column: number, row: number): boolean {
    const range = this.#range();
    if (!range) return false;
    const [start, end] = range;
    return row >= start.row && row <= end.row &&
      (row !== start.row || column >= start.column) &&
      (row !== end.row || column <= end.column);
  }

  /** Plain text with whole Unicode glyphs and terminal padding removed. */
  selectedText(): string {
    const range = this.#range();
    if (!range) return "";
    const [start, end] = range;
    let text = "";
    for (let row = start.row; row <= end.row; row++) {
      const cells = this.#rows[row]!;
      const from = row === start.row ? start.column : 0;
      const to = row === end.row ? end.column : cells.length - 1;
      const part = cells.slice(from, to + 1).filter((cell) => !cell.continuation && !cell.wrapPadding)
        .map((cell) => cell.char).join("");
      const wraps = row < end.row && cells.at(-1)?.softWrapped;
      text += wraps ? part : part.replace(/ +$/u, "");
      if (row < end.row && !wraps) text += "\n";
    }
    return text;
  }

  #clamp(point: TerminalScreenCursor): TerminalScreenCursor {
    const row = Math.max(0, Math.min(this.#rows.length - 1, Math.floor(point.row) || 0));
    const column = Math.max(0, Math.min(this.#rows[row]!.length - 1, Math.floor(point.column) || 0));
    return { row, column };
  }

  #span(point: TerminalScreenCursor): [TerminalScreenCursor, TerminalScreenCursor] {
    const cells = this.#rows[point.row]!;
    let first = point.column;
    let last = first;
    if (this.#unit === "line") {
      first = 0;
      last = cells.length - 1;
    } else {
      if (cells[first]?.continuation && first > 0) first--;
      if (this.#unit === "word") {
        const category = wordCategory(cells[first]?.char ?? " ");
        while (first > 0) {
          let previous = first - 1;
          if (cells[previous]?.continuation && previous > 0) previous--;
          if (wordCategory(cells[previous]!.char) !== category) break;
          first = previous;
        }
        last = point.column;
        while (
          last + 1 < cells.length && (cells[last + 1]?.continuation || wordCategory(cells[last + 1]!.char) === category)
        ) last++;
      }
      if (cells[last + 1]?.continuation) last++;
    }
    return [{ row: point.row, column: first }, { row: point.row, column: last }];
  }

  #range(): [TerminalScreenCursor, TerminalScreenCursor] | undefined {
    if (!this.#rangeDirty) return this.#cachedRange;
    this.#rangeDirty = false;
    this.#cachedRange = undefined;
    if (!this.active || !this.#anchor || !this.#focus) return undefined;
    const forward = this.#anchor.row < this.#focus.row ||
      (this.#anchor.row === this.#focus.row && this.#anchor.column <= this.#focus.column);
    return this.#cachedRange = [
      this.#span(forward ? this.#anchor : this.#focus)[0],
      this.#span(forward ? this.#focus : this.#anchor)[1],
    ];
  }
}

function wordCategory(char: string): number {
  return /^\s+$/u.test(char) ? 0 : /[\p{L}\p{N}\p{M}_]/u.test(char) ? 1 : 2;
}
