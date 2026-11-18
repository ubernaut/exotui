// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { BrowserCellCanvasSink } from "../src/web/cell_canvas_sink.ts";
import { createAnsiStyle } from "../src/theme.ts";
import { getMultiCodePointCharacters, stripStyles } from "../src/utils/strings.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { TextObject } from "../src/canvas/text.ts";
import { Signal } from "../src/signals/mod.ts";

function host(columns = 5, rows = 2, cellWidth = 10, cellHeight = 20, devicePixelRatio = 1) {
  const rectangles: Array<{ x: number; y: number; width: number; height: number; ink: string }> = [];
  const glyphs: Array<{ text: string; x: number; y: number; font: string }> = [];
  const clips: number[][] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "top",
    fillRect: (x: number, y: number, width: number, height: number) =>
      rectangles.push({ x, y, width, height, ink: context.fillStyle }),
    fillText: (text: string, x: number, y: number) => glyphs.push({ text, x, y, font: context.font }),
    measureText: () => ({ width: 22 }),
    scale: () => {},
    setTransform: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    rect: (...rect: number[]) => clips.push(rect),
    clip: () => {},
  };
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  const sink = new BrowserCellCanvasSink({
    canvas,
    cellWidth,
    cellHeight,
    foreground: "#fff",
    background: "#000",
    devicePixelRatio,
  });
  sink.resize(columns, rows);
  const clear = () => {
    rectangles.length = glyphs.length = clips.length = 0;
  };
  clear();
  return { sink, canvas, context, rectangles, glyphs, clips, clear };
}
const stats = {} as never;
const style = (text: string) =>
  createAnsiStyle({
    foreground: [0, 0, 255],
    background: [20, 30, 40],
    italic: true,
    bold: true,
    underline: true,
    underlineStyle: "wavy",
    underlineColor: [0, 255, 0],
    overline: true,
    strikethrough: true,
  })(text);

Deno.test("styled ASCII bases retain combining accents and keycaps through actual Canvas cells", async () => {
  assertEquals(getMultiCodePointCharacters(style("é1️⃣👩‍💻")).map(stripStyles), ["é", "1️⃣", "👩‍💻"]);
  const { sink, glyphs } = host(12, 2);
  const canvas = new Canvas({ sink, size: { columns: 12, rows: 2 } });
  const object = new TextObject({
    canvas,
    value: style("界é🌈👩‍💻X"),
    style: (text) => text,
    zIndex: 1,
    rectangle: { column: 0, row: 0, width: 12 },
    overwriteRectangle: true,
    multiCodePointSupport: true,
  });
  object.draw();
  try {
    await Promise.resolve();
    await Promise.resolve();
    canvas.render();
    assertEquals(glyphs.map((glyph) => glyph.text), ["界", "é", "🌈", "👩‍💻", "X"]);
    assertEquals(canvas.frameBuffer[0]!.slice(0, 8).map((cell) => stripStyles(String(cell))), [
      "界",
      "",
      "é",
      "🌈",
      "",
      "👩‍💻",
      "",
      "X",
    ]);
  } finally {
    object.erase();
  }
});

