// Copyright 2023 Im-Beast. MIT license.

// Where the fixed parts of the exomux desktop are.
//
// The top bar splits into three: the start button on the left, the window
// taskbar filling the middle, and the quick-quit control on the right. Below
// it is the body, which every window and the animated background share.
//
// These were formulas inlined in `mountExomuxDesktop` — a 3,196-line function —
// so nothing could ask where the shelf was without mounting a desktop, and the
// pointer path re-derived each rect at hit time. They are pure functions of the
// terminal bounds, which makes them testable on their own and usable by the
// pointer resolver (plan/todo/040).

import type { Rectangle } from "@ubernaut/deno-tui";

/** Rows the top bar occupies; the body starts below it. */
export const EXOMUX_HEADER_ROWS = 1;
/** Rows reserved at the bottom. Zero today; kept explicit so the body formula reads. */
export const EXOMUX_FOOTER_ROWS = 0;
/** Cells the quick-quit control claims at the right end of the top bar. */
export const EXOMUX_MENU_QUIT_WIDTH = 5;

/** The start button: fixed size, top-left, always at the head of the top bar. */
export const EXOMUX_START_BUTTON: Rectangle = Object.freeze({ column: 0, row: 0, width: 14, height: 1 });

/** The quick-quit control, pinned to the right end of the top bar. */
export function exomuxMenuQuitRect(bounds: Rectangle): Rectangle {
  return {
    column: bounds.column + Math.max(0, bounds.width - EXOMUX_MENU_QUIT_WIDTH),
    row: 0,
    width: Math.min(EXOMUX_MENU_QUIT_WIDTH, bounds.width),
    height: 1,
  };
}

/** Everything below the top bar: windows, the background, and the desktop. */
export function exomuxBodyRect(bounds: Rectangle): Rectangle {
  return {
    column: 0,
    row: Math.min(EXOMUX_HEADER_ROWS, Math.max(0, bounds.height - 1)),
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height - EXOMUX_HEADER_ROWS - EXOMUX_FOOTER_ROWS),
  };
}

/**
 * The window taskbar, which shares the top bar: it starts just past the start
 * button and stops short of the quick-quit control.
 */
export function exomuxShelfBounds(bounds: Rectangle): Rectangle {
  const column = EXOMUX_START_BUTTON.width + 1;
  const available = Math.max(0, bounds.width - column - EXOMUX_MENU_QUIT_WIDTH - 1);
  return { column, row: 0, width: Math.max(1, available), height: 1 };
}
