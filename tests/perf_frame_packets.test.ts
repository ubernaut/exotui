// Copyright 2023 Im-Beast. MIT license.

// PER-005: ownership transfers with no structured-clone copy of the
// cell payload.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { type PackedCellInput, packFramePacket, unpackFramePacket } from "../mod.ts";

function frame(): PackedCellInput[] {
  return Array.from({ length: 12 }, (_, index) => ({
    char: index % 2 === 0 ? "A" : "界",
    style: index % 3 === 0 ? "bold" : "plain",
  }));
}

Deno.test("packets deduplicate tables and round-trip exactly", () => {
  const cells = frame();
  const packet = packFramePacket(4, 3, cells);
  assertEquals(packet.glyphTable, ["A", "界"]); // deduplicated
  assertEquals(packet.styleTable, ["bold", "plain"]);
  assertEquals(packet.cells.length, 12);
  assertEquals(packet.transfer.length, 1);
  assertEquals(packet.transfer[0], packet.cells.buffer);

  const unpacked = unpackFramePacket(packet);
  assert(unpacked.ok);
  assertEquals(unpacked.cells, cells); // exact reconstruction
  assertThrows(() => packFramePacket(5, 3, cells), RangeError, "expected 15");
});

Deno.test("transfer moves ownership: the sender detaches, nothing copies", () => {
  const packet = packFramePacket(4, 3, frame());
  const buffer = packet.cells.buffer as ArrayBuffer;
  const originalBytes = buffer.byteLength;
  assert(originalBytes > 0);

  // The real transfer machinery: structuredClone with transfer moves the
  // buffer instead of copying the payload.
  const moved = structuredClone(
    { cells: packet.cells, glyphTable: packet.glyphTable, styleTable: packet.styleTable },
    { transfer: [buffer] },
  );
  assertEquals(buffer.byteLength, 0); // sender side DETACHED — ownership moved
  assertEquals(moved.cells.byteLength, originalBytes); // receiver owns the bytes

  // The receiver reconstructs the exact frame from the moved buffer.
  const received = unpackFramePacket({
    version: 1,
    columns: 4,
    rows: 3,
    glyphTable: moved.glyphTable,
    styleTable: moved.styleTable,
    cells: moved.cells,
    transfer: [],
  });
  assert(received.ok);
  assertEquals(received.cells, frame());

  // The detached sender-side packet reports itself, never garbage.
  const stale = unpackFramePacket(packet);
  assert(!stale.ok && stale.reason.includes("detached"));
});

Deno.test("corrupt packets fail closed with reasons", () => {
  const packet = packFramePacket(2, 1, [{ char: "x", style: "s" }, { char: "y", style: "s" }]);
  const wrongSize = unpackFramePacket({ ...packet, rows: 5 });
  assert(!wrongSize.ok && wrongSize.reason.includes("dimensions"));
  const badRef = unpackFramePacket({ ...packet, glyphTable: [] });
  assert(!badRef.ok && badRef.reason.includes("missing table entry"));
});
