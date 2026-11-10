// Copyright 2023 Im-Beast. MIT license.
import { assertEquals } from "./deps.ts";
import { characterWidth, cropToWidth, textWidth } from "../src/utils/strings.ts";
import { UNICODE_NARROW_WIDTH_PROFILE } from "../src/unicode/width.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";
import { TextObject } from "../src/canvas/text.ts";
import { stripStyles } from "../src/utils/strings.ts";

Deno.test("display widths agree with the pinned zero-width profile for every Unicode scalar", () => {
  let zeroWidthScalars = 0;
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
    const scalar = String.fromCodePoint(codePoint);
    const zero = UNICODE_NARROW_WIDTH_PROFILE.codePointWidth(codePoint) === 0;
    // Emoji modifiers remain a documented legacy display tailoring, separate
    // from the Unicode narrow profile. This change does not redefine it.
    const modifier = codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
    assertEquals(characterWidth(scalar) === 0, zero || modifier, `U+${codePoint.toString(16)}`);
    if (zero) zeroWidthScalars++;
  }
  assertEquals(zeroWidthScalars, 2533);
});

Deno.test("standalone nonspacing and format marks neither consume columns nor hide the following crop", () => {
  for (const scalar of ["\u094d", "\u200c", "\u05b0", "\u0651", "\u1161", "\u2060", "\u{1e4ec}"]) {
    const input = scalar + "X";
    assertEquals(characterWidth(scalar), 0);
    assertEquals(textWidth(input), 1);
    assertEquals(textWidth(`\x1b[31m${input}\x1b[0m`), 1);
    assertEquals(cropToWidth(input, 1), input);
    const screen = new TerminalScreenController({ columns: 4, rows: 1 });
    screen.write(input);
    assertEquals(screen.cellRows()[0]!.slice(0, 2), [{ char: "X" }, { char: " " }]);
    assertEquals(screen.cursor, { column: 1, row: 0 });
  }
  // Prepend and spacing marks are not synonymous with zero width. Unassigned
  // control-property holes follow the existing profile's unassigned policy.
  for (const scalar of ["\u0600", "\u09be", "\u302e", "\uff9e", "\u2065"]) {
    assertEquals(characterWidth(scalar) > 0, true, scalar);
  }
});

Deno.test("plain and styled ASCII controls bypass width and crop fast paths without taking a cell", () => {
  for (const control of ["\0", "\t", "\x7f"]) {
    assertEquals(characterWidth(control), 0);
    assertEquals(textWidth(`A${control}B`), 2);
    assertEquals(textWidth(`\x1b[31mA${control}B\x1b[0m`), 2);
    assertEquals(cropToWidth(`A${control}B`, 1), `A${control}`);
  }
});

Deno.test("long valid label graphemes survive incremental terminal UTF-8 and SGR transport", () => {
  const glyph = "a" + "\u0301".repeat(2048);
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });
  screen.write("\x1b[31ma");
  const bytes = new TextEncoder().encode("\u0301".repeat(2048));
  for (let i = 0; i < bytes.length; i += 7) screen.write(bytes.slice(i, i + 7));
  screen.write("\x1b[32mX");
  assertEquals(screen.cellRows()[0]![0], { char: glyph, foreground: 31 });
  assertEquals(screen.cellRows()[0]![1], { char: "X", foreground: 32 });
  assertEquals(screen.cursor, { column: 2, row: 0 });
});

Deno.test("mounted TextObject omits zero-only marks without stealing the next visible cell", async () => {
  for (const mark of ["\u094d", "\u200c", "\u05b0", "\u1161", "\u{1e4ec}"]) {
    const canvas = new Canvas({ sink: new MemoryCanvasSink(), size: { columns: 4, rows: 1 } });
    const object = new TextObject({
      canvas,
      value: `\x1b[31m${mark}X\x1b[0m`,
      style: (text) => text,
      zIndex: 1,
      rectangle: { column: 0, row: 0, width: 4 },
      overwriteRectangle: true,
      multiCodePointSupport: true,
    });
    object.draw();
    try {
      await Promise.resolve();
      await Promise.resolve();
      canvas.render();
      assertEquals(
        canvas.frameBuffer[0]!.map((value) =>
          stripStyles(typeof value === "string" ? value : new TextDecoder().decode(value))
        ),
        ["X", " ", " ", " "],
      );
    } finally {
      object.erase();
    }
  }
});

Deno.test("zero-prefix clusters do not lose a later visible spacing mark or the first scalar's style", () => {
  for (const glyph of ["\u094d\u093e", "\u200c\u09be"]) {
    assertEquals(characterWidth(glyph), 1);
    assertEquals(textWidth(glyph + "X"), 2);
    assertEquals(cropToWidth(glyph + "X", 1), glyph);
    const screen = new TerminalScreenController({ columns: 4, rows: 1 });
    screen.write("\x1b[31m" + glyph[0]!);
    assertEquals(screen.cursor, { column: 0, row: 0 });
    assertEquals(screen.cellRows()[0]![0], { char: " " });
    screen.write("\x1b[32m" + glyph.slice(1) + "X");
    assertEquals(screen.cellRows()[0]!.slice(0, 2), [{ char: glyph, foreground: 31 }, { char: "X", foreground: 32 }]);
    assertEquals(screen.cursor, { column: 2, row: 0 });
  }
});
