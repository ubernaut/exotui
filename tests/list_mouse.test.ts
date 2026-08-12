// Copyright 2023 Im-Beast. MIT license.

import { assertEquals } from "./deps.ts";
import { List, ListController, visibleListRows } from "../src/components/list.ts";
import { Tui } from "../src/tui.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";
import { Signal } from "../src/signals/mod.ts";
import { createTestMousePress, createTestMouseScroll } from "../src/testing/input.ts";

Deno.test("ListController scrolls the viewport by notch without changing the selection", () => {
  const controller = new ListController({ items: ["a", "b", "c", "d", "e"], selectedIndex: 0 });
  // Window starts at 0 for a top selection, so a row offset maps straight through.
  assertEquals(controller.indexAtRow(0, 4), 0);
  assertEquals(controller.indexAtRow(2, 4), 2);
  // Offsets past the end clamp to the last item rather than overflowing.
  assertEquals(controller.indexAtRow(99, 4), 4);

  // The wheel scrolls the viewport; the selection stays where it was.
  controller.handleScroll(1, 4);
  assertEquals(controller.selectedIndex.peek(), 0);
  assertEquals(controller.windowStart(4), 1);
  assertEquals(controller.indexAtRow(0, 4), 1); // the top row now shows item 1
  // It never scrolls past the end (5 items in a height of 4 → top clamps at 1).
  controller.handleScroll(1, 4);
  assertEquals(controller.windowStart(4), 1);
  controller.handleScroll(-1, 4);
  assertEquals(controller.windowStart(4), 0);
  assertEquals(controller.selectedIndex.peek(), 0);
  // A zero notch is a no-op.
  controller.handleScroll(0, 4);
  assertEquals(controller.windowStart(4), 0);

  // Arrowing the selection re-anchors the viewport so the selection is visible.
  controller.handleScroll(1, 4);
  assertEquals(controller.windowStart(4), 1);
  controller.handleKeyPress({ key: "up" }, 4); // selection 0 is above the viewport
  assertEquals(controller.windowStart(4), 0);
  controller.dispose();
});

Deno.test("The wheel scrolls the list under the pointer even when it is not focused", () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({ sink, size: { columns: 24, rows: 6 } });
  const tui = new Tui({ canvas });
  const list = new List({
    parent: tui,
    theme: {},
    rectangle: { column: 2, row: 1, width: 16, height: 4 },
    zIndex: 1,
    items: ["a", "b", "c", "d", "e", "f"],
    selectedIndex: 0,
  });
  try {
    // The list is never focused (state stays "base"); a notch with the pointer
    // over it still scrolls its viewport, and the selection stays put.
    tui.emit("mouseScroll", createTestMouseScroll(1, { x: 6, y: 2 }));
    assertEquals(list.controller.selectedIndex.peek(), 0);
    assertEquals(list.controller.windowStart(4), 1);
    // A notch with the pointer outside the list does nothing — it is neither
    // under the pointer nor focused.
    tui.emit("mouseScroll", createTestMouseScroll(1, { x: 21, y: 5 }));
    assertEquals(list.controller.windowStart(4), 1);
  } finally {
    list.destroy();
  }
});

Deno.test("visibleListRows marks a secondary state with a custom marker", () => {
  const rows = visibleListRows(
    ["a", "b", "c"],
    0,
    3,
    undefined,
    (index, selected) => selected ? ">" : index === 2 ? "·" : " ",
  );
  assertEquals(rows[0], "> a"); // selected
  assertEquals(rows[1], "  b"); // neither
  assertEquals(rows[2], "· c"); // current
});

Deno.test("List selects and activates the clicked row and moves on wheel", () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({ sink, size: { columns: 20, rows: 6 } });
  const tui = new Tui({ canvas });
  const selectedIndex = new Signal(0);
  const activations: Array<{ item: string; index: number }> = [];
  const list = new List({
    parent: tui,
    theme: {},
    rectangle: { column: 2, row: 1, width: 16, height: 4 },
    zIndex: 1,
    items: ["alpha", "bravo", "charlie", "delta", "echo"],
    selectedIndex,
    onSelect: (item, index) => {
      activations.push({ item, index });
    },
  });
  try {
    // Click the third visible row (offset 2 → index 2): selects and activates it.
    list.emit("mousePress", createTestMousePress({ x: 5, y: 3, button: 0 }));
    assertEquals(selectedIndex.peek(), 2);
    assertEquals(activations.at(-1), { item: "charlie", index: 2 });

    // A drag selects without activating (no new onSelect).
    const before = activations.length;
    list.emit("mousePress", createTestMousePress({ x: 5, y: 1, drag: true }));
    assertEquals(selectedIndex.peek(), 0);
    assertEquals(activations.length, before);

    // The wheel scrolls the viewport a row per notch without moving the selection.
    list.emit("mouseScroll", createTestMouseScroll(1, { x: 5, y: 2 }));
    assertEquals(selectedIndex.peek(), 0);
    assertEquals(list.controller.windowStart(4), 1);

    // A modified click is ignored (reserved for range/multi-select semantics).
    list.emit("mousePress", createTestMousePress({ x: 5, y: 3, ctrl: true }));
    assertEquals(selectedIndex.peek(), 0);
  } finally {
    list.destroy();
  }
});
