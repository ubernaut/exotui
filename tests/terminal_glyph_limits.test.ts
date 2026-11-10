// Copyright 2023 Im-Beast. MIT license.
import { assertEquals, assertThrows } from "./deps.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { characterWidth } from "../src/utils/strings.ts";
import { TerminalSelectionController } from "../src/runtime/terminal_selection.ts";

const marks = "\u0301";
const glyph = "a" + marks.repeat(5); // six UTF-16 units, four above the scalar-sized baseline

function checkAccounting(screen: TerminalScreenController): void {
  const stored = [...screen.cellRows(), ...screen.scrollbackCellRows()];
  const actual = stored.flat().reduce((sum, cell) => sum + Math.max(0, cell.char.length - 2), 0);
  const inspection = screen.inspectGlyphs();
  assertEquals(inspection.retainedGlyphExtraUtf16Units, actual);
  assertEquals(actual <= inspection.maxRetainedGlyphExtraUtf16Units, true);
}

Deno.test("terminal preserves the full accepted 65,536-unit grapheme and REP without rescanning growing clusters", () => {
  const label = "a" + marks.repeat(65_535);
  for (const insert of [false, true]) {
    const screen = new TerminalScreenController({ columns: 8, rows: 2 });
    screen.write(insert ? "\x1b[4h" : "");
    screen.write(label);
    assertEquals(screen.cellRows()[0]![0]!.char === label, true);
    assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 65_534);
    assertEquals(screen.inspectGlyphs().rejectedClusters, 0);
    screen.write("\x1b[2bX");
    assertEquals(screen.cellRows()[0]!.slice(0, 3).every((cell) => cell.char === label), true);
    assertEquals(screen.cellRows()[0]![3], { char: "X" });
    assertEquals(screen.cursor, { column: 4, row: 0 });
    checkAccounting(screen);
  }
});

Deno.test("whole-cluster refusal consumes its remaining marks until the next Unicode boundary", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2, maxGlyphUtf16Units: 32 });
  screen.write("\x1b[31ma" + marks.repeat(31));
  assertEquals(screen.cellRows()[0]![0]!.char.length, 32);
  screen.write("\x1b[32m" + marks.repeat(100) + "X");
  assertEquals(screen.cellRows()[0]!.slice(0, 2), [{ char: "\ufffd", foreground: 31 }, { char: "X", foreground: 32 }]);
  assertEquals(screen.inspectGlyphs().rejectedClusters, 1);
  checkAccounting(screen);
  screen.write("\r" + glyph);
  assertEquals(screen.cellRows()[0]![0]!.char, glyph);
  checkAccounting(screen);
});

Deno.test("one extra-text budget covers visible cells, saved main screen, alternate screen and history", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 1, maxRetainedGlyphExtraUtf16Units: 8 });
  screen.write(glyph + glyph + glyph + "X");
  assertEquals(screen.cellRows()[0]!.slice(0, 4).map((cell) => cell.char), [glyph, glyph, "\ufffd", "X"]);
  assertEquals(screen.inspectGlyphs().rejectedClusters, 1);
  checkAccounting(screen);
  screen.write("\x1b[HZ");
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 4);
  screen.write("\x1b[?1049h" + glyph);
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 8);
  screen.write(glyph);
  assertEquals(screen.cellRows()[0]!.slice(0, 2).map((cell) => cell.char), [glyph, "\ufffd"]);
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 8);
  screen.clear(); // clearing the alternate must not forget the saved main's four units
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 4);
  screen.write(glyph + "\x1b[?1049l");
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 4);
  checkAccounting(screen);
  screen.write("\x1b[2J" + "\x1b[H" + glyph + "\r\n" + glyph + "\r\n");
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 8);
  checkAccounting(screen);
  screen.setScrollbackLimit(1);
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 4);
  screen.clear(); // history remains retained
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 4);
  screen.write("\x1b[3J");
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 0);
  screen.write("\x1bc");
  assertEquals(screen.inspectGlyphs().rejectedClusters, 0);
  checkAccounting(screen);
});

