// Copyright 2023 Im-Beast. MIT license.

// TERM-004: shrinking then expanding reconstructs logical lines and
// stable scrollback anchors.

import { assert, assertEquals } from "./deps.ts";
import { createReflowBuffer, type StyledChar } from "../mod.ts";

function cells(text: string, style = "plain"): StyledChar[] {
  return [...text].map((char) => ({ char, style }));
}

function rowText(row: { cells: readonly StyledChar[] }): string {
  return row.cells.map((cell) => cell.char).join("");
}

function makeBuffer() {
  const buffer = createReflowBuffer();
  // Terminal at width 10: a 25-cell logical line arrives as three rows,
  // the last two flagged soft-wrapped; then a short hard-broken line.
  buffer.ingestRow(cells("0123456789"), false);
  buffer.ingestRow(cells("ABCDEFGHIJ", "bold"), true);
  buffer.ingestRow(cells("xyz"), true);
  buffer.ingestRow(cells("hard"), false);
  return buffer;
}

Deno.test("soft-wrapped rows merge into logical lines; hard breaks never do", () => {
  const buffer = makeBuffer();
  const logical = buffer.logicalLines();
  assertEquals(logical.length, 2);
  assertEquals(logical[0]!.cells.length, 23);
  assertEquals(rowText(logical[0]!), "0123456789ABCDEFGHIJxyz");
  assertEquals(logical[0]!.cells[10]!.style, "bold"); // styles preserved
  assertEquals(rowText(logical[1]!), "hard");
});

Deno.test("shrink then expand reconstructs the original display exactly", () => {
  const buffer = makeBuffer();
  const original = buffer.displayRows(10);
  assertEquals(original.map(rowText), ["0123456789", "ABCDEFGHIJ", "xyz", "hard"]);
  assertEquals(original.map((row) => row.softWrapped), [false, true, true, false]);

  const narrow = buffer.displayRows(5);
  assertEquals(narrow.map(rowText), ["01234", "56789", "ABCDE", "FGHIJ", "xyz", "hard"]);

  const restored = buffer.displayRows(10);
  assertEquals(restored, original); // byte-for-byte reconstruction
  // Styles survived the round trip.
  assertEquals(restored[1]!.cells[0]!.style, "bold");
});

Deno.test("scrollback anchors stay on the same content across widths", () => {
  const buffer = makeBuffer();
  // The reader is looking at the row starting with "ABCDE" at width 10.
  const anchor = buffer.anchorForDisplayRow(10, 1)!;
  assertEquals(anchor, { logicalId: 1, offset: 10 });

  // At width 5 the same content sits at row 2.
  const narrowRow = buffer.displayRowForAnchor(5, anchor);
  assertEquals(narrowRow, 2);
  assertEquals(rowText(buffer.displayRows(5)[narrowRow]!), "ABCDE");

  // Back at width 10, the anchor returns to its original row.
  assertEquals(buffer.displayRowForAnchor(10, anchor), 1);
  // An anchor mid-row still resolves to the row containing it.
  assertEquals(buffer.displayRowForAnchor(5, { logicalId: 1, offset: 12 }), 2);
  assertEquals(buffer.displayRowForAnchor(10, { logicalId: 99, offset: 0 }), -1);
});
