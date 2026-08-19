// Copyright 2023 Im-Beast. MIT license.

// A widget that is invisible on its first frame builds its children later, in
// draw(). One signal change usually makes a panel both visible AND sized, and
// the visibility subscriber used to run while the sibling rectangle Computed of
// that same change was still stale — so the widget drew itself into a zero-width
// box and stayed blank for the rest of the session.
//
// Found by building an application against the published package: exomonitor
// hides panels a small terminal has no room for, and every gauge it later
// revealed was invisible.

import { assert, assertEquals } from "./deps.ts";
import { crayon } from "crayon";
import { Chart, Computed, Gauge, Signal, Sparkline, Text } from "../mod.ts";
import { canvasRowText, createTestTerminalApp } from "../mod.testing.ts";

/** Reveals a widget and returns the row it should have drawn on. */
async function revealAndRead(
  build: (options: {
    parent: never;
    zIndex: number;
    visible: Computed<boolean>;
    rectangle: Computed<{ column: number; row: number; width: number; height: number }>;
  }) => unknown,
): Promise<string> {
  const harness = await createTestTerminalApp({ size: { columns: 40, rows: 6 } });
  const slot = new Signal<{ width: number } | undefined>(undefined);
  build({
    parent: harness.app.tui as never,
    zIndex: 2,
    visible: new Computed(() => slot.value !== undefined),
    // Width arrives with visibility, exactly as a real layout delivers it.
    rectangle: new Computed(() => ({ column: 0, row: 1, width: slot.value?.width ?? 0, height: 3 })),
  });
  await harness.pilot.settle();
  slot.value = { width: 30 };
  await harness.pilot.settle();
  const row = canvasRowText(harness.canvas, 1, 34);
  harness.destroy();
  return row;
}

Deno.test("a Gauge revealed after its first frame actually draws", async () => {
  const row = await revealAndRead((options) =>
    new Gauge({ ...options, theme: { base: crayon.white }, value: 0.5, min: 0, max: 1 } as never)
  );
  assert(row.trim().length > 0, `the gauge drew nothing: ${JSON.stringify(row)}`);
});

Deno.test("a Sparkline revealed after its first frame actually draws", async () => {
  const row = await revealAndRead((options) =>
    new Sparkline({ ...options, theme: { base: crayon.white }, values: [1, 4, 2, 8, 3] } as never)
  );
  assert(row.trim().length > 0, `the sparkline drew nothing: ${JSON.stringify(row)}`);
});

Deno.test("a Chart revealed after its first frame actually draws", async () => {
  const row = await revealAndRead((options) =>
    new Chart({ ...options, theme: { base: crayon.white }, values: [1, 4, 2, 8, 3] } as never)
  );
  assert(row.trim().length > 0, `the chart drew nothing: ${JSON.stringify(row)}`);
});

Deno.test("a Text revealed after its first frame actually draws", async () => {
  // Text never had the bug; it is here so a regression in the common path is
  // caught beside the widgets that did.
  const row = await revealAndRead((options) =>
    new Text({ ...options, theme: { base: crayon.white }, text: "shown", overwriteWidth: true } as never)
  );
  assertEquals(row.trim(), "shown");
});

// ProgressBar is deliberately absent: it paints with background colour rather
// than glyphs, so a plain-text readback of the frame cannot see it either way.
// Covering it needs a styled-cell assertion, which belongs with its own tests.
