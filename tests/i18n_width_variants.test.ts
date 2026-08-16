// Copyright 2023 Im-Beast. MIT license.

// LOC-005: variants chosen by measured cells — monotone across resize (no
// oscillation), emoji measured by cells not code units, and clipping lands
// on span boundaries only.

import { assert, assertEquals } from "./deps.ts";
import { clipToCells, measureCells, selectWidthVariant, type WidthVariant } from "../mod.ts";

const WEEKDAY: readonly WidthVariant[] = [
  { length: "long", text: "Wednesday" },
  { length: "short", text: "Wed" },
  { length: "narrow", text: "W" },
];

Deno.test("selection is monotone across a resize sweep — no oscillation", () => {
  let previousCells = -1;
  for (let columns = 0; columns <= 12; columns += 1) {
    const chosen = selectWidthVariant(WEEKDAY, columns);
    assert(chosen.cells >= previousCells, `width ${columns} narrowed from ${previousCells} to ${chosen.cells}`);
    previousCells = chosen.cells;
    // Determinism: the same budget always agrees with itself.
    assertEquals(selectWidthVariant(WEEKDAY, columns), chosen);
  }
  assertEquals(selectWidthVariant(WEEKDAY, 9).text, "Wednesday");
  assertEquals(selectWidthVariant(WEEKDAY, 8).text, "Wed");
  assertEquals(selectWidthVariant(WEEKDAY, 2).text, "W");
});

Deno.test("emoji variants measure by cells, not string length", () => {
  const family = "\u{1F469}‍\u{1F469}‍\u{1F467}‍\u{1F466}"; // 11 units, 2 cells
  assertEquals(measureCells(family), 2);
  const variants: readonly WidthVariant[] = [
    { length: "long", text: `${family} Family` },
    { length: "narrow", text: family },
  ];
  assertEquals(selectWidthVariant(variants, 9).text, `${family} Family`);
  assertEquals(selectWidthVariant(variants, 3).text, family);
});

Deno.test("when nothing fits, the narrowest variant clips on span boundaries", () => {
  const family = "\u{1F469}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
  const variants: readonly WidthVariant[] = [{ length: "narrow", text: `${family}ab` }];
  const chosen = selectWidthVariant(variants, 3);
  assert(chosen.clipped);
  assertEquals(chosen.text, `${family}a`); // the family stays whole
  assertEquals(chosen.cells, 3);
  // A budget below the first cluster clips to nothing rather than splitting.
  assertEquals(clipToCells(family, 1), "");
  assertEquals(selectWidthVariant(variants, 0).text, "");
});
