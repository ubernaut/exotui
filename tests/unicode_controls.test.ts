// Copyright 2023 Im-Beast. MIT license.

// TXT-010: configurable tab stops, visible-control renderers, and reversible
// cell mappings that keep cursor/selection/copy in agreement by construction.

import { assert, assertEquals } from "./deps.ts";
import { expandTerminalControls, nextTerminalTabStop } from "../mod.ts";

Deno.test("TXT-010 tab stops: default interval and explicit stop lists", () => {
  assertEquals(nextTerminalTabStop(0), 8);
  assertEquals(nextTerminalTabStop(7), 8);
  assertEquals(nextTerminalTabStop(8), 16);
  const custom = { stops: [4, 10], interval: 8 };
  assertEquals(nextTerminalTabStop(0, custom), 4);
  assertEquals(nextTerminalTabStop(5, custom), 10);
  assertEquals(nextTerminalTabStop(11, custom), 18);
  assertEquals(nextTerminalTabStop(19, custom), 26);
});

Deno.test("TXT-010 tabs expand to the stop and map every pad to the source", () => {
  const expansion = expandTerminalControls("ab\tc");
  assertEquals(expansion.cells.map((cell) => cell.glyph).join(""), "ab      c");
  // The tab's six pads all map back to the single \t source unit.
  const range = expansion.cellRangeForSource(2)!;
  assertEquals(range, { start: 2, end: 8 });
  assert(expansion.cells[3]!.synthesized);
  assertEquals(expansion.sourceOffsetAt(5), 2);
  // A tab mid-line respects the running column and a custom start column.
  const offsetStart = expandTerminalControls("\t", { startColumn: 6 });
  assertEquals(offsetStart.cells.length, 2); // columns 6,7 -> stop 8
});

Deno.test("TXT-010 control rendering modes: picture, caret, hidden", () => {
  const picture = expandTerminalControls("a\x01b\x7f");
  assertEquals(picture.cells.map((cell) => cell.glyph).join(""), "a␁b␡");
  const caret = expandTerminalControls("a\x01b\x7f", { controls: "caret" });
  assertEquals(caret.cells.map((cell) => cell.glyph).join(""), "a^Ab^?");
  assert(caret.cells[2]!.synthesized, "the caret's second cell is synthesized");
  assertEquals(caret.cells[1]!.sourceStart, caret.cells[2]!.sourceStart);
  const hidden = expandTerminalControls("a\x01b", { controls: "hidden" });
  assertEquals(hidden.cells.map((cell) => cell.glyph).join(""), "ab");
});

Deno.test("TXT-010 copy reconstructs the exact source across expansions", () => {
  const source = "x\ty\x01z漢👍🏽!";
  const expansion = expandTerminalControls(source);
  // Full-range copy is the identity.
  assertEquals(expansion.copy(0, expansion.cells.length), source);
  // A selection that only touches tab padding still copies the whole tab.
  const tabRange = expansion.cellRangeForSource(1)!;
  assertEquals(expansion.copy(tabRange.start + 1, tabRange.start + 2), "\t");
  // Wide clusters keep their trailing cell mapped to the same source, so a
  // selection ending on the trailing cell copies the whole cluster.
  const cells = expansion.cells;
  const wideStart = cells.findIndex((cell) => cell.glyph === "漢");
  assertEquals(expansion.copy(wideStart, wideStart + 2), "漢");
  assert(cells[wideStart + 1]!.synthesized);
});

Deno.test("TXT-010 cursor/selection agreement: offsets round-trip through cells", () => {
  const source = "a\tb\x02c";
  const expansion = expandTerminalControls(source, { controls: "caret" });
  for (let offset = 0; offset < source.length; offset += 1) {
    const range = expansion.cellRangeForSource(offset)!;
    assert(range.start < range.end);
    assertEquals(expansion.sourceOffsetAt(range.start), offset);
  }
});
