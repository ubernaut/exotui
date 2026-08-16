// Copyright 2023 Im-Beast. MIT license.

// Regression guard for two compounding teardown bugs (Aug 16 2026): a
// DrawObject registered twice by visibility-driven draw() re-runs became
// immortal (erase removed one entry), and Component.destroy() iterating
// children while they spliced themselves out skipped every other child.
// Together they accumulated stale selection bars in composited Lists.
import { assert } from "./deps.ts";
import { Canvas, MemoryCanvasSink, Tui } from "../mod.ts";
import { List } from "../src/components/list.ts";
import { createAnsiStyle } from "../src/theme.ts";
import { Signal } from "../src/signals/mod.ts";
import { stripAnsi } from "../mod.testing.ts";

const ITEMS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"];

function makeList(tui: Tui, accent: [number, number, number]): List {
  return new List({
    parent: tui,
    zIndex: 1,
    rectangle: { column: 0, row: 0, width: 16, height: 4 },
    theme: { base: createAnsiStyle({ foreground: [220, 220, 220], background: [20, 20, 40] }) },
    items: [...ITEMS],
    selectedIndex: new Signal(2),
    selectedStyle: createAnsiStyle({ foreground: [0, 0, 0], background: accent, bold: true }),
    scrollbar: {
      track: createAnsiStyle({ background: [40, 40, 60] }),
      thumb: createAnsiStyle({ background: [90, 90, 120] }),
    },
  });
}

Deno.test("scrolled List destroy leaves no painting orphans or duplicate registrations", async () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({ sink, size: { columns: 16, rows: 4 } });
  const tui = new Tui({ canvas });
  const settle = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    canvas.rerenderAll();
    canvas.render();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    canvas.rerenderAll();
    canvas.render();
  };
  const rows = (): string[] => {
    const out: string[] = [];
    for (let r = 0; r < 4; r += 1) {
      let text = "";
      for (let c = 0; c < 16; c += 1) {
        const cell = canvas.frameBuffer[r]?.[c] ?? " ";
        text += stripAnsi(typeof cell === "string" ? cell : new TextDecoder().decode(cell));
      }
      out.push(text);
    }
    return out;
  };

  const first = makeList(tui, [255, 0, 128]);
  await settle();
  // Scroll the viewport down two rows (selection scrolls with its item).
  first.controller.handleScroll(1, 4);
  first.controller.handleScroll(1, 4);
  await settle();

  first.destroy();
  const second = makeList(tui, [0, 200, 180]);
  await settle();
  const markers = rows().filter((row) => row.includes(">")).length;
  assert(markers === 1, `leaked selection bars: ${markers}`);
  assert(canvas.drawnObjects.length === 7, `leaked draw objects: ${canvas.drawnObjects.length}`);
});
