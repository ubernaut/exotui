import { assertEquals } from "./deps.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { TerminalSelectionController } from "../src/runtime/terminal_selection.ts";

Deno.test("terminal selection captures reverse multiline ranges without ANSI or padding", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 3 });
  screen.write("\x1b[31mhello world\r\nnext line");
  const selection = new TerminalSelectionController();
  selection.begin(screen.cellRows(), { row: 1, column: 3 });
  assertEquals(selection.selectedText(), "");
  selection.extend({ row: 0, column: 6 });
  assertEquals(selection.selectedText(), "world\nnext");
  assertEquals(selection.contains(5, 0), false);
  assertEquals(selection.contains(6, 0), true);
  assertEquals(selection.contains(3, 1), true);
  assertEquals(selection.contains(4, 1), false);
  screen.write("\x1b[2Jchanged");
  assertEquals(selection.selectedText(), "world\nnext");
  selection.clear();
  assertEquals(selection.active, false);
  assertEquals(selection.rows.length, 0);
});

Deno.test("terminal selection preserves combining marks and both halves of wide glyphs", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write("Ae\u0301界😀Z");
  const selection = new TerminalSelectionController();
  selection.begin(screen.cellRows(), { row: 0, column: 3 }); // right half of 界
  selection.extend({ row: 0, column: 5 }); // right half of emoji
  assertEquals(selection.selectedText(), "界😀");
  assertEquals(selection.contains(2, 0), true);
  selection.extend({ row: 0, column: 1 });
  assertEquals(selection.selectedText(), "e\u0301界");
});

Deno.test("terminal selection expands word and line gestures in either direction", () => {
  const screen = new TerminalScreenController({ columns: 20, rows: 2 });
  screen.write("hello world!\r\nsecond row");
  const selection = new TerminalSelectionController();
  selection.begin(screen.cellRows(), { row: 0, column: 8 }, "word");
  assertEquals(selection.selectedText(), "world");
  selection.extend({ row: 0, column: 2 });
  assertEquals(selection.selectedText(), "hello world");
  selection.begin(screen.cellRows(), { row: 1, column: 5 }, "line");
  assertEquals(selection.selectedText(), "second row");
  selection.extend({ row: -10, column: -10 });
  assertEquals(selection.selectedText(), "hello world!\nsecond row");
});

Deno.test("terminal selection safely handles empty rows and out-of-bounds endpoints", () => {
  const selection = new TerminalSelectionController();
  selection.begin([], { row: 0, column: 0 }, "word");
  assertEquals(selection.selectedText(), "");
  selection.begin([[], [{ char: "x" }]], { row: 0, column: 100 });
  selection.extend({ row: 100, column: 100 });
  assertEquals(selection.selectedText(), "\nx");
});

Deno.test("terminal word selection stops before a neighboring wide punctuation glyph", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 1 });
  screen.write("😀hello界");
  const selection = new TerminalSelectionController();
  selection.begin(screen.cellRows(), { row: 0, column: 3 }, "word");
  assertEquals(selection.selectedText(), "hello界");
  assertEquals(selection.contains(1, 0), false);
  assertEquals(selection.contains(8, 0), true);
});
