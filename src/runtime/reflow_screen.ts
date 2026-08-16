// Copyright 2023 Im-Beast. MIT license.

// TERM-004: LOGICAL lines are the source of truth and display rows are a
// projection. Rows ingested from the terminal carry their soft-wrap flag;
// consecutive soft-wrapped rows merge into one logical line (styles
// preserved per cell), hard breaks always end one. Reflowing to any width
// re-wraps the logical lines — shrinking then expanding reconstructs the
// original display exactly because nothing but the projection changed —
// and scrollback anchors are (logicalLineId, cellOffset) pairs that map
// to a display row at EVERY width, so a resize never loses the reader's
// place.

/** One styled cell in a logical line. */
export interface StyledChar {
  readonly char: string;
  readonly style: string;
}

/** One logical line. */
export interface LogicalBufferLine {
  /** Stable id — the scrollback anchor space. */
  readonly id: number;
  readonly cells: readonly StyledChar[];
}

/** One projected display row. */
export interface DisplayRow {
  readonly logicalId: number;
  /** Cell offset of this row's first cell inside its logical line. */
  readonly start: number;
  readonly cells: readonly StyledChar[];
  readonly softWrapped: boolean;
}

/** A scrollback anchor. */
export interface ScrollAnchor {
  readonly logicalId: number;
  readonly offset: number;
}

/** The reflow buffer. */
export class ReflowBuffer {
  readonly #lines: { id: number; cells: StyledChar[] }[] = [];
  #nextId = 1;

  /**
   * Ingests one display row. `softWrappedFromPrevious` means this row
   * continues the previous logical line.
   */
  ingestRow(cells: readonly StyledChar[], softWrappedFromPrevious: boolean): void {
    if (softWrappedFromPrevious && this.#lines.length > 0) {
      this.#lines[this.#lines.length - 1]!.cells.push(...cells);
      return;
    }
    this.#lines.push({ id: this.#nextId++, cells: [...cells] });
  }

  /** The logical truth. */
  logicalLines(): readonly LogicalBufferLine[] {
    return this.#lines.map((line) => ({ id: line.id, cells: [...line.cells] }));
  }

  /** Projects the buffer at one width. */
  displayRows(width: number): DisplayRow[] {
    const columns = Math.max(1, width);
    const rows: DisplayRow[] = [];
    for (const line of this.#lines) {
      if (line.cells.length === 0) {
        rows.push({ logicalId: line.id, start: 0, cells: [], softWrapped: false });
        continue;
      }
      for (let start = 0; start < line.cells.length; start += columns) {
        rows.push({
          logicalId: line.id,
          start,
          cells: line.cells.slice(start, start + columns),
          softWrapped: start > 0,
        });
      }
    }
    return rows;
  }

  /** The anchor for a display row at one width. */
  anchorForDisplayRow(width: number, rowIndex: number): ScrollAnchor | undefined {
    const row = this.displayRows(width)[rowIndex];
    return row ? { logicalId: row.logicalId, offset: row.start } : undefined;
  }

  /** The display row containing an anchor at one width. */
  displayRowForAnchor(width: number, anchor: ScrollAnchor): number {
    const rows = this.displayRows(width);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      if (row.logicalId !== anchor.logicalId) continue;
      const end = row.start + Math.max(1, row.cells.length);
      if (anchor.offset >= row.start && anchor.offset < end) return index;
    }
    return -1;
  }
}

/** Creates a reflow buffer. */
export function createReflowBuffer(): ReflowBuffer {
  return new ReflowBuffer();
}