Deno.test("erase, line/cell edits, scroll regions and resize release exactly the retained glyph units", () => {
  const screen = new TerminalScreenController({
    columns: 8,
    rows: 3,
    scrollbackLimit: 3,
    maxRetainedGlyphExtraUtf16Units: 64,
  });
  let seed = 0x241c8a;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const operations = [
    glyph,
    "\x1b[H",
    "\r\n",
    "\x1b[1@",
    "\x1b[2P",
    "\x1b[2X",
    "\x1b[2K",
    "\x1b[J",
    "\x1b[1L",
    "\x1b[1M",
    "\x1b[1S",
    "\x1b[1T",
    "\x1bM",
    "\x1b[2b",
    "\x1b[2;3r",
    "\x1b[r",
  ];
  for (let i = 0; i < 1200; i++) {
    screen.write(operations[random() % operations.length]!);
    if (i % 19 === 0) screen.resize(4 + random() % 5, 2 + random() % 2);
    if (i % 71 === 0) screen.setScrollbackLimit(random() % 4);
    checkAccounting(screen);
  }
  screen.clear();
  checkAccounting(screen);
});

Deno.test("keycap width stays wide when later nonspacing marks extend its cluster", () => {
  const label = "1️⃣" + marks.repeat(256);
  assertEquals(characterWidth(label), 2);
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });
  screen.write(label + "X");
  assertEquals(screen.cellRows()[0]!.slice(0, 3), [{ char: label }, { char: " ", continuation: true }, { char: "X" }]);
  checkAccounting(screen);
});

Deno.test("terminal glyph budgets validate before allocating a screen", () => {
  for (const value of [-1, 0, 65_537, 0.5, NaN, Infinity]) {
    assertThrows(() => new TerminalScreenController({ maxGlyphUtf16Units: value }), RangeError);
  }
  for (const value of [-1, 8_388_609, 0.5, NaN, Infinity]) {
    assertThrows(() => new TerminalScreenController({ maxRetainedGlyphExtraUtf16Units: value }), RangeError);
  }
  const screen = new TerminalScreenController({ maxRetainedGlyphExtraUtf16Units: 0 });
  screen.write(glyph);
  assertEquals(screen.cellRows()[0]![0]!.char, "\ufffd");
  assertEquals(screen.inspectGlyphs().retainedGlyphExtraUtf16Units, 0);
});

Deno.test("long narrow and wide labels remain copyable whole across wrapping and history", () => {
  const narrow = "a" + marks.repeat(256), wide = "1️⃣" + marks.repeat(256);
  const screen = new TerminalScreenController({ columns: 4, rows: 2 });
  screen.write(narrow + wide + "XYZ");
  const selection = new TerminalSelectionController();
  selection.begin(screen.cellRows(), { column: 0, row: 0 });
  selection.extend({ column: 3, row: 1 });
  assertEquals(selection.selectedText(), narrow + wide + "XYZ");
  screen.write("\r\n");
  assertEquals(screen.scrollbackRows, 1);
  const all = [...screen.scrollbackCellRows(), ...screen.cellRows()];
  selection.begin(all, { column: 0, row: 0 });
  selection.extend({ column: 1, row: 1 });
  assertEquals(selection.selectedText(), narrow + wide + "XYZ");
  checkAccounting(screen);
});

Deno.test("unplaced zero-only cluster text is bounded and rejected without retaining its prefix", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 1, maxGlyphUtf16Units: 32 });
  screen.write(marks.repeat(32));
  assertEquals(screen.cellRows()[0]![0], { char: " " });
  screen.write(marks.repeat(100) + "X");
  assertEquals(screen.cellRows()[0]!.slice(0, 2), [{ char: "\ufffd" }, { char: "X" }]);
  assertEquals(screen.inspectGlyphs().rejectedClusters, 1);
  checkAccounting(screen);
  const strict = new TerminalScreenController({ columns: 8, rows: 1, maxGlyphUtf16Units: 1 });
  strict.write("\u{e0100}" + marks + "X");
  assertEquals(strict.cellRows()[0]!.slice(0, 2), [{ char: "\ufffd" }, { char: "X" }]);
  assertEquals(strict.inspectGlyphs().rejectedClusters, 1);
});
