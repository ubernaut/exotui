// Copyright 2023 Im-Beast. MIT license.

// TERM-006 (+ the shared screen core): a bounded cell screen with DEC
// rectangular operations. Every rectangle is clipped to the screen
// before it does anything; copy (DECCRA) reads its whole source into a
// buffer before writing, so overlapping copies behave like the DEC
// buffered semantics rather than smearing; fill (DECFRA), erase
// (DECERA), attribute-change (DECCARA), and reverse-attribute (DECRARA)
// touch exactly the clipped cells. Cells carry a protected flag for the
// TERM-005 selective-erase layer built on this same screen.

/** One cell's attributes. */
export interface CellAttributes {
  readonly bold: boolean;
  readonly underline: boolean;
  readonly reverse: boolean;
  /** DECSCA protection (consumed by TERM-005 selective erase). */
  readonly protected: boolean;
}

/** One screen cell. */
export interface ScreenCell {
  readonly char: string;
  readonly attributes: CellAttributes;
}

/** A rectangle in cell coordinates (inclusive top/left, exclusive bottom/right). */
export interface CellRect {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export const DEFAULT_ATTRIBUTES: CellAttributes = Object.freeze({
  bold: false,
  underline: false,
  reverse: false,
  protected: false,
});

const BLANK: ScreenCell = Object.freeze({ char: " ", attributes: DEFAULT_ATTRIBUTES });

/** The bounded cell screen. */
export class CellScreen {
  readonly columns: number;
  readonly rows: number;
  readonly #cells: ScreenCell[];

  constructor(columns: number, rows: number) {
    this.columns = Math.max(1, columns);
    this.rows = Math.max(1, rows);
    this.#cells = Array.from({ length: this.columns * this.rows }, () => BLANK);
  }

  get(column: number, row: number): ScreenCell {
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return BLANK;
    return this.#cells[row * this.columns + column]!;
  }

  set(column: number, row: number, cell: ScreenCell): void {
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return;
    this.#cells[row * this.columns + column] = cell;
  }

  /** Writes text at a position with attributes (helper for fixtures). */
  write(column: number, row: number, text: string, attributes: Partial<CellAttributes> = {}): void {
    let cursor = column;
    for (const char of text) {
      this.set(cursor, row, { char, attributes: { ...DEFAULT_ATTRIBUTES, ...attributes } });
      cursor += 1;
    }
  }

  /** The screen as plain lines (trailing spaces trimmed). */
  lines(): string[] {
    const out: string[] = [];
    for (let row = 0; row < this.rows; row += 1) {
      let line = "";
      for (let column = 0; column < this.columns; column += 1) line += this.get(column, row).char;
      out.push(line.replace(/ +$/, ""));
    }
    return out;
  }

  /** Clips a rect to the screen bounds. */
  clip(rect: CellRect): CellRect {
    return {
      top: Math.max(0, Math.min(this.rows, rect.top)),
      left: Math.max(0, Math.min(this.columns, rect.left)),
      bottom: Math.max(0, Math.min(this.rows, rect.bottom)),
      right: Math.max(0, Math.min(this.columns, rect.right)),
    };
  }

  /** DECCRA: buffered rectangular copy — overlap-safe. */
  copyRect(source: CellRect, targetTop: number, targetLeft: number): void {
    const clipped = this.clip(source);
    const buffer: ScreenCell[][] = [];
    for (let row = clipped.top; row < clipped.bottom; row += 1) {
      const line: ScreenCell[] = [];
      for (let column = clipped.left; column < clipped.right; column += 1) {
        line.push(this.get(column, row));
      }
      buffer.push(line);
    }
    // Write phase: the buffer is complete, so overlap cannot smear.
    for (let rowOffset = 0; rowOffset < buffer.length; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < buffer[rowOffset]!.length; columnOffset += 1) {
        this.set(targetLeft + columnOffset, targetTop + rowOffset, buffer[rowOffset]![columnOffset]!);
      }
    }
  }

  /** DECFRA: fills the clipped rect with one character. */
  fillRect(rect: CellRect, char: string, attributes: Partial<CellAttributes> = {}): void {
    const clipped = this.clip(rect);
    const cell: ScreenCell = { char, attributes: { ...DEFAULT_ATTRIBUTES, ...attributes } };
    for (let row = clipped.top; row < clipped.bottom; row += 1) {
      for (let column = clipped.left; column < clipped.right; column += 1) this.set(column, row, cell);
    }
  }

  /** DECERA: erases the clipped rect to blanks. */
  eraseRect(rect: CellRect): void {
    this.fillRect(rect, " ");
  }

  /** DECCARA: changes attributes in the rect, keeping characters. */
  changeAttributesInRect(rect: CellRect, change: Partial<Omit<CellAttributes, "protected">>): void {
    const clipped = this.clip(rect);
    for (let row = clipped.top; row < clipped.bottom; row += 1) {
      for (let column = clipped.left; column < clipped.right; column += 1) {
        const cell = this.get(column, row);
        this.set(column, row, { char: cell.char, attributes: { ...cell.attributes, ...change } });
      }
    }
  }

  /** DECRARA: toggles the named attributes in the rect. */
  reverseAttributesInRect(rect: CellRect, toggles: readonly ("bold" | "underline" | "reverse")[]): void {
    const clipped = this.clip(rect);
    for (let row = clipped.top; row < clipped.bottom; row += 1) {
      for (let column = clipped.left; column < clipped.right; column += 1) {
        const cell = this.get(column, row);
        const attributes = { ...cell.attributes };
        for (const toggle of toggles) attributes[toggle] = !attributes[toggle];
        this.set(column, row, { char: cell.char, attributes });
      }
    }
  }
}

/** Creates a cell screen. */
export function createCellScreen(columns: number, rows: number): CellScreen {
  return new CellScreen(columns, rows);
}
