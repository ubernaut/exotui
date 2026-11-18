// Copyright 2023 Im-Beast. MIT license.
import { assertEquals } from "./deps.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";

const labels = [
  { glyph: "ạ́́", width: 1 },
  { glyph: "क्ष", width: 1 },
  { glyph: "क्‍ष", width: 1 },
  { glyph: "각", width: 2 },
  { glyph: "👩‍💻", width: 2 },
  { glyph: "1️⃣", width: 2 },
  { glyph: "❤️", width: 2 },
  { glyph: "🇺🇸", width: 2 },
] as const;

Deno.test("terminal keeps complete graphemes across every UTF-16 string split", () => {
  for (const { glyph, width } of labels) {
    const input = `\x1b[31m${glyph}\x1b[32mX`;
    for (let split = 0; split <= input.length; split++) {
      const screen = new TerminalScreenController({ columns: 10, rows: 2 });
      screen.write(input.slice(0, split));
      screen.write("");
      screen.write(new Uint8Array());
      screen.write(input.slice(split));
      const row = screen.cellRows()[0]!;
      assertEquals(row[0], { char: glyph, foreground: 31 }, `${glyph}/${split}`);
      if (width === 2) assertEquals(row[1]?.continuation, true);
      assertEquals(row[width], { char: "X", foreground: 32 });
      assertEquals(screen.cursor, { column: width + 1, row: 0 });
    }
  }
});

Deno.test("terminal string chunks retain first-scalar styling and normal wide-margin wrapping", () => {
  const screen = new TerminalScreenController({ columns: 4, rows: 2 });
  screen.write("abc\x1b[31m\ud83d");
  screen.write("\ude00\x1b[32mX");
  assertEquals(screen.cellRows()[0]![3], { char: " ", softWrapped: true, wrapPadding: true });
  assertEquals(screen.cellRows()[1]!.slice(0, 3), [
    { char: "😀", foreground: 31 },
    { char: " ", continuation: true },
    { char: "X", foreground: 32 },
  ]);
  assertEquals(screen.cursor, { column: 3, row: 1 });
});

Deno.test("terminal flushes isolated string surrogates and partial byte input explicitly", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 2 });
  screen.write("\x1b[31m\ud83d");
  assertEquals(screen.cursor, { column: 0, row: 0 });
  screen.flushInput();
  screen.flushInput();
  assertEquals(screen.cellRows()[0]![0], { char: "\ud83d", foreground: 31 });
  assertEquals(screen.cursor, { column: 1, row: 0 });
  screen.write("\ude00");
  assertEquals(screen.cellRows()[0]![1], { char: "\ude00", foreground: 31 });
  screen.write(new Uint8Array([0xf0, 0x9f]));
  screen.flushInput();
  assertEquals(screen.cellRows()[0]![2], { char: "\ufffd", foreground: 31 });
  screen.write("X");
  assertEquals(screen.cellRows()[0]![3], { char: "X", foreground: 31 });
});

Deno.test("terminal never joins surrogate code units across controls or a cleared input stream", () => {
  for (const separator of ["X", "\x1b[32m", "\r", "\x1b[1;3H"]) {
    const screen = new TerminalScreenController({ columns: 10, rows: 2 });
    screen.write("\x1b[31m\ud83d");
    screen.write(separator + "\ude00Z");
    assertEquals(screen.cellRows().flat().some((cell) => cell.char === "😀"), false, separator);
    assertEquals(screen.cellRows()[0]![0]?.foreground, 31);
  }
  const screen = new TerminalScreenController({ columns: 10, rows: 2 });
  screen.write("\ud83d");
  screen.clear();
  screen.write("\ude00X");
  assertEquals(screen.cellRows()[0]!.slice(0, 2), [{ char: "\ude00" }, { char: "X" }]);
});

Deno.test("terminal resizing preserves pending UTF-16 and UTF-8 input without splitting a scalar", () => {
  for (const bytes of [false, true]) {
    const screen = new TerminalScreenController({ columns: 4, rows: 2 });
    screen.write("ab");
    screen.write(bytes ? new Uint8Array([0xf0, 0x9f]) : "\ud83d");
    screen.resize(6, 2);
    screen.write(bytes ? new Uint8Array([0x98, 0x80, 0x58]) : "\ude00X");
    assertEquals(screen.cellRows()[0]!.slice(2, 5), [
      { char: "😀" },
      { char: " ", continuation: true },
      { char: "X" },
    ]);
  }
});

Deno.test("terminal keeps complete graphemes and first-scalar styles across every UTF-8 split", () => {
  for (const { glyph, width } of labels) {
    const input = Array.from(glyph).map((scalar, index) => `\x1b[${index ? 32 : 31}m${scalar}`).join("") +
      "\x1b[0mX";
    const bytes = new TextEncoder().encode(input);
    for (let split = 0; split <= bytes.length; split++) {
      const screen = new TerminalScreenController({ columns: 10, rows: 2 });
      screen.write(bytes.slice(0, split));
      screen.write(bytes.slice(split));
      const row = screen.cellRows()[0]!;
      assertEquals(row[0], { char: glyph, foreground: 31 }, `${glyph}/${split}`);
      if (width === 2) assertEquals(row[1], { char: " ", continuation: true }, `${glyph}/${split} follower`);
      assertEquals(row[width], { char: "X" }, `${glyph}/${split} next glyph`);
      assertEquals(screen.cursor, { column: width + 1, row: 0 }, `${glyph}/${split} cursor`);
    }
  }
});

