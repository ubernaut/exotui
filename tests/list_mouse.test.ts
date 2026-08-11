// Copyright 2023 Im-Beast. MIT license.

import { assertEquals } from "./deps.ts";
import { List, ListController } from "../src/components/list.ts";
import { Tui } from "../src/tui.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";
import { Signal } from "../src/signals/mod.ts";
import { createTestMousePress, createTestMouseScroll } from "../src/testing/input.ts";

Deno.test("ListController resolves the item under a visible row and scrolls by notch", () => {
  const controller = new ListController({ items: ["a", "b", "c", "d", "e"], selectedIndex: 0 });
  // Window starts at 0 for a top selection, so a row offset maps straight through.
  assertEquals(controller.indexAtRow(0, 4), 0);
  assertEquals(controller.indexAtRow(2, 4), 2);
  // Offsets past the end clamp to the last item rather than overflowing.
  assertEquals(controller.indexAtRow(99, 4), 4);

  controller.setSelectedIndex(0);
  controller.handleScroll(1);
  assertEquals(controller.selectedIndex.peek(), 1);
  controller.handleScroll(-1);
  assertEquals(controller.selectedIndex.peek(), 0);
  // A zero notch is a no-op.
  controller.handleScroll(0);
  assertEquals(controller.selectedIndex.peek(), 0);
  controller.dispose();
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

    // The wheel moves the selection one row per notch.
    list.emit("mouseScroll", createTestMouseScroll(1, { x: 5, y: 2 }));
    assertEquals(selectedIndex.peek(), 1);

    // A modified click is ignored (reserved for range/multi-select semantics).
    list.emit("mousePress", createTestMousePress({ x: 5, y: 3, ctrl: true }));
    assertEquals(selectedIndex.peek(), 1);
  } finally {
    list.destroy();
  }
});
