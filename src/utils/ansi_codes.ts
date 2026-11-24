// Copyright 2023 Im-Beast. MIT license.

/** Get ANSI escape code for moving cursor to given location */
export function moveCursor(row: number, column: number): string {
  return `\x1b[${row + 1};${column + 1}H`;
}

/** ANSI escape code to enable mouse handling */
export const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1002h\x1b[?1005h\x1b[?1006h";

/** ANSI escape code to disable mouse handling */
export const DISABLE_MOUSE = "\x1b[?1000l\x1b[?1002l\x1b[?1005l\x1b[?1006l";

/** ANSI escape code to enable bracketed paste handling */
export const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";

/** ANSI escape code to disable bracketed paste handling */
export const DISABLE_BRACKETED_PASTE = "\x1b[?2004l";

/** Pushes the kitty keyboard protocol's "disambiguate escape codes" flag on the current screen. */
export const ENABLE_ENHANCED_KEYBOARD = "\x1b[>1u";

/** Pops the kitty keyboard flags pushed by {@linkcode ENABLE_ENHANCED_KEYBOARD}. */
export const DISABLE_ENHANCED_KEYBOARD = "\x1b[<u";

/** ANSI escape code to enable terminal focus reporting */
export const ENABLE_FOCUS_EVENTS = "\x1b[?1004h";

/** ANSI escape code to disable terminal focus reporting */
export const DISABLE_FOCUS_EVENTS = "\x1b[?1004l";

/** ANSI escape code to hide terminal cursor  */
export const HIDE_CURSOR: "\x1b[?25l" = `\x1b[?25l`;

/** ANSI escape code to show terminal cursor  */
export const SHOW_CURSOR: "\x1b[?25h" = `\x1b[?25h`;

/** ANSI escape code to clear screen  */
export const CLEAR_SCREEN: "\x1b[2J" = `\x1b[2J`;

/** ANSI escape code to tell terminal to use secondary buffer */
export const USE_SECONDARY_BUFFER = "\x1b[?1049h";

/** ANSI escape code to tell terminal to switch back to primary buffer */
export const USE_PRIMARY_BUFFER = "\x1b[?1049l";

/** ANSI escape code to begin a DEC synchronized output frame (mode 2026). */
export const BEGIN_SYNCHRONIZED_OUTPUT = "\x1b[?2026h";

/** ANSI escape code to end a DEC synchronized output frame (mode 2026). */
export const END_SYNCHRONIZED_OUTPUT = "\x1b[?2026l";

/** ANSI escape code to enable Unicode grapheme cluster width mode (mode 2027). */
export const ENABLE_GRAPHEME_CLUSTERING = "\x1b[?2027h";

/** ANSI escape code to disable Unicode grapheme cluster width mode (mode 2027). */
export const DISABLE_GRAPHEME_CLUSTERING = "\x1b[?2027l";
