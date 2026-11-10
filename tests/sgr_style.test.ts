// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals } from "./deps.ts";
import { isSgrReset, mergeSgrStyle } from "../src/utils/sgr_style.ts";
import { createAnsiStyle } from "../src/theme.ts";
import { parseAnsiCell } from "../src/web/cell_canvas_sink.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { TextObject } from "../src/canvas/text.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";
import { stripStyles } from "../src/utils/strings.ts";

Deno.test("SGR canonicalization preserves color zeros and applies resets in source order", () => {
  assertEquals(mergeSgrStyle("\x1b[1;4m", "\x1b[38;2;0;0;255m"), "\x1b[1;4;38;2;0;0;255m");
  assertEquals(mergeSgrStyle("\x1b[4m", "\x1b[1;0;3m"), "\x1b[3m");
  assertEquals(mergeSgrStyle("", "\x1b[0;1;0;4m"), "\x1b[4m");
  assertEquals(mergeSgrStyle("\x1b[1;2;3;4;9;53m", "\x1b[22;23;24;29;55m"), "");
  assert(isSgrReset("\x1b[;00m"));
  for (const sequence of ["\x1b[4:0m", "\x1b[38;2;0;0;0m", "\x1b[1;0m"]) assert(!isSgrReset(sequence));
});

Deno.test("extended SGR colors and underline subparameters remain atomic across canonicalization and browser parsing", () => {
  for (const encoding of ["58;2;0;255;0", "58:2:0:255:0", "58:2::0:255:0", "58:2:0:0:255:0"]) {
    const merged = mergeSgrStyle("\x1b[1m", `\x1b[4:3;${encoding};38:2::0:0:255m`);
    assertEquals(merged, "\x1b[1;4:3;38;2;0;0;255;58;2;0;255;0m");
    const parsed = parseAnsiCell(`${merged}X`);
    assert(parsed.bold && parsed.underline);
    assertEquals(parsed.underlineStyle, "wavy");
    assertEquals(parsed.underlineColor, "rgb(0,255,0)");
    assertEquals(parsed.foreground, "rgb(0,0,255)");
    assertEquals(mergeSgrStyle(merged, "\x1b[4:0;59m"), "\x1b[1;38;2;0;0;255m");
  }
  assertEquals(mergeSgrStyle("", "\x1b[58:5:0;21;53m"), "\x1b[4:2;53;58;5;0m");
  for (const invalid of ["58;2;4;9", "58:2:7:4:9:3", "58:2::4:9", "4:9"]) {
    const merged = mergeSgrStyle("\x1b[1m", `\x1b[${invalid}m`);
    assertEquals(merged, "\x1b[1m");
    const parsed = parseAnsiCell(`\x1b[${invalid}mX`);
    assert(!parsed.italic && !parsed.underline && !parsed.strikethrough && !parsed.underlineColor);
  }
});

Deno.test("ANSI styles encode all five underline styles, independent RGB/indexed/named ink and overline without changing copied labels", () => {
  for (const [index, underlineStyle] of (["solid", "double", "wavy", "dotted", "dashed"] as const).entries()) {
    const value = createAnsiStyle({
      underline: true,
      underlineStyle,
      underlineColor: [0, 255, 0],
      foreground: [0, 0, 255],
      overline: true,
    })("Text");
    assert(value.startsWith(`\x1b[${index === 0 ? "4" : `4:${index + 1}`};53;38;2;0;0;255;58;2;0;255;0m`));
    const parsed = parseAnsiCell(value);
    assert(parsed.underline && parsed.overline);
    assertEquals(parsed.underlineStyle ?? "solid", underlineStyle);
    assertEquals(parsed.underlineColor, "rgb(0,255,0)");
    assertEquals(stripStyles(value), "Text");
  }
  assert(createAnsiStyle({ underlineColor: "brightRed" })("x").includes("58;5;9"));
  assert(createAnsiStyle({ underlineColor: 200 })("x").includes("58;5;200"));
});

Deno.test("extended decoration styles survive actual Canvas TextObject cell storage and plain replacement", async () => {
  const sink = new MemoryCanvasSink(), canvas = new Canvas({ sink, size: { columns: 4, rows: 1 } });
  const object = new TextObject({
    canvas,
    value: "Ab",
    rectangle: { column: 0, row: 0, width: 4 },
    zIndex: 1,
    style: createAnsiStyle({
      bold: true,
      underline: true,
      underlineStyle: "wavy",
      underlineColor: [0, 255, 0],
      foreground: [0, 0, 255],
      overline: true,
    }),
    overwriteRectangle: true,
  });
  try {
    object.draw();
    await Promise.resolve();
    await Promise.resolve();
    canvas.render();
    for (const value of canvas.frameBuffer[0]!.slice(0, 2)) {
      const parsed = parseAnsiCell(typeof value === "string" ? value : new TextDecoder().decode(value));
      assert(parsed.bold && parsed.underline && parsed.overline);
      assertEquals(parsed.underlineStyle, "wavy");
      assertEquals(parsed.underlineColor, "rgb(0,255,0)");
      assertEquals(parsed.foreground, "rgb(0,0,255)");
    }
    assertEquals(stripStyles(canvas.frameBuffer[0]!.join("")), "Ab  ");
    object.style.value = (value) => value;
    canvas.render();
    for (const value of canvas.frameBuffer[0]!) {
      assert(!parseAnsiCell(typeof value === "string" ? value : new TextDecoder().decode(value)).underline);
    }
  } finally {
    object.erase();
  }
});
