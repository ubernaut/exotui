// Copyright 2023 Im-Beast. MIT license.

// TERM-007: margins bound EVERYTHING inside them. The margin screen
// wraps a CellScreen with top/bottom (DECSTBM) and left/right (DECSLRM)
// margins plus origin mode (DECOM): with origin mode on, cursor
// addressing is relative to the margin corner and clamps inside the
// margins; printing wraps at the RIGHT margin to the LEFT margin of the
// next row and scrolls the region when it passes the bottom margin;
// scrolling, insert/delete line, and insert/delete character all move
// cells strictly inside the margin box — content outside the margins
// never moves.

import { type CellScreen, DEFAULT_ATTRIBUTES, type ScreenCell } from "./cell_screen.ts";

const BLANK: ScreenCell = { char: " ", attributes: DEFAULT_ATTRIBUTES };

/** The margin-aware screen. */
export class MarginScreen {
  readonly screen: CellScreen;
  #top = 0;
  #bottom: number;
  #left = 0;
  #right: number;
  #originMode = false;
  #cursorRow = 0;
  #cursorColumn = 0;

  constructor(screen: CellScreen) {
    this.screen = screen;
    this.#bottom = screen.rows - 1;
    this.#right = screen.columns - 1;
  }

  /** DECSTBM: top/bottom margins (inclusive rows). */
  setVerticalMargins(top: number, bottom: number): void {
    if (top >= bottom) return; // DEC ignores degenerate regions
    this.#top = Math.max(0, top);
    this.#bottom = Math.min(this.screen.rows - 1, bottom);
    this.#moveCursorHome();
  }

  /** DECSLRM: left/right margins (inclusive columns). */
  setHorizontalMargins(left: number, right: number): void {
    if (left >= right) return;
    this.#left = Math.max(0, left);
    this.#right = Math.min(this.screen.columns - 1, right);
    this.#moveCursorHome();
  }

  /** DECOM. */
  setOriginMode(enabled: boolean): void {
    this.#originMode = enabled;
    this.#moveCursorHome();
  }

  margins(): { top: number; bottom: number; left: number; right: number } {
    return { top: this.#top, bottom: this.#bottom, left: this.#left, right: this.#right };
  }

  cursor(): { row: number; column: number } {
    return { row: this.#cursorRow, column: this.#cursorColumn };
  }

  /** CUP: origin-relative and margin-clamped when origin mode is on. */
  setCursor(row: number, column: number): void {
    if (this.#originMode) {
      this.#cursorRow = Math.min(this.#bottom, Math.max(this.#top, this.#top + row));
      this.#cursorColumn = Math.min(this.#right, Math.max(this.#left, this.#left + column));
    } else {
      this.#cursorRow = Math.min(this.screen.rows - 1, Math.max(0, row));
      this.#cursorColumn = Math.min(this.screen.columns - 1, Math.max(0, column));
    }
  }

  /** Prints text with right-margin wrap and bottom-margin scroll. */
  print(text: string): void {
    for (const char of text) {
      if (this.#cursorColumn > this.#right) {
        this.#cursorColumn = this.#left;
        if (this.#cursorRow === this.#bottom) this.scrollUp(1);
        else this.#cursorRow += 1;
      }
      this.screen.set(this.#cursorColumn, this.#cursorRow, { char, attributes: DEFAULT_ATTRIBUTES });
      this.#cursorColumn += 1;
    }
  }

  /** Scrolls the margin BOX up; outside content never moves. */
  scrollUp(count: number): void {
    for (let iteration = 0; iteration < count; iteration += 1) {
      for (let row = this.#top; row < this.#bottom; row += 1) {
        for (let column = this.#left; column <= this.#right; column += 1) {
          this.screen.set(column, row, this.screen.get(column, row + 1));
        }
      }
      for (let column = this.#left; column <= this.#right; column += 1) {
        this.screen.set(column, this.#bottom, BLANK);
      }
    }
  }

  /** Scrolls the margin box down. */
  scrollDown(count: number): void {
    for (let iteration = 0; iteration < count; iteration += 1) {
      for (let row = this.#bottom; row > this.#top; row -= 1) {
        for (let column = this.#left; column <= this.#right; column += 1) {
          this.screen.set(column, row, this.screen.get(column, row - 1));
        }
      }
      for (let column = this.#left; column <= this.#right; column += 1) {
        this.screen.set(column, this.#top, BLANK);
      }
    }
  }

  /** IL: inserts blank lines at the cursor row, inside the box only. */
  insertLines(count: number): void {
    if (this.#cursorRow < this.#top || this.#cursorRow > this.#bottom) return;
    for (let iteration = 0; iteration < count; iteration += 1) {
      for (let row = this.#bottom; row > this.#cursorRow; row -= 1) {
        for (let column = this.#left; column <= this.#right; column += 1) {
          this.screen.set(column, row, this.screen.get(column, row - 1));
        }
      }
      for (let column = this.#left; column <= this.#right; column += 1) {
        this.screen.set(column, this.#cursorRow, BLANK);
      }
    }
  }

  /** DL: deletes lines at the cursor row, inside the box only. */
  deleteLines(count: number): void {
    if (this.#cursorRow < this.#top || this.#cursorRow > this.#bottom) return;
    for (let iteration = 0; iteration < count; iteration += 1) {
      for (let row = this.#cursorRow; row < this.#bottom; row += 1) {
        for (let column = this.#left; column <= this.#right; column += 1) {
          this.screen.set(column, row, this.screen.get(column, row + 1));
        }
      }
      for (let column = this.#left; column <= this.#right; column += 1) {
        this.screen.set(column, this.#bottom, BLANK);
      }
    }
  }

  /** ICH: inserts blanks at the cursor, shifting right to the margin. */
  insertCharacters(count: number): void {
    const row = this.#cursorRow;
    for (let iteration = 0; iteration < count; iteration += 1) {
      for (let column = this.#right; column > this.#cursorColumn; column -= 1) {
        this.screen.set(column, row, this.screen.get(column - 1, row));
      }
      this.screen.set(this.#cursorColumn, row, BLANK);
    }
  }

  /** DCH: deletes at the cursor, pulling left from the margin. */
  deleteCharacters(count: number): void {
    const row = this.#cursorRow;
    for (let iteration = 0; iteration < count; iteration += 1) {
      for (let column = this.#cursorColumn; column < this.#right; column += 1) {
        this.screen.set(column, row, this.screen.get(column + 1, row));
      }
      this.screen.set(this.#right, row, BLANK);
    }
  }

  #moveCursorHome(): void {
    this.#cursorRow = this.#originMode ? this.#top : 0;
    this.#cursorColumn = this.#originMode ? this.#left : 0;
  }
}

/** Creates a margin screen over a cell screen. */
export function createMarginScreen(screen: CellScreen): MarginScreen {
  return new MarginScreen(screen);
}
