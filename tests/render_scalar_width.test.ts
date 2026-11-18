// Copyright 2026 the exotui authors. MIT license.
import { assertEquals } from "./deps.ts";
import { characterWidth, cropToWidth, stripStyles, textWidth } from "../src/utils/strings.ts";
import { UNICODE_NARROW_WIDTH_PROFILE } from "../src/unicode/width.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { Canvas, MemoryCanvasSink } from "../src/canvas/mod.ts";
import { TextObject } from "../src/canvas/text.ts";

const wideLabels = ["⌚", "☕", "\u{1b132}", "\u{17000}", "\u{31350}"];

Deno.test("display scalar widths agree with the complete pinned narrow profile plus explicit emoji tailoring", () => {
  let compared = 0;
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
    const regional = codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
    const modifier = codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
    const expected = regional ? 2 : modifier ? 0 : UNICODE_NARROW_WIDTH_PROFILE.codePointWidth(codePoint);
    assertEquals(characterWidth(String.fromCodePoint(codePoint)), expected, `U+${codePoint.toString(16)}`);
    compared++;
  }
  assertEquals(compared, 1_112_064);
});

Deno.test("Unicode wide symbols and newer scripts retain their complete two-cell span and crop", () => {
  for (const glyph of wideLabels) {
    assertEquals(UNICODE_NARROW_WIDTH_PROFILE.codePointWidth(glyph.codePointAt(0)!), 2);
    assertEquals(characterWidth(glyph), 2, glyph);
    assertEquals(textWidth(glyph + "X"), 3, glyph);
    assertEquals(cropToWidth(glyph + "X", 0), "", glyph);
    // The established crop contract pads a clipped wide half with one space.
    assertEquals(cropToWidth(glyph + "X", 1), " ", glyph);
    assertEquals(cropToWidth(glyph + "X", 2), glyph, glyph);
    const screen = new TerminalScreenController({ columns: 6, rows: 2 });
    screen.write(`\x1b[31m${glyph}\x1b[32mX`);
    assertEquals(screen.cellRows()[0]!.slice(0, 3), [
      { char: glyph, foreground: 31 },
      { char: " ", continuation: true },
      { char: "X", foreground: 32 },
    ], glyph);
    assertEquals(screen.cursor, { column: 3, row: 0 });
  }
});

Deno.test("neutral ambiguous and unassigned symbols do not inherit a whole block's wide approximation", () => {
  for (const glyph of ["\u{1f000}", "\u{1f100}", "\u2e9a", "\u{1faff}", "\u{3fffd}"]) {
    assertEquals(UNICODE_NARROW_WIDTH_PROFILE.codePointWidth(glyph.codePointAt(0)!), 1);
    assertEquals(characterWidth(glyph), 1, glyph);
    const screen = new TerminalScreenController({ columns: 6, rows: 1 });
    screen.write(glyph + "X");
    assertEquals(screen.cellRows()[0]!.slice(0, 2), [{ char: glyph }, { char: "X" }], glyph);
    assertEquals(screen.cursor, { column: 2, row: 0 });
  }
});

Deno.test("mounted Unicode 17 wide labels retain their empty followers instead of shifting the next object", async () => {
  for (const glyph of wideLabels) {
    const canvas = new Canvas({ sink: new MemoryCanvasSink(), size: { columns: 6, rows: 1 } });
    const object = new TextObject({
      canvas,
      value: glyph + "X",
      style: (value) => value,
      zIndex: 1,
      rectangle: { column: 0, row: 0, width: 6 },
      overwriteRectangle: true,
      multiCodePointSupport: true,
    });
    object.draw();
    try {
      await Promise.resolve();
      await Promise.resolve();
      canvas.render();
      const row = canvas.frameBuffer[0]!.map((value) =>
        stripStyles(typeof value === "string" ? value : new TextDecoder().decode(value))
      );
      assertEquals(row.slice(0, 3), [glyph, "", "X"], glyph);
    } finally {
      object.erase();
    }
  }
});
