// Copyright 2023 Im-Beast. MIT license.

// TERM-008: double-width and double-height are LOGICAL line attributes,
// and degradation is a documented rendering policy — never a loss of
// state. Each row carries its DECSWL/DECDWL/DECDHL attribute and its
// logical text (a double-width row logically holds half the columns);
// inspection always returns the logical attribute and logical text. A
// cell-only renderer degrades explicitly: double-width pads every glyph
// with a trailing space (occupying its two cells), and the two halves of
// a double-height pair each render the same text at single height — the
// fallback is named in the render output, so a host can display the
// degradation notice.

/** DEC line attributes. */
export type LineAttribute = "single" | "double-width" | "double-height-top" | "double-height-bottom";

/** One row's logical state. */
export interface LogicalLine {
  readonly attribute: LineAttribute;
  readonly text: string;
  /** Logical column capacity under this attribute. */
  readonly capacity: number;
}

/** One rendered row from the cell-only fallback. */
export interface RenderedLine {
  readonly cells: string;
  /** Set when this row rendered through a degradation policy. */
  readonly degradation?: "double-width-padded" | "double-height-single";
}

/** The line-attribute screen. */
export class LineAttributeScreen {
  readonly columns: number;
  readonly rows: number;
  readonly #attributes: LineAttribute[];
  readonly #text: string[];

  constructor(columns: number, rows: number) {
    this.columns = Math.max(2, columns);
    this.rows = Math.max(1, rows);
    this.#attributes = Array.from({ length: this.rows }, () => "single");
    this.#text = Array.from({ length: this.rows }, () => "");
  }

  /** DECSWL/DECDWL/DECDHL: sets a row's line attribute. */
  setLineAttribute(row: number, attribute: LineAttribute): void {
    if (row < 0 || row >= this.rows) return;
    this.#attributes[row] = attribute;
    // Content past the new logical capacity is clipped, per DEC.
    this.#text[row] = this.#text[row]!.slice(0, this.#capacity(attribute));
  }

  /** Writes logical text into a row (clipped to logical capacity). */
  writeLine(row: number, text: string): void {
    if (row < 0 || row >= this.rows) return;
    this.#text[row] = text.slice(0, this.#capacity(this.#attributes[row]!));
  }

  /** Logical inspection: attributes and text survive any rendering. */
  inspect(row: number): LogicalLine | undefined {
    if (row < 0 || row >= this.rows) return undefined;
    const attribute = this.#attributes[row]!;
    return { attribute, text: this.#text[row]!, capacity: this.#capacity(attribute) };
  }

  /** Logical column capacity for one attribute. */
  #capacity(attribute: LineAttribute): number {
    return attribute === "single" ? this.columns : Math.floor(this.columns / 2);
  }

  /** The cell-only renderer with documented degradation. */
  render(): RenderedLine[] {
    return this.#attributes.map((attribute, row) => {
      const text = this.#text[row]!;
      if (attribute === "single") return { cells: text };
      if (attribute === "double-width") {
        // Documented fallback: each glyph occupies its two cells as
        // glyph + pad space.
        return {
          cells: [...text].map((char) => `${char} `).join("").replace(/ $/, " ").slice(0, this.columns),
          degradation: "double-width-padded",
        };
      }
      // Double-height halves: each half shows the text at single height.
      return {
        cells: [...text].map((char) => `${char} `).join("").slice(0, this.columns),
        degradation: "double-height-single",
      };
    });
  }
}

/** Creates a line-attribute screen. */
export function createLineAttributeScreen(columns: number, rows: number): LineAttributeScreen {
  return new LineAttributeScreen(columns, rows);
}
