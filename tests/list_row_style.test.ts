// Copyright 2023 Im-Beast. MIT license.

import { assert } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { List } from "../src/components/list.ts";
import { Tui } from "../src/tui.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";
import { Signal } from "../src/signals/mod.ts";
import { createAnsiStyle } from "../src/theme.ts";

async function render(canvas: Canvas): Promise<void> {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let flush = 0; flush < 6; flush += 1) await Promise.resolve();
    canvas.render();
  }
}

function cell(canvas: Canvas, row: number, column: number): string {
  const value = canvas.frameBuffer[row]?.[column];
  return typeof value === "string" ? value : "";
}

const RED_BG = "48;2;200;0;0";
const BLUE_BG = "48;2;0;0;200";

Deno.test("List rowStyle paints each row with its own reactive style, and it follows the scroll window", async () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({ sink, size: { columns: 12, rows: 5 } });
  const tui = new Tui({ canvas });
  const base = createAnsiStyle({ foreground: [200, 200, 200], background: [0, 0, 0] });
  const even = createAnsiStyle({ foreground: [255, 255, 255], background: [200, 0, 0] });
  const odd = createAnsiStyle({ foreground: [255, 255, 255], background: [0, 0, 200] });
  const list = new List({
    parent: tui,
    theme: { base },
    rectangle: { column: 0, row: 0, width: 10, height: 4 },
    zIndex: 1,
    items: ["a", "b", "c", "d", "e"],
    selectedIndex: new Signal(0),
    // Colour by item index, not screen row, so the check proves it tracks items.
    rowStyle: (index) => (index % 2 === 0 ? even : odd),
  });
  try {
    await render(canvas);
    // Rows 0,1,2 hold items 0,1,2 → red, blue, red.
    assert(cell(canvas, 0, 0).includes(RED_BG), `row 0 (item 0) should be red, saw "${cell(canvas, 0, 0)}"`);
    assert(cell(canvas, 1, 0).includes(BLUE_BG), "row 1 (item 1) should be blue");
    assert(cell(canvas, 2, 0).includes(RED_BG), "row 2 (item 2) should be red");

    // Wheel the viewport down one row: window is now items 1..4, so the colours
    // shift with the items (row 0 = item 1 = blue) — proving the style is reactive
    // to the scroll window, not fixed to the screen row.
    list.controller.handleScroll(1, 4);
    await render(canvas);
    assert(cell(canvas, 0, 0).includes(BLUE_BG), "after scroll, row 0 (item 1) should be blue");
    assert(cell(canvas, 1, 0).includes(RED_BG), "after scroll, row 1 (item 2) should be red");
  } finally {
    list.destroy();
  }
});
