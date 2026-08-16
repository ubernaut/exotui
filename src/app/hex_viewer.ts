// Copyright 2023 Im-Beast. MIT license.

// 037 WID-008: the virtualized hex/binary viewer. Rows materialize
// only for the requested window; grouping renders bytes singly or as
// 2/4-byte words with little- or big-endian interpretation readouts;
// offset navigation clamps into range; a diff overlay marks exactly
// the byte offsets that differ from a comparison buffer; and edits are
// BOUNDED — every edit names an absolute source offset, replaces
// exactly one existing byte, and growing the data is refused unless
// the caller constructed the viewer with an explicit append policy.
// Edits live in an offset-keyed overlay, so the source bytes stay
// untouched and each edit maps exactly to its source offset.

/** One rendered hex row. */
export interface HexRow {
  readonly offset: number;
  /** Hex cells after grouping ("ff" or "fffe" words). */
  readonly cells: readonly string[];
  /** Printable-ASCII gutter. */
  readonly ascii: string;
  /** Byte offsets in this row differing from the diff buffer. */
  readonly diffOffsets: readonly number[];
  /** Byte offsets in this row carrying edits. */
  readonly editedOffsets: readonly number[];
}

/** The grouping/endian view options. */
export interface HexViewOptions {
  readonly bytesPerRow?: number;
  readonly group?: 1 | 2 | 4;
  readonly endian?: "little" | "big";
}

/** The hex viewer controller. */
export class HexViewerController {
  readonly #source: Uint8Array;
  readonly #edits = new Map<number, number>();
  readonly #allowAppend: boolean;
  #appended: number[] = [];
  #diffAgainst?: Uint8Array;
  #bytesPerRow: number;
  #group: 1 | 2 | 4;
  #endian: "little" | "big";
  #cursorOffset = 0;

  constructor(source: Uint8Array, options: HexViewOptions & { readonly allowAppend?: boolean } = {}) {
    this.#source = source;
    this.#allowAppend = options.allowAppend ?? false;
    this.#bytesPerRow = Math.max(1, options.bytesPerRow ?? 16);
    this.#group = options.group ?? 1;
    this.#endian = options.endian ?? "little";
  }

  length(): number {
    return this.#source.length + this.#appended.length;
  }

  /** The effective byte: overlay edit, appended tail, or source. */
  byteAt(offset: number): number | undefined {
    if (offset < 0 || offset >= this.length()) return undefined;
    const edited = this.#edits.get(offset);
    if (edited !== undefined) return edited;
    if (offset < this.#source.length) return this.#source[offset]!;
    return this.#appended[offset - this.#source.length]!;
  }

  setGrouping(group: 1 | 2 | 4, endian: "little" | "big" = this.#endian): void {
    this.#group = group;
    this.#endian = endian;
  }

  /** Offset navigation clamps into range. */
  seek(offset: number): number {
    this.#cursorOffset = Math.max(0, Math.min(offset, Math.max(0, this.length() - 1)));
    return this.#cursorOffset;
  }

  cursor(): number {
    return this.#cursorOffset;
  }

  setDiffAgainst(other: Uint8Array | undefined): void {
    this.#diffAgainst = other;
  }

  /**
   * A bounded edit: replaces exactly one EXISTING byte at an absolute
   * source offset. Values outside 0-255 and offsets past the end are
   * refused.
   */
  writeByte(offset: number, value: number): boolean {
    if (!Number.isInteger(value) || value < 0 || value > 255) return false;
    if (offset < 0 || offset >= this.length()) return false;
    this.#edits.set(offset, value);
    return true;
  }

  /** Growth requires the explicit append policy; otherwise refused. */
  appendByte(value: number): boolean {
    if (!this.#allowAppend) return false;
    if (!Number.isInteger(value) || value < 0 || value > 255) return false;
    this.#appended.push(value);
    return true;
  }

  /** The edit overlay: absolute offset → value, source untouched. */
  edits(): readonly { readonly offset: number; readonly value: number }[] {
    return [...this.#edits.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([offset, value]) => ({ offset, value }));
  }

  /** Interprets group bytes at an offset as an unsigned integer. */
  wordAt(
    offset: number,
    group: 2 | 4 = this.#group === 1 ? 2 : this.#group,
    endian = this.#endian,
  ): number | undefined {
    const bytes: number[] = [];
    for (let index = 0; index < group; index += 1) {
      const byte = this.byteAt(offset + index);
      if (byte === undefined) return undefined;
      bytes.push(byte);
    }
    const ordered = endian === "little" ? [...bytes].reverse() : bytes;
    return ordered.reduce((accumulator, byte) => accumulator * 256 + byte, 0);
  }

  /** Materializes ONLY the requested row window. */
  rows(firstRow: number, rowCount: number): readonly HexRow[] {
    const rows: HexRow[] = [];
    const totalRows = Math.ceil(this.length() / this.#bytesPerRow);
    const from = Math.max(0, firstRow);
    const to = Math.min(totalRows, from + Math.max(0, rowCount));
    for (let rowIndex = from; rowIndex < to; rowIndex += 1) {
      const offset = rowIndex * this.#bytesPerRow;
      const rowBytes: number[] = [];
      const diffOffsets: number[] = [];
      const editedOffsets: number[] = [];
      for (let index = 0; index < this.#bytesPerRow; index += 1) {
        const byteOffset = offset + index;
        const byte = this.byteAt(byteOffset);
        if (byte === undefined) break;
        rowBytes.push(byte);
        if (this.#edits.has(byteOffset)) editedOffsets.push(byteOffset);
        if (this.#diffAgainst && this.#diffAgainst[byteOffset] !== byte) diffOffsets.push(byteOffset);
      }
      const cells: string[] = [];
      for (let index = 0; index < rowBytes.length; index += this.#group) {
        const groupBytes = rowBytes.slice(index, index + this.#group);
        const ordered = this.#endian === "little" && this.#group > 1 ? [...groupBytes].reverse() : groupBytes;
        cells.push(ordered.map((byte) => byte.toString(16).padStart(2, "0")).join(""));
      }
      const ascii = rowBytes
        .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "."))
        .join("");
      rows.push({ offset, cells, ascii, diffOffsets, editedOffsets });
    }
    return rows;
  }
}
