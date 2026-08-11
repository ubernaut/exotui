// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { Cycler, CyclerController, renderCycler } from "../src/components/cycler.ts";
import { Tui } from "../src/tui.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";
import { Signal } from "../src/signals/mod.ts";
import { createTestKeyPress, createTestMousePress, createTestMouseScroll } from "../src/testing/input.ts";

Deno.test("renderCycler centers the value between chevrons and clips to width", () => {
  const wide = renderCycler("85%", 12);
  assertEquals(wide.length, 12);
  assert(wide.startsWith("<") && wide.endsWith(">"));
  assert(wide.includes("85%"));
  // Long values are ellipsized to fit.
  const clipped = renderCycler("verylongvalue", 8);
  assertEquals(clipped.length, 8);
  assert(clipped.includes("…"));
  // Degenerate widths degrade rather than throw.
  assertEquals(renderCycler("x", 2), "<>");
  assertEquals(renderCycler("x", 1), "<");
  assertEquals(renderCycler("x", 0), "");
});

Deno.test("CyclerController moves, wraps, clamps, and reports changes", () => {
  const changes: Array<{ value: string; index: number }> = [];
  const controller = new CyclerController({
    options: ["a", "b", "c"],
    activeIndex: 0,
    onChange: (value, index) => {
      changes.push({ value, index });
    },
  });
  controller.move(1);
  assertEquals(controller.active(), "b");
  controller.move(1);
  controller.move(1);
  assertEquals(controller.active(), "a"); // wraps past the end
  controller.move(-1);
  assertEquals(controller.active(), "c"); // wraps past the start
  assertEquals(changes.at(-1), { value: "c", index: 2 });

  controller.handleScroll(1);
  assertEquals(controller.active(), "a");
  controller.handlePointer(12, 1); // left half steps back
  assertEquals(controller.active(), "c");
  controller.handlePointer(12, 10); // right half steps forward
  assertEquals(controller.active(), "a");
  controller.dispose();

  const clamped = new CyclerController({ options: ["x", "y"], activeIndex: 0, wrap: false });
  clamped.move(-1);
  assertEquals(clamped.active(), "x"); // clamps at the start
  clamped.dispose();
});

Deno.test("Cycler component steps on click half, wheel, and arrows", () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({ sink, size: { columns: 24, rows: 3 } });
  const tui = new Tui({ canvas });
  const activeIndex = new Signal(1);
  const applied: string[] = [];
  const cycler = new Cycler({
    parent: tui,
    theme: {},
    rectangle: { column: 2, row: 1, width: 12, height: 1 },
    zIndex: 1,
    options: ["low", "mid", "high"],
    activeIndex,
    onChange: (value) => {
      applied.push(value);
    },
  });
  try {
    // Right half of the control steps forward.
    cycler.emit("mousePress", createTestMousePress({ x: 2 + 10, y: 1, button: 0 }));
    assertEquals(activeIndex.peek(), 2);
    assertEquals(applied.at(-1), "high");

    // Left half steps back.
    cycler.emit("mousePress", createTestMousePress({ x: 2 + 1, y: 1, button: 0 }));
    assertEquals(activeIndex.peek(), 1);

    // Wheel and arrows step too.
    cycler.emit("mouseScroll", createTestMouseScroll(1, { x: 2 + 5, y: 1 }));
    assertEquals(activeIndex.peek(), 2);
    cycler.emit("keyPress", createTestKeyPress("left"));
    assertEquals(activeIndex.peek(), 1);

    // A drag does not step.
    cycler.emit("mousePress", createTestMousePress({ x: 2 + 10, y: 1, drag: true }));
    assertEquals(activeIndex.peek(), 1);
  } finally {
    cycler.destroy();
  }
});
