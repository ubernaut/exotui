import { assertEquals } from "./deps.ts";
import {
  EXOMUX_MENU_QUIT_WIDTH,
  EXOMUX_START_BUTTON,
  exomuxBodyRect,
  exomuxMenuQuitRect,
  exomuxShelfBounds,
} from "../desktop_layout.ts";

// Phase 2 of plan/todo/040: the desktop's fixed geometry, now answerable
// without mounting a desktop. These were formulas inside a 3,196-line closure.

const full = { column: 0, row: 0, width: 100, height: 30 };

Deno.test("the top bar splits into start, shelf and quit without overlap or gaps", () => {
  const start = EXOMUX_START_BUTTON;
  const shelf = exomuxShelfBounds(full);
  const quit = exomuxMenuQuitRect(full);

  assertEquals(start.column, 0);
  assertEquals(shelf.column, start.column + start.width + 1, "the shelf begins past the start button");
  assertEquals(
    shelf.column + shelf.width,
    quit.column - 1,
    "the shelf stops one cell short of the quit control",
  );
  assertEquals(quit.column + quit.width, full.width, "quit is flush right");
  for (const rect of [start, shelf, quit]) assertEquals(rect.row, 0, "all three share the top row");
});

Deno.test("the body is everything under the top bar", () => {
  const body = exomuxBodyRect(full);
  assertEquals(body, { column: 0, row: 1, width: 100, height: 29 });
  assertEquals(body.row + body.height, full.height, "the body reaches the bottom");
});

Deno.test("degenerate terminals still produce usable rectangles", () => {
  // One row: the body cannot start below the last row, and stays at least 1 tall.
  const single = exomuxBodyRect({ column: 0, row: 0, width: 20, height: 1 });
  assertEquals(single.row, 0);
  assertEquals(single.height, 1);

  // Narrower than the quit control: it clamps instead of going negative.
  const narrow = exomuxMenuQuitRect({ column: 0, row: 0, width: 3, height: 10 });
  assertEquals(narrow.column, 0);
  assertEquals(narrow.width, 3);

  // Too narrow for a shelf at all: still a valid one-cell rect.
  const shelf = exomuxShelfBounds({ column: 0, row: 0, width: 10, height: 10 });
  assertEquals(shelf.width, 1);
  assertEquals(shelf.column, EXOMUX_START_BUTTON.width + 1);
});

Deno.test("the shelf grows with the terminal, keeping its margins", () => {
  const wide = exomuxShelfBounds({ column: 0, row: 0, width: 200, height: 40 });
  assertEquals(
    wide.width,
    200 - (EXOMUX_START_BUTTON.width + 1) - EXOMUX_MENU_QUIT_WIDTH - 1,
  );
});
