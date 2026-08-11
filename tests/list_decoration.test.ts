// Copyright 2023 Im-Beast. MIT license.

import { assert } from "./deps.ts";
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

Deno.test("List clears trailing characters when a shorter row scrolls into place", async () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({ sink, size: { columns: 20, rows: 5 } });
  const tui = new Tui({ canvas });
  const base = createAnsiStyle({ foreground: [200, 200, 200], background: [0, 0, 0] });
  const selectedIndex = new Signal(0);
  const list = new List({
    parent: tui,
    theme: { base },
    rectangle: { column: 0, row: 0, width: 18, height: 3 },
    zIndex: 1,
    items: ["averylongitemname", "b", "c", "d", "e"],
    selectedIndex,
  });
  try {
    await render(canvas);
    // Scroll so the long first row is replaced by a short one.
    selectedIndex.value = 2;
    await render(canvas);
    const row0 = plainRow(canvas, 0, 18);
    assert(row0.includes("b"), "the short item renders");
    assert(!row0.includes("verylong"), `trailing characters of the old long row must be cleared, saw "${row0}"`);
  } finally {
    list.destroy();
  }
});

/** Strips SGR from a run of cells on one canvas row. */
const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
function plainRow(canvas: Canvas, row: number, width: number): string {
  let text = "";
  for (let column = 0; column < width; column += 1) {
    const value = canvas.frameBuffer[row]?.[column];
    text += typeof value === "string" ? value.replace(SGR, "") : " ";
  }
  return text;
}

Deno.test("List highlights the selected row and draws a scaled scrollbar", async () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({ sink, size: { columns: 14, rows: 6 } });
  const tui = new Tui({ canvas });
  const base = createAnsiStyle({ foreground: [200, 200, 200], background: [20, 20, 20] });
  const highlight = createAnsiStyle({ foreground: [0, 0, 0], background: [255, 105, 180] });
  const track = createAnsiStyle({ foreground: [80, 80, 80], background: [40, 40, 40] });
  const thumb = createAnsiStyle({ foreground: [255, 255, 255], background: [180, 180, 255] });
  const selectedIndex = new Signal(0);
  const list = new List({
    parent: tui,
    theme: { base },
    rectangle: { column: 0, row: 0, width: 12, height: 4 },
    zIndex: 1,
    items: ["a", "b", "c", "d", "e", "f", "g", "h"],
    selectedIndex,
    selectedStyle: highlight,
    scrollbar: { track, thumb },
  });
  try {
    await render(canvas);
    const HIGHLIGHT_BG = "48;2;255;105;180";
    const THUMB_BG = "48;2;180;180;255";
    const TRACK_BG = "48;2;40;40;40";

    // The selected row (row 0) is highlighted; a non-selected row is not.
    assert(cell(canvas, 0, 0).includes(HIGHLIGHT_BG), "selected row 0 carries the highlight");
    assert(!cell(canvas, 1, 0).includes(HIGHLIGHT_BG), "row 1 is not highlighted");

    // The scrollbar occupies the last column: 8 items in a height of 4 → a
    // half-height thumb at the top, track below it.
    assert(cell(canvas, 0, 11).includes(THUMB_BG), "the thumb sits at the top for the first item");
    assert(cell(canvas, 3, 11).includes(TRACK_BG), "the track fills below the thumb");

    // Selecting the last item moves the thumb to the bottom.
    selectedIndex.value = 7;
    await render(canvas);
    assert(cell(canvas, 3, 11).includes(THUMB_BG), "the thumb tracks to the bottom for the last item");
    assert(cell(canvas, 0, 11).includes(TRACK_BG), "the track fills above the thumb");
  } finally {
    list.destroy();
  }
});
