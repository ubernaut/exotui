// Copyright 2023 Im-Beast. MIT license.

// A component created after the first frame does not track later changes to its
// rectangle. Found while building a visualisation view that allocates its
// components before it knows what they will hold — the natural way to write one,
// and the way that silently draws nothing.
//
// The working shape is pinned so a fix cannot regress it; the broken shape is
// marked so the day it starts passing is visible.

import { assertEquals } from "./deps.ts";
import { crayon } from "crayon";
import { Computed, Signal, Text, type TextRectangle } from "../mod.ts";
import { canvasRowText, createTestTerminalApp } from "../mod.testing.ts";

interface Case {
  readonly initial: string;
  readonly eventual: string;
  /** Fixed geometry, or geometry derived from the text and therefore changing. */
  readonly width: "fixed" | "from-text";
}

async function draw({ initial, eventual, width }: Case): Promise<string> {
  const harness = await createTestTerminalApp({ size: { columns: 20, rows: 3 } });
  await harness.pilot.settle();
  const text = new Signal(initial);
  new Text({
    parent: harness.app.tui,
    zIndex: 2,
    theme: { base: crayon.white },
    text,
    overwriteWidth: true,
    rectangle: new Computed<TextRectangle>(() => ({
      column: 0,
      row: 1,
      width: width === "fixed" ? 10 : text.value.length,
    })),
  });
  text.value = eventual;
  await harness.pilot.settle();
  const row = canvasRowText(harness.canvas, 1, 12).trimEnd();
  harness.destroy();
  return row;
}

Deno.test("a component created later still repaints when only its text changes", async () => {
  // This is the shape src/viz/view.ts uses: geometry fixed at construction,
  // content free to change.
  assertEquals(await draw({ initial: " ", eventual: "BBBB", width: "fixed" }), "BBBB");
});

Deno.test("KNOWN DEFECT: a component created later ignores rectangle changes", async () => {
  // Same component, same signals — only the geometry moves, and nothing is
  // drawn. Remove the fixed-geometry workaround in src/viz/view.ts when this
  // starts failing.
  assertEquals(
    await draw({ initial: "", eventual: "CCCC", width: "from-text" }),
    "",
    "rectangle tracking after the first frame appears fixed — update src/viz/view.ts and this test",
  );
});
