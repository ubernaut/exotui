// Copyright 2023 Im-Beast. MIT license.

// PER-005: frame packets cross worker/remote boundaries by TRANSFER, not
// copy. Packing deduplicates glyphs and styles into small tables and
// stores every cell as one uint32 (glyph index << 16 | style index) in a
// single ArrayBuffer; the packet lists that buffer as its transferable,
// so postMessage / structuredClone with transfer moves OWNERSHIP — the
// sender's view detaches and no structured-clone copy of the cell
// payload ever exists. Unpacking reconstructs the exact frame; a
// detached packet unpacks to an explicit error, never garbage.

/** One styled cell (matches the REM-004 shape). */
export interface PackedCellInput {
  readonly char: string;
  readonly style: string;
}

/** The transferable packet. */
export interface FramePacket {
  readonly version: 1;
  readonly columns: number;
  readonly rows: number;
  /** Deduplicated glyph and style tables (small, clone-cheap). */
  readonly glyphTable: readonly string[];
  readonly styleTable: readonly string[];
  /** The packed cell payload view over ONE buffer. */
  readonly cells: Uint32Array;
  /** What the host must pass as postMessage transferables. */
  readonly transfer: readonly ArrayBuffer[];
}

/** Packs a frame into a single-buffer transferable packet. */
export function packFramePacket(
  columns: number,
  rows: number,
  cells: readonly PackedCellInput[],
): FramePacket {
  if (cells.length !== columns * rows) {
    throw new RangeError(`expected ${columns * rows} cells, got ${cells.length}`);
  }
  const glyphIndex = new Map<string, number>();
  const styleIndex = new Map<string, number>();
  const packed = new Uint32Array(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]!;
    let glyph = glyphIndex.get(cell.char);
    if (glyph === undefined) {
      glyph = glyphIndex.size;
      if (glyph > 0xffff) throw new RangeError("glyph table overflow (max 65536 unique glyphs)");
      glyphIndex.set(cell.char, glyph);
    }
    let style = styleIndex.get(cell.style);
    if (style === undefined) {
      style = styleIndex.size;
      if (style > 0xffff) throw new RangeError("style table overflow (max 65536 unique styles)");
      styleIndex.set(cell.style, style);
    }
    packed[index] = (glyph << 16) | style;
  }
  return {
    version: 1,
    columns,
    rows,
    glyphTable: [...glyphIndex.keys()],
    styleTable: [...styleIndex.keys()],
    cells: packed,
    transfer: [packed.buffer as ArrayBuffer],
  };
}

/** An unpack outcome. */
export type UnpackResult =
  | { readonly ok: true; readonly cells: readonly PackedCellInput[] }
  | { readonly ok: false; readonly reason: string };

/** Unpacks a packet back into styled cells — exact or an explicit error. */
export function unpackFramePacket(packet: FramePacket): UnpackResult {
  if (packet.version !== 1) return { ok: false, reason: `unknown packet version ${packet.version}` };
  if (packet.cells.buffer.byteLength === 0) {
    return { ok: false, reason: "packet buffer is detached (ownership was transferred away)" };
  }
  if (packet.cells.length !== packet.columns * packet.rows) {
    return { ok: false, reason: "cell payload does not match the declared dimensions" };
  }
  const cells: PackedCellInput[] = [];
  for (const word of packet.cells) {
    const glyph = packet.glyphTable[word >>> 16];
    const style = packet.styleTable[word & 0xffff];
    if (glyph === undefined || style === undefined) {
      return { ok: false, reason: "packed cell references a missing table entry" };
    }
    cells.push({ char: glyph, style });
  }
  return { ok: true, cells };
}
