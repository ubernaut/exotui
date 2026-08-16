// Copyright 2023 Im-Beast. MIT license.

// VIS-002: labels never split graphemes and deterministic thinning
// preserves endpoints.

import { assert, assertEquals } from "./deps.ts";
import { buildAxis, linearScale } from "../mod.ts";

Deno.test("a roomy x axis keeps all ticks with centered whole labels", () => {
  const axis = buildAxis(linearScale([0, 100], [0, 79]), { orientation: "x", tickCount: 5 });
  assertEquals(axis.ticks.map((tick) => tick.value), [0, 20, 40, 60, 80, 100]);
  assertEquals(axis.thinned, 0);
  for (const tick of axis.ticks) {
    assertEquals(tick.labelCells, tick.label.length); // plain ASCII labels
    assert(tick.labelStart >= 0);
  }
  assertEquals(axis.gridCells, axis.ticks.map((tick) => tick.cell));
});

Deno.test("a cramped axis thins deterministically and keeps both endpoints", () => {
  const scale = linearScale([0, 1_000_000], [0, 24]);
  const first = buildAxis(scale, { orientation: "x", tickCount: 10 });
  const second = buildAxis(scale, { orientation: "x", tickCount: 10 });
  assertEquals(first, second); // deterministic
  assert(first.thinned > 0);
  // Endpoints survive thinning.
  assertEquals(first.ticks[0]!.value, 0);
  assertEquals(first.ticks[first.ticks.length - 1]!.value, 1_000_000);
  // No two kept labels overlap (one-cell gap).
  for (let index = 1; index < first.ticks.length; index += 1) {
    const previous = first.ticks[index - 1]!;
    assert(first.ticks[index]!.labelStart > previous.labelStart + previous.labelCells);
  }
});

Deno.test("locale-aware labels measure in cells, wide glyphs stay whole", () => {
  const german = buildAxis(linearScale([0, 10000], [0, 79]), {
    orientation: "x",
    locale: "de-DE",
    tickCount: 3,
  });
  const label = german.ticks.find((tick) => tick.value === 5000)!.label;
  assertEquals(label, "5.000"); // German grouping

  // CJK labels are two cells per glyph; widths reflect it and labels are
  // placed whole — the layout carries the label string intact.
  const cjk = buildAxis(linearScale([0, 2], [0, 39]), {
    orientation: "x",
    tickCount: 2,
    format: (value) => ["零", "一", "二"][value] ?? String(value),
  });
  for (const tick of cjk.ticks) {
    assertEquals(tick.labelCells, 2);
    assertEquals([...tick.label].length, 1); // never split
  }
});

Deno.test("y axes size their gutter and never stack two labels on one row", () => {
  const axis = buildAxis(linearScale([0, 100], [10, 0]), {
    orientation: "y",
    tickCount: 20, // more ticks than rows — must thin
  });
  const rows = axis.ticks.map((tick) => tick.cell);
  assertEquals(new Set(rows).size, rows.length); // one label per row
  assert(axis.gutterCells >= 3); // "100" needs three cells
  assertEquals(axis.ticks[0]!.value, 0);
  assertEquals(axis.ticks[axis.ticks.length - 1]!.value, 100);
});
