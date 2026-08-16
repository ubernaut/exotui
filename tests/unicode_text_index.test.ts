// Copyright 2023 Im-Beast. MIT license.

// TXT-005: the immutable text index maps UTF-16, code point, grapheme, cell,
// and UTF-8 byte offsets, round-tripping exactly on grapheme boundaries and
// returning explicit resolutions everywhere else.

import { assert, assertEquals } from "./deps.ts";
import { createUnicodeTextIndex, type UnicodeTextUnit } from "../mod.ts";

const UNITS: readonly UnicodeTextUnit[] = ["utf16", "codePoint", "grapheme", "cell", "byte"];

Deno.test("TXT-005 boundary conversions round-trip across every unit pair", () => {
  // family(2 cells) + "a" + CJK 漢(2 cells) + flag(2 cells)
  const text = "👨‍👩‍👧a漢🇺🇦";
  const index = createUnicodeTextIndex(text);
  // Totals agree with the string's own facts in every coordinate system.
  assertEquals(index.totals.utf16, text.length);
  assertEquals(index.totals.codePoint, [...text].length);
  assertEquals(index.totals.byte, new TextEncoder().encode(text).byteLength);
  assertEquals(index.totals.grapheme, 4);
  assertEquals(index.totals.cell, 7); // family 2 + a 1 + 漢 2 + flag 2
  for (const boundary of index.boundaries()) {
    for (const from of UNITS) {
      const resolved = index.resolve(from, boundary[from]);
      assert(resolved.exact, `${from}:${boundary[from]} is a boundary`);
      for (const to of UNITS) {
        assertEquals(index.convert(from, boundary[from], to), boundary[to]);
      }
    }
  }
});

Deno.test("TXT-005 non-boundary offsets return explicit resolutions", () => {
  const index = createUnicodeTextIndex("👨‍👩‍👧a");
  // UTF-16 offset 3 is inside the family cluster.
  const inside = index.resolve("utf16", 3);
  assert(!inside.exact);
  assertEquals(inside.floor.grapheme, 0);
  assertEquals(inside.ceiling.grapheme, 1);
  // Cell offset 1 is the family's trailing cell — representable in cells but
  // on no grapheme boundary, so it resolves explicitly instead of rounding.
  const midCell = index.resolve("cell", 1);
  assert(!midCell.exact);
  assertEquals(midCell.floor.cell, 0);
  assertEquals(midCell.ceiling.cell, 2);
  // convert() surfaces the same resolution rather than a silently rounded number.
  const converted = index.convert("utf16", 3, "cell");
  assert(typeof converted !== "number");
});

Deno.test("TXT-005 empty text, clamping, and immutability", () => {
  const empty = createUnicodeTextIndex("");
  assertEquals(empty.totals, { utf16: 0, codePoint: 0, grapheme: 0, cell: 0, byte: 0 });
  assert(empty.resolve("byte", 5).exact, "out-of-range clamps to the end boundary");
  assertEquals(empty.resolve("byte", 5).exact && empty.resolve("byte", 5), {
    exact: true,
    position: { utf16: 0, codePoint: 0, grapheme: 0, cell: 0, byte: 0 },
  });
  const index = createUnicodeTextIndex("ab");
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.boundaries()));
  assertEquals(index.resolve("utf16", -3), { exact: true, position: index.boundaries()[0]! });
});
