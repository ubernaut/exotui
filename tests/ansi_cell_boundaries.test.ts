// Copyright 2026 the exotui authors. MIT license.

import { assertEquals } from "./deps.ts";
import { AnsiCanvasSink, Canvas, type CanvasRenderStats } from "../src/canvas/mod.ts";
import { BoxObject } from "../src/canvas/box.ts";
import { TextObject } from "../src/canvas/text.ts";
import { stripStyles } from "../src/utils/strings.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";

const encoder = new TextEncoder();
const cases = [
  { cells: [" ", "\u094d\u093e", "X"], glyphs: [[0, " "], [1, "\u094d\u093e"], [2, "X"]] },
  { cells: ["\u0600", "X"], glyphs: [[0, "\u0600"], [1, "X"]] },
  { cells: ["👩‍", "", "💻", "", "X"], glyphs: [[0, "👩‍"], [2, "💻"], [4, "X"]] },
  { cells: ["🇺", "", "🇸", "", "X"], glyphs: [[0, "🇺"], [2, "🇸"], [4, "X"]] },
  { cells: ["ᄀ", "", "ᄀ", "", "X"], glyphs: [[0, "ᄀ"], [2, "ᄀ"], [4, "X"]] },
  { cells: ["界", "", "X"], glyphs: [[0, "界"], [2, "X"]] },
] as const;

Deno.test("ANSI range compaction never leaks combined SGR attributes into subsequent independent cells", () => {
  const cursor = "\x1b[1;1H";
  for (const attribute of ["1", "2", "3", "4", "4:3", "7", "9", "53", "58;2;0;255;0"]) {
    for (
      const prefix of [
        `\x1b[${attribute};38;2;1;2;3;48;2;4;5;6m`,
        `\x1b[38;2;1;2;3;${attribute};48;2;4;5;6m`,
        `\x1b[${attribute}m\x1b[38:2::1:2:3;48:5:10m`,
      ]
    ) {
      for (const next of ["\x1b[38;2;7;8;9;48;2;10;11;12m", "\x1b[38:2::7:8:9;48:5:11m", ""]) {
        const values = [`${prefix}A\x1b[0m`, `${next}B\x1b[0m`];
        const expected = new TerminalScreenController({ columns: 6, rows: 1 });
        expected.write(cursor + values.join(""));
        const actual = new TerminalScreenController({ columns: 6, rows: 1 });
        const sink = new AnsiCanvasSink({
          stdout: {
            writeSync(data) {
              actual.write(data);
              return data.length;
            },
          },
        });
        sink.flushRanges([{ row: 0, startColumn: 0, values }], {} as CanvasRenderStats);
        assertEquals(actual.cellRows(), expected.cellRows(), JSON.stringify({ attribute, prefix, next }));
      }
    }
  }
});

for (const mode of ["updates", "ranges"] as const) {
  Deno.test(`ANSI ${mode} preserve explicit Unicode cell boundaries through real byte writes`, () => {
    for (const { cells, glyphs } of cases) {
      for (const styled of [false, true]) {
        for (const bytes of [false, true]) {
          const chunks: Uint8Array[] = [];
          const sink = new AnsiCanvasSink({
            stdout: {
              writeSync(data) {
                chunks.push(data.slice());
                return data.length;
              },
            },
          });
          const values = cells.map((cell) => {
            const value = styled && cell ? `\x1b[31m${cell}\x1b[0m` : cell;
            return bytes ? encoder.encode(value) : value;
          });
          if (mode === "updates") {
            sink.flush(values.map((value, index) => ({ row: 1, column: 2 + index, value })));
          } else {
            sink.flushRanges(
              [{ row: 1, startColumn: 2, values }],
              {} as CanvasRenderStats,
            );
          }
          const screen = new TerminalScreenController({ columns: 16, rows: 3 });
          for (const chunk of chunks) {
            for (let index = 0; index < chunk.length; index += 3) screen.write(chunk.slice(index, index + 3));
          }
          screen.flushInput();
          const row = screen.cellRows()[1]!;
          for (const [offset, glyph] of glyphs) {
            assertEquals(row[2 + offset]?.char, glyph, JSON.stringify({ mode, cells, styled, bytes, offset }));
            if (styled) assertEquals(row[2 + offset]?.foreground, 31);
          }
          assertEquals(screen.cursor, { column: 2 + cells.length, row: 1 });
        }
      }
    }
  });
}

Deno.test("mounted independent TextObjects retain zero-prefix and wide cell boundaries over ANSI", async () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  const sink = new AnsiCanvasSink({
    stdout: {
      writeSync(data) {
        screen.write(data);
        return data.length;
      },
    },
  });
  const canvas = new Canvas({ sink, size: { columns: 12, rows: 2 } });
  const ground = new BoxObject({
    canvas,
    rectangle: { column: 0, row: 0, width: 12, height: 2 },
    filler: " ",
    style: (text) => text,
    zIndex: 0,
  });
  const glyphs = ["\u094d\u093e", "👩‍", "💻"];
  const columns = [1, 3, 5];
  const objects = glyphs.map((glyph, index) =>
    new TextObject({
      canvas,
      value: `\x1b[31m${glyph}\x1b[0m`,
      style: (text) => text,
      zIndex: 1,
      rectangle: { column: columns[index]!, row: 0, width: index ? 2 : 1 },
      overwriteRectangle: true,
      multiCodePointSupport: true,
    })
  );
  ground.draw();
  for (const object of objects) object.draw();
  try {
    await Promise.resolve();
    await Promise.resolve();
    canvas.render();
    screen.flushInput();
    const row = screen.cellRows()[0]!;
    for (const [index, glyph] of glyphs.entries()) {
      const column = columns[index]!;
      const value = canvas.frameBuffer[0]![column]!;
      assertEquals(stripStyles(typeof value === "string" ? value : new TextDecoder().decode(value)), glyph);
      assertEquals(row[column]?.char, glyph);
      assertEquals(row[column]?.foreground, 31);
    }
    assertEquals(row[0]?.char, " ");
    assertEquals(row[4]?.continuation, true);
    assertEquals(row[6]?.continuation, true);
  } finally {
    for (const object of objects) object.erase();
    ground.erase();
  }
});