Deno.test("terminal repairs continuation and cursor when an incremental grapheme changes width", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 2 });
  screen.write("ABCD\x1b[H1");
  assertEquals(screen.cellRows()[0]![0], { char: "1" });
  screen.write("\ufe0f");
  screen.write("\u20e3");
  assertEquals(screen.cellRows()[0]!.slice(0, 4), [
    { char: "1️⃣" },
    { char: " ", continuation: true },
    { char: "C" },
    { char: "D" },
  ]);
  assertEquals(screen.cursor, { column: 2, row: 0 });
  screen.write("\x1b[2bX");
  assertEquals(screen.cellRows()[0]!.slice(2, 7), [
    { char: "1️⃣" },
    { char: " ", continuation: true },
    { char: "1️⃣" },
    { char: " ", continuation: true },
    { char: "X" },
  ]);
  assertEquals(screen.cursor, { column: 7, row: 0 });
  screen.resize(9, 2);
  assertEquals(screen.cellRows()[0]![0], { char: "1️⃣" });
  assertEquals(screen.cellRows()[0]![1]?.continuation, true);
});

Deno.test("terminal incrementally widened right-margin glyph wraps as a whole without leaving a tail", () => {
  const screen = new TerminalScreenController({ columns: 4, rows: 2 });
  screen.write("abc1");
  screen.write("\ufe0f\u20e3");
  assertEquals(screen.cellRows()[0]![3], { char: " ", softWrapped: true, wrapPadding: true });
  assertEquals(screen.cellRows()[1]!.slice(0, 2), [{ char: "1️⃣" }, { char: " ", continuation: true }]);
  assertEquals(screen.cursor, { column: 2, row: 1 });
  screen.write("XY");
  assertEquals(screen.scrollbackRows, 0);
  screen.write("Z");
  assertEquals(screen.scrollbackRows, 1);
  assertEquals(screen.scrollbackCellRows()[0]![3]?.wrapPadding, true);
  assertEquals(screen.cellRows()[0]![0], { char: "1️⃣" });
});

Deno.test("terminal cursor moves break emoji joining while SGR retains the current grapheme", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write("👩‍\x1b[1;3H💻");
  const row = screen.cellRows()[0]!;
  assertEquals(row[0], { char: "👩‍" });
  assertEquals(row[2], { char: "💻" });
  assertEquals(row[3]?.continuation, true);
  assertEquals(screen.cursor, { column: 4, row: 0 });
  screen.clear();
  screen.write("👩\x1b[32m‍💻");
  assertEquals(screen.cellRows()[0]![0], { char: "👩‍💻" });
  assertEquals(screen.cursor, { column: 2, row: 0 });
});

Deno.test("terminal explicit cursor addressing separates a zero-prefix cluster from previously painted padding", () => {
  const glyph = "\u094d\u093e";
  const screen = new TerminalScreenController({ columns: 6, rows: 1 });
  screen.write("\x1b[31m \x1b[1;2H\x1b[32m" + glyph + "X");
  assertEquals(screen.cellRows()[0]!.slice(0, 3), [
    { char: " ", foreground: 31 },
    { char: glyph, foreground: 32 },
    { char: "X", foreground: 32 },
  ]);
  screen.clear();
  screen.write("\x1b[31ma\x1b[32m\u0301X");
  assertEquals(screen.cellRows()[0]![0], { char: "a\u0301", foreground: 31 });
});

Deno.test("terminal insertion growth shifts only the newly occupied column and preserves wide pairs", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 2 });
  screen.write("AB界CD\x1b[H\x1b[4h1\ufe0f\u20e3");
  assertEquals(screen.cellRows()[0]!.slice(0, 8), [
    { char: "1️⃣" },
    { char: " ", continuation: true },
    { char: "A" },
    { char: "B" },
    { char: "界" },
    { char: " ", continuation: true },
    { char: "C" },
    { char: "D" },
  ]);
  assertEquals(screen.cursor, { column: 2, row: 0 });
});

Deno.test("terminal right-edge clipping never leaves an unpaired wide grapheme when wrapping is unavailable", () => {
  for (const columns of [1, 4]) {
    const screen = new TerminalScreenController({ columns, rows: 2 });
    screen.write("\x1b[?7l" + "a".repeat(columns - 1) + "1\ufe0f\u20e3");
    assertEquals(screen.cellRows()[0]![columns - 1], { char: " " });
    assertEquals(screen.cursor, { column: columns - 1, row: 0 });
    screen.write("X");
    assertEquals(screen.cellRows()[0]![columns - 1], { char: "X" });
    assertEquals(screen.scrollbackRows, 0);
  }
  const narrow = new TerminalScreenController({ columns: 1, rows: 2 });
  narrow.write("1\ufe0f\u20e3");
  assertEquals(narrow.cellRows()[0]![0], { char: " " });
  assertEquals(narrow.scrollbackRows, 0);
});
