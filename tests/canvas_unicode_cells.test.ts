// Copyright 2023 Im-Beast. MIT license.
import { assertEquals } from "./deps.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";
import { TextObject } from "../src/canvas/text.ts";
import { Signal } from "../src/signals/mod.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";

Deno.test("canvas text uses actual wide/combined glyph cells and repaints replacement tails", async () => {
  const canvas = new Canvas({ sink: new MemoryCanvasSink(), size: { columns: 12, rows: 1 } });
  const text = new Signal("界é🌈X");
  const object = new TextObject({
    canvas,
    value: text,
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
    assertEquals(canvas.frameBuffer[0]!.slice(0, 6), ["界", "", "é", "🌈", "", "X"]);
    assertEquals(textWidth(canvas.frameBuffer[0]!.join("")), 12);
    text.value = "Short";
    canvas.render();
    assertEquals(canvas.frameBuffer[0]!.join(""), "Short       ");
    text.value = "界Y";
    canvas.render();
    assertEquals(canvas.frameBuffer[0]!.slice(0, 3), ["界", "", "Y"]);
    assertEquals(textWidth(canvas.frameBuffer[0]!.join("")), 12);
  } finally {
    object.erase();
    text.dispose();
  }
});

Deno.test("canvas clips a final wide glyph as a whole at object and canvas boundaries", async () => {
  for (const [columns, owned] of [[3, 4], [8, 3], [8, 4]] as const) {
    const canvas = new Canvas({ sink: new MemoryCanvasSink(), size: { columns, rows: 1 } });
    const object = new TextObject({
      canvas,
      value: "ab界Z",
      style: (text) => text,
      zIndex: 1,
      rectangle: { column: 0, row: 0, width: owned },
      overwriteRectangle: true,
      multiCodePointSupport: true,
    });
    object.draw();
    await Promise.resolve();
    await Promise.resolve();
    canvas.render();
    const text = stripStyles(canvas.frameBuffer[0]!.slice(0, Math.min(columns, owned)).join(""));
    assertEquals(text, Math.min(columns, owned) === 4 ? "ab界" : "ab ");
    assertEquals(textWidth(text), Math.min(columns, owned));
    object.erase();
  }
});
