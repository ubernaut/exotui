// Copyright 2023 Im-Beast. MIT license.

// TERM-005: DECSCA/DECSED/DECSEL fixtures preserve protected content
// exactly.

import { assert, assertEquals } from "./deps.ts";
import {
  createCellScreen,
  eraseDisplay,
  eraseLine,
  selectiveEraseDisplay,
  selectiveEraseLine,
  writeProtected,
} from "../mod.ts";

function fixture() {
  const screen = createCellScreen(16, 3);
  screen.write(0, 0, "public one");
  writeProtected(screen, 0, 1, "KEEP", { protected: true, bold: true });
  screen.write(5, 1, "erase-me");
  screen.write(0, 2, "public two");
  return screen;
}

Deno.test("DECSEL erases unprotected cells only, in each range mode", () => {
  // Row 1 layout: "KEEP" protected at cols 0-3, "erase-me" at cols 5-12.
  const toEnd = fixture();
  selectiveEraseLine(toEnd, 2, 1, "to-end");
  // Range col 2..15: protected E,P survive; the unprotected tail goes.
  assertEquals(toEnd.lines()[1], "KEEP");

  const all = fixture();
  selectiveEraseLine(all, 0, 1, "all");
  assertEquals(all.lines()[1], "KEEP"); // exactly the protected content
  assert(all.get(0, 1).attributes.bold); // attributes preserved too
  assertEquals(all.lines()[0], "public one"); // other lines untouched

  const toStart = fixture();
  selectiveEraseLine(toStart, 6, 1, "to-start");
  // Range col 0..6: KEEP survives, "er" of erase-me goes, "ase-me" stays.
  assertEquals(toStart.lines()[1], "KEEP   ase-me");
});

Deno.test("DECSED preserves protected content across the display", () => {
  const screen = fixture();
  selectiveEraseDisplay(screen, 0, 0, "all");
  assertEquals(screen.lines(), ["", "KEEP", ""]);
  assert(screen.get(3, 1).attributes.protected);

  const partial = fixture();
  // Erase after the cursor at row 1 col 0: rows 1-2 affected, row 0 kept.
  selectiveEraseDisplay(partial, 0, 1, "to-end");
  assertEquals(partial.lines(), ["public one", "KEEP", ""]);
});

Deno.test("ordinary ED/EL ignore protection — the semantics are independent", () => {
  const line = fixture();
  eraseLine(line, 0, 1, "all");
  assertEquals(line.lines()[1], ""); // KEEP is gone: ordinary erase

  const display = fixture();
  eraseDisplay(display, 0, 0, "all");
  assertEquals(display.lines(), ["", "", ""]); // everything, protected included
});