Deno.test("browser wide pairs paint their complete glyph/background/decorations regardless of update order", () => {
  for (const [reverse, styledFollower] of [[false, false], [true, false], [false, true], [true, true]]) {
    const { sink, rectangles, glyphs, clips } = host();
    const updates = [{ row: 0, column: 1, value: style("界") }, {
      row: 0,
      column: 2,
      value: styledFollower ? style("") : "",
    }];
    sink.flush(reverse ? updates.reverse() : updates, stats);
    assertEquals(glyphs, [{
      text: "界",
      x: 10,
      y: 0,
      font: "italic 700 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    }]);
    assertEquals(clips, [[10, 0, 20, 20]]);
    assert(
      rectangles.some((rect) =>
        rect.x === 10 && rect.width === 20 && rect.height === 20 && rect.ink === "rgb(20,30,40)"
      ),
    );
    assert(
      !rectangles.some((rect) => rect.x === 20 && rect.height === 20),
      "An empty follower never clears its owner's ink.",
    );
    for (const x of [10, 20]) {
      assert(rectangles.some((rect) => rect.x === x && rect.y === 0 && rect.ink === "rgb(0,0,255)"));
      assert(rectangles.some((rect) => rect.x >= x && rect.x < x + 10 && rect.ink === "rgb(0,255,0)"));
    }
  }
});

Deno.test("browser sparse dirty followers repaint retained owners across flush and separate ranges", () => {
  const { sink, glyphs, rectangles, clear } = host();
  sink.flushRanges(
    [{ row: 0, startColumn: 1, values: [style("界")] }, { row: 0, startColumn: 2, values: [""] }],
    stats,
  );
  assertEquals(glyphs.length, 1);
  clear();
  sink.flush([{ row: 0, column: 2, value: "" }], stats);
  assertEquals(glyphs.map((glyph) => glyph.text), ["界"]);
  assertEquals(rectangles[0]!.width, 20);
  clear();
  sink.flushRanges([{ row: 0, startColumn: 2, values: ["X"] }], stats);
  assertEquals(glyphs.map((glyph) => glyph.text), ["X"]);
  assert(
    rectangles.some((rect) => rect.x === 10 && rect.height === 20),
    "Breaking the pair clears the former owner's whole glyph.",
  );
  clear();
  sink.flush([{ row: 0, column: 2, value: "" }], stats);
  assertEquals(glyphs.map((glyph) => glyph.text), ["界"]);
});

Deno.test("browser owner replacement clears the old follower even when it is outside the dirty range", () => {
  const { sink, glyphs, rectangles, clear } = host();
  sink.flushRanges([{ row: 0, startColumn: 0, values: [style("🌈"), ""] }], stats);
  clear();
  sink.flush([{ row: 0, column: 0, value: "A" }], stats);
  assertEquals(glyphs.map((glyph) => glyph.text), ["A"]);
  assert(rectangles.some((rect) => rect.x === 10 && rect.height === 20 && rect.ink === "#000"));
  clear();
  sink.flush([{ row: 0, column: 1, value: "B" }], stats);
  assertEquals(glyphs.map((glyph) => glyph.text), ["B"], "No stale owner remains after the pair is removed.");
});

Deno.test("browser combines marks/ZWJ glyphs without treating ordinary blank cells as wide followers", () => {
  const { sink, glyphs, clips } = host();
  sink.flushRanges([{ row: 0, startColumn: 0, values: ["é", "👩‍💻", "", "界", " "] }], stats);
  assertEquals(glyphs.map((glyph) => glyph.text), ["é", "👩‍💻"]);
  assertEquals(clips, [[0, 0, 10, 20], [10, 0, 20, 20]]);
});

Deno.test("browser clips narrow glyph ink even when advance metrics claim that the font fits", () => {
  const { sink, context, clips, glyphs } = host();
  context.measureText = () => ({ width: 1 });
  sink.flush([{ row: 1, column: 1, value: "\u00a0\u0333" }], stats);
  assertEquals(clips, [[10, 20, 10, 20]]);
  assertEquals(glyphs.map((glyph) => glyph.text), ["\u00a0\u0333"]);
  // Ownership cannot depend on stale or unavailable font measurement.
  context.measureText = () => {
    throw new Error("font measurement unavailable");
  };
  sink.flush([{ row: 0, column: 2, value: "j" }], stats);
  assertEquals(clips.at(-1), [20, 0, 10, 20]);
});

Deno.test("browser restores owned clipping state when a glyph paint fails", () => {
  const { sink, context, clips } = host();
  let saved = 0, restored = 0;
  Object.assign(context, {
    save: () => saved++,
    restore: () => restored++,
    fillText: () => {
      throw new Error("paint failed");
    },
  });
  assertThrows(() => sink.flush([{ row: 1, column: 1, value: "A" }], stats), Error, "paint failed");
  assertEquals(saved, 1);
  assertEquals(restored, 1);
  assertEquals(clips, [[10, 20, 10, 20]]);
});

Deno.test("browser fractional device planes partition cell edges without shifting logical font anchors", () => {
  for (const ratio of [1, 1.25, 1.5, 1.75, 2]) {
    for (const cellWidth of [9, 10, 11]) {
      const cellHeight = 21;
      const { sink, canvas, rectangles, clips, glyphs, clear } = host(3, 2, cellWidth, cellHeight, ratio);
      const left = Math.round(2 * cellWidth * ratio) / ratio;
      const top = Math.round(cellHeight * ratio) / ratio;
      const width = canvas.width / ratio - left, height = canvas.height / ratio - top;
      sink.flush([{ row: 1, column: 2, value: "j" }], stats);
      assertEquals(rectangles[0], { x: left, y: top, width, height, ink: "#000" });
      assertEquals(clips, [[left, top, width, height]]);
      assertEquals(glyphs.map(({ x, y }) => [x, y]), [[2 * cellWidth, cellHeight]]);
      clear();
      sink.flushRanges([{ row: 1, startColumn: 1, values: ["界", ""] }], stats);
      const wideLeft = Math.round(cellWidth * ratio) / ratio;
      assertEquals(clips, [[wideLeft, top, canvas.width / ratio - wideLeft, height]]);
      assertEquals(glyphs.map(({ x, y }) => [x, y]), [[cellWidth, cellHeight]]);
    }
  }
});

Deno.test("browser resize clears span state and clips wide glyphs atomically at the new right edge", () => {
  const { sink, glyphs, clear } = host();
  sink.flushRanges([{ row: 0, startColumn: 1, values: ["界", ""] }], stats);
  sink.resize(2, 1);
  clear();
  sink.flush([{ row: 0, column: 1, value: "界" }], stats);
  assertEquals(glyphs, []);
  sink.resize(5, 2);
  clear();
  sink.flush([{ row: 0, column: 2, value: "" }], stats);
  assertEquals(glyphs, [], "Growing the surface must not revive a glyph retained before resize.");
});

Deno.test("browser span staging snapshots borrowed bytes and ignores out-of-grid/invalid cell coordinates", () => {
  const { sink, glyphs, clear } = host();
  const bytes = new TextEncoder().encode("界");
  sink.flush([{ row: 0, column: 0, value: bytes }, { row: 0, column: 1, value: "" }], stats);
  bytes.fill(65);
  clear();
  sink.flush([{ row: 0, column: 1, value: "" }, { row: -1, column: 1, value: "X" }, { row: 0, column: 5, value: "X" }, {
    row: 0.5,
    column: 1,
    value: "X",
  }], stats);
  assertEquals(glyphs.map((glyph) => glyph.text), ["界"]);
  const before = sink.inspectSink();
  for (const [columns, rows] of [[Infinity, 1], [1, NaN], [2001, 1000]]) {
    assertThrows(() => sink.resize(columns, rows), RangeError);
  }
  assertEquals(sink.inspectSink(), before, "Refused resize is transactional.");
});

Deno.test("actual Canvas TextObject range flushes preserve wide pairs through replacement, reflow and forced redraw", async () => {
  const { sink, glyphs, clips, clear } = host(12, 2);
  const canvas = new Canvas({ sink, size: { columns: 12, rows: 2 } }), value = new Signal("界é🌈X");
  const object = new TextObject({
    canvas,
    value,
    style,
    zIndex: 1,
    rectangle: { column: 0, row: 0, width: 12 },
    overwriteRectangle: true,
    multiCodePointSupport: true,
  });
  object.draw();
  try {
    await Promise.resolve();
    await Promise.resolve();
    canvas.render();
    assertEquals(glyphs.map((glyph) => glyph.text), ["界", "é", "🌈", "X"]);
    assertEquals(
      clips.map((rect) => rect[2]),
      [20, 10, 20, 10, ...Array<number>(6).fill(10)],
      "Glyph spans and the six decorated blank cells all retain their owned clip.",
    );
    clear();
    value.value = "Short";
    canvas.render();
    assertEquals(glyphs.map((glyph) => glyph.text).join(""), "Short");
    clear();
    value.value = "界Y";
    canvas.render();
    assertEquals(glyphs.map((glyph) => glyph.text), ["界", "Y"]);
    canvas.size.value = { columns: 3, rows: 2 };
    clear();
    canvas.render();
    assertEquals(glyphs.map((glyph) => glyph.text), ["界", "Y"]);
    clear();
    canvas.rerenderAll();
    canvas.render();
    assertEquals(glyphs.map((glyph) => glyph.text), ["界", "Y"]);
  } finally {
    object.erase();
    value.dispose();
  }
});
