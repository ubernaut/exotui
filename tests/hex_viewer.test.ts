// Copyright 2023 Im-Beast. MIT license.

// WID-008: edits map exactly to source offsets and cannot extend data
// without explicit policy.

import { assert, assertEquals } from "./deps.ts";
import { HexViewerController } from "../mod.ts";

const SOURCE = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x01, 0xff]);

Deno.test("rows materialize only the requested window with grouping and ascii", () => {
  const bytes = new Uint8Array(Array.from({ length: 64 }, (_, index) => index));
  const viewer = new HexViewerController(bytes, { bytesPerRow: 8 });
  const rows = viewer.rows(2, 2); // virtualized: 2 of 8 rows
  assertEquals(rows.length, 2);
  assertEquals(rows[0]!.offset, 16);
  assertEquals(rows[0]!.cells, ["10", "11", "12", "13", "14", "15", "16", "17"]);
  const hello = new HexViewerController(SOURCE, { bytesPerRow: 8 });
  assertEquals(hello.rows(0, 1)[0]!.ascii, "Hello...");
});

Deno.test("word grouping renders both endiannesses and interprets values", () => {
  const viewer = new HexViewerController(new Uint8Array([0x01, 0x02, 0x03, 0x04]), { bytesPerRow: 4, group: 2 });
  assertEquals(viewer.rows(0, 1)[0]!.cells, ["0201", "0403"]); // little-endian words
  viewer.setGrouping(2, "big");
  assertEquals(viewer.rows(0, 1)[0]!.cells, ["0102", "0304"]);
  assertEquals(viewer.wordAt(0, 2, "little"), 0x0201);
  assertEquals(viewer.wordAt(0, 4, "big"), 0x01020304);
  assertEquals(viewer.wordAt(2, 4), undefined); // words never run past the end
});

Deno.test("offset navigation clamps into range", () => {
  const viewer = new HexViewerController(SOURCE);
  assertEquals(viewer.seek(3), 3);
  assertEquals(viewer.seek(-5), 0);
  assertEquals(viewer.seek(999), SOURCE.length - 1);
  assertEquals(viewer.cursor(), SOURCE.length - 1);
});

Deno.test("diff overlay marks exactly the differing byte offsets", () => {
  const other = new Uint8Array(SOURCE);
  other[1] = 0x45;
  other[6] = 0x99;
  const viewer = new HexViewerController(SOURCE, { bytesPerRow: 8 });
  viewer.setDiffAgainst(other);
  assertEquals(viewer.rows(0, 1)[0]!.diffOffsets, [1, 6]);
  viewer.setDiffAgainst(undefined);
  assertEquals(viewer.rows(0, 1)[0]!.diffOffsets, []);
});

Deno.test("edits are an offset-keyed overlay over an untouched source", () => {
  const viewer = new HexViewerController(SOURCE, { bytesPerRow: 8 });
  assert(viewer.writeByte(0, 0x68)); // 'h'
  assert(!viewer.writeByte(0, 300)); // not a byte
  assert(!viewer.writeByte(SOURCE.length, 0x21)); // past the end → refused
  assert(!viewer.writeByte(-1, 0x21));
  assertEquals(viewer.edits(), [{ offset: 0, value: 0x68 }]); // exact source offset
  assertEquals(SOURCE[0], 0x48); // source untouched
  assertEquals(viewer.byteAt(0), 0x68); // overlay wins
  assertEquals(viewer.rows(0, 1)[0]!.editedOffsets, [0]);
  assertEquals(viewer.rows(0, 1)[0]!.ascii[0], "h");
});

Deno.test("growth is refused without the explicit append policy", () => {
  const sealed = new HexViewerController(SOURCE);
  assert(!sealed.appendByte(0x21));
  assertEquals(sealed.length(), SOURCE.length);

  const growable = new HexViewerController(SOURCE, { allowAppend: true });
  assert(growable.appendByte(0x21));
  assertEquals(growable.length(), SOURCE.length + 1);
  assertEquals(growable.byteAt(SOURCE.length), 0x21);
  assert(growable.writeByte(SOURCE.length, 0x22)); // appended bytes are editable
  assertEquals(growable.byteAt(SOURCE.length), 0x22);
});
