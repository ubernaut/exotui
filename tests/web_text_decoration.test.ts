// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals } from "./deps.ts";
import { BrowserCellCanvasSink, parseAnsiCell } from "../src/web/cell_canvas_sink.ts";

Deno.test("browser ANSI typography reads only leading attributes, handles independent resets and never treats color channels as styles", () => {
  const styled = parseAnsiCell("\x1b[3;4;9;38;2;4;9;3mX\x1b[0m");
  assert(styled.italic && styled.underline && styled.strikethrough);
  assertEquals(styled.foreground, "rgb(4,9,3)");
  for (const sequence of ["23;24;29", "0"]) {
    const plain = parseAnsiCell(`\x1b[3;4;9m\x1b[${sequence}mX`);
    assert(!plain.italic && !plain.underline && !plain.strikethrough);
  }
  for (const value of ["\x1b[38;2;4;9;3mX", "X\x1b[3;4;9m"]) {
    const parsed = parseAnsiCell(value);
    assert(!parsed.italic && !parsed.underline && !parsed.strikethrough);
  }
  const independent = parseAnsiCell("\x1b[3;4;9m\x1b[24mX");
  assert(independent.italic && independent.strikethrough && !independent.underline);
});

Deno.test("browser sink paints clipped italic glyphs, bounded underline/strike and styled whitespace, then clears them on repaint", () => {
  const rectangles: number[][] = [], fonts: string[] = [], measured: string[] = [];
  const context = {
    canvas: { width: 0, height: 0 },
    fillStyle: "",
    font: "",
    textBaseline: "top" as CanvasTextBaseline,
    fillRect: (x: number, y: number, width: number, height: number) => rectangles.push([x, y, width, height]),
    fillText: () => fonts.push(context.font),
    measureText: () => {
      measured.push(context.font);
      return { width: context.font.includes("italic") ? 12 : 8 };
    },
    scale: () => {},
    setTransform: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
  };
  const sink = new BrowserCellCanvasSink({
    canvas: { getContext: () => context } as unknown as HTMLCanvasElement,
    cellWidth: 10,
    cellHeight: 20,
    font: "16px monospace",
  });
  sink.resize(3, 2);
  rectangles.length = 0;
  sink.flush([{ row: 0, column: 0, value: "\x1b[3;4;9mA" }], {} as never);
  assertEquals(fonts, ["italic 16px monospace"]);
  assertEquals(rectangles, [[0, 0, 10, 20], [0, 9, 10, 1], [0, 19, 10, 1]]);
  rectangles.length = 0;
  sink.flush([{ row: 0, column: 0, value: "A" }], {} as never);
  assertEquals(fonts.at(-1), "16px monospace");
  assertEquals(rectangles, [[0, 0, 10, 20]]);
  sink.flush([{ row: 0, column: 0, value: "\x1b[3mA" }], {} as never);
  assertEquals(
    measured,
    [],
    "Owned ink clipping must not depend on cached character advance metrics.",
  );
  assertEquals(fonts.at(-1), "italic 16px monospace", "Clipping must still preserve the current font attributes.");
  rectangles.length = 0;
  sink.flush([{ row: 1, column: 2, value: "\x1b[4;9m " }], {} as never);
  assertEquals(rectangles, [[20, 20, 10, 20], [20, 29, 10, 1], [20, 39, 10, 1]]);
});
