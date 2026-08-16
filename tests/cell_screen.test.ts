// Copyright 2023 Im-Beast. MIT license.

// TERM-006: overlapping copy and clipped rectangle cases match DEC
// operation fixtures.

import { assert, assertEquals } from "./deps.ts";
import { createCellScreen } from "../mod.ts";

function screenWith(lines: string[]): ReturnType<typeof createCellScreen> {
  const screen = createCellScreen(12, lines.length);
  lines.forEach((line, row) => screen.write(0, row, line));
  return screen;
}

Deno.test("overlapping DECCRA copies are buffered, never smeared", () => {
  const screen = screenWith(["ABCDEF", "GHIJKL", "MNOPQR"]);
  // Copy the left 2x3 block one column right — overlapping target.
  screen.copyRect({ top: 0, left: 0, bottom: 3, right: 4 }, 0, 1);
  assertEquals(screen.lines(), ["AABCDF", "GGHIJL", "MMNOPR"]);

  // Downward overlapping copy is equally overlap-safe.
  const vertical = screenWith(["1111", "2222", "3333", "    "]);
  vertical.copyRect({ top: 0, left: 0, bottom: 3, right: 4 }, 1, 0);
  assertEquals(vertical.lines(), ["1111", "1111", "2222", "3333"]);
});

Deno.test("clipped rectangles touch only their in-bounds cells", () => {
  const screen = screenWith(["ABCDEF", "GHIJKL"]);
  // A fill whose rect extends past every edge clips to the screen.
  screen.fillRect({ top: -5, left: 4, bottom: 99, right: 99 }, "#");
  assertEquals(screen.lines(), ["ABCD########", "GHIJ########"]);
  // A copy clipped at the source edge moves only what exists.
  screen.copyRect({ top: 0, left: 10, bottom: 1, right: 20 }, 1, 0);
  assertEquals(screen.lines()[1], "##IJ########");
});

Deno.test("DECERA erases and DECCARA/DECRARA change attributes only", () => {
  const screen = screenWith(["SECRET", "PUBLIC"]);
  screen.eraseRect({ top: 0, left: 0, bottom: 1, right: 6 });
  assertEquals(screen.lines(), ["", "PUBLIC"]);

  screen.changeAttributesInRect({ top: 1, left: 0, bottom: 2, right: 3 }, { bold: true });
  assertEquals(screen.lines()[1], "PUBLIC"); // characters untouched
  assert(screen.get(0, 1).attributes.bold);
  assert(!screen.get(3, 1).attributes.bold); // outside the rect

  screen.reverseAttributesInRect({ top: 1, left: 0, bottom: 2, right: 6 }, ["bold", "reverse"]);
  assert(!screen.get(0, 1).attributes.bold); // toggled off
  assert(screen.get(3, 1).attributes.bold); // toggled on
  assert(screen.get(0, 1).attributes.reverse);
  // Toggling twice restores exactly.
  screen.reverseAttributesInRect({ top: 1, left: 0, bottom: 2, right: 6 }, ["reverse"]);
  assert(!screen.get(0, 1).attributes.reverse);
});
