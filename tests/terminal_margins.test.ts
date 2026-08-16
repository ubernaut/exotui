// Copyright 2023 Im-Beast. MIT license.

// TERM-007: cursor addressing, insert/delete, wrap, and scrolling
// respect both margins.

import { assert, assertEquals } from "./deps.ts";
import { createCellScreen, createMarginScreen } from "../mod.ts";

function boxed() {
  const screen = createCellScreen(10, 6);
  for (let row = 0; row < 6; row += 1) screen.write(0, row, `${row}${"·".repeat(8)}${row}`);
  const margins = createMarginScreen(screen);
  margins.setVerticalMargins(1, 4);
  margins.setHorizontalMargins(2, 7);
  return { screen, margins };
}

Deno.test("scrolling moves only the margin box; borders never move", () => {
  const { screen, margins } = boxed();
  margins.scrollUp(1);
  const lines = screen.lines();
  // Rows 0 and 5 (outside) and columns 0-1/8-9 (outside) are untouched.
  assertEquals(lines[0], "0········0");
  assertEquals(lines[5], "5········5");
  for (let row = 1; row <= 4; row += 1) {
    assert(lines[row]!.startsWith(`${row}·`), `left border of row ${row} moved`);
    assert(lines[row]!.endsWith(`·${row}`), `right border of row ${row} moved`);
  }
  // Inside the box, content shifted up and the bottom box row blanked.
  assertEquals(lines[4], "4·      ·4");
});

Deno.test("origin mode addresses relative to the margins and clamps", () => {
  const { margins } = boxed();
  margins.setOriginMode(true);
  margins.setCursor(0, 0);
  assertEquals(margins.cursor(), { row: 1, column: 2 }); // margin corner
  margins.setCursor(99, 99);
  assertEquals(margins.cursor(), { row: 4, column: 7 }); // clamped inside

  margins.setOriginMode(false);
  margins.setCursor(0, 0);
  assertEquals(margins.cursor(), { row: 0, column: 0 }); // absolute again
});

Deno.test("printing wraps at the right margin and scrolls at the bottom", () => {
  const screen = createCellScreen(10, 4);
  const margins = createMarginScreen(screen);
  margins.setVerticalMargins(1, 2);
  margins.setHorizontalMargins(2, 5);
  margins.setOriginMode(true);
  margins.setCursor(0, 0);
  margins.print("ABCDEFGH"); // exactly fills the 4-wide, 2-row box
  assertEquals(screen.lines()[1], "  ABCD");
  assertEquals(screen.lines()[2], "  EFGH"); // wrap is deferred after H

  margins.print("I"); // the deferred wrap fires: box scrolls once
  const lines = screen.lines();
  assertEquals(lines[1], "  EFGH"); // ABCD scrolled away inside the box
  assertEquals(lines[2], "  I");
  assert(lines[0] === "" && (lines[3] ?? "") === ""); // outside untouched
});

Deno.test("IL/DL and ICH/DCH shift strictly inside the margins", () => {
  const { screen, margins } = boxed();
  margins.setOriginMode(true);
  margins.setCursor(1, 0); // box row 2 absolute
  margins.insertLines(1);
  const afterInsert = screen.lines();
  assertEquals(afterInsert[2]!.slice(2, 8), "      "); // blank inserted inside
  assert(afterInsert[2]!.startsWith("2·") && afterInsert[2]!.endsWith("·2")); // borders intact
  assertEquals(afterInsert[5], "5········5");

  margins.deleteLines(1);
  assertEquals(screen.lines()[4]!.slice(2, 8), "      "); // bottom of box blanked

  margins.setCursor(0, 0);
  margins.insertCharacters(2);
  const row1 = screen.lines()[1]!;
  assertEquals(row1.slice(2, 4), "  "); // blanks at the cursor
  assert(row1.endsWith("·1")); // the right border cell was NOT pushed out
  margins.deleteCharacters(2);
  assert(screen.lines()[1]!.startsWith("1·")); // left border intact
});
