// Copyright 2023 Im-Beast. MIT license.

// 036 R1: ONE renderer-neutral policy for the three screen modes.
// Alternate-screen owns the whole alternate buffer; buffered
// main-screen repaints a region of the PRIMARY buffer under a saved
// cursor — deliberately NOT called inline mode, because it is not:
// SCREEN_MODE_LIMITS is the canonical statement that repainting a
// main-screen region does not interleave with shell output flow, and a
// true embedded/inline contract would be a separate specification if a
// host ever needs one. Split-footer pins the app to the bottom rows by
// restricting the scroll region to the shell's upper part, so shell
// output scrolls above a stable footer. Every mode answers the same
// questions — enter/exit sequences and the rectangle the renderer may
// paint — so renderers never branch on mode internals.

import type { Rectangle } from "../types.ts";

const ESC = "\x1b";

/** The three screen modes. */
export type ScreenMode = "alternate" | "buffered-main" | "split-footer";

/** The documented limit: buffered main-screen is NOT inline mode. */
export const SCREEN_MODE_LIMITS = Object.freeze({
  bufferedMain: "repaints a fixed region of the primary buffer under a saved cursor; " +
    "it does not interleave with shell output flow and must not be called inline mode",
  inline: "a true embedded/inline contract is unspecified; specify it separately " +
    "only when a concrete host use case requires it",
});

/** One resolved screen-mode policy. */
export interface ScreenModePolicy {
  readonly mode: ScreenMode;
  readonly usesAlternateScreen: boolean;
  /** Sequences to enter the mode at the given terminal size. */
  enter(size: { readonly columns: number; readonly rows: number }): string;
  /** Sequences to leave the mode, restoring the shell's screen. */
  exit(size: { readonly columns: number; readonly rows: number }): string;
  /** The rectangle the renderer may paint at the given size. */
  paintRect(size: { readonly columns: number; readonly rows: number }): Rectangle;
}

/** Options for the split-footer mode. */
export interface ScreenModeOptions {
  /** Rows the footer app owns (split-footer only). */
  readonly footerRows?: number;
  /** Rows the buffered main-screen region spans (buffered-main only). */
  readonly bufferRows?: number;
}

/** Creates the policy for a mode. */
export function createScreenModePolicy(mode: ScreenMode, options: ScreenModeOptions = {}): ScreenModePolicy {
  if (mode === "alternate") {
    return {
      mode,
      usesAlternateScreen: true,
      enter: () => `${ESC}[?1049h${ESC}[2J${ESC}[H`,
      exit: () => `${ESC}[?1049l`,
      paintRect: (size) => ({ column: 0, row: 0, width: size.columns, height: size.rows }),
    };
  }
  if (mode === "buffered-main") {
    const bufferRows = Math.max(1, options.bufferRows ?? 10);
    return {
      mode,
      usesAlternateScreen: false,
      // Save the cursor, open the region by scrolling it into existence,
      // and return to its top-left. The shell's screen above survives.
      enter: (size) => {
        const rows = Math.min(bufferRows, size.rows);
        return `${ESC}7` + "\n".repeat(rows - 1) + `${ESC}[${rows - 1}A${ESC}7`;
      },
      // Clear the region and put the cursor back where the shell left it.
      exit: (size) => {
        const rows = Math.min(bufferRows, size.rows);
        let wipe = `${ESC}8`;
        for (let row = 0; row < rows; row += 1) {
          wipe += `${ESC}[2K` + (row < rows - 1 ? `${ESC}[1B` : "");
        }
        return wipe + `${ESC}8`;
      },
      paintRect: (size) => ({
        column: 0,
        row: 0,
        width: size.columns,
        height: Math.min(bufferRows, size.rows),
      }),
    };
  }
  const footerRows = Math.max(1, options.footerRows ?? 3);
  return {
    mode,
    usesAlternateScreen: false,
    // DECSTBM restricts scrolling to the upper region, so shell output
    // scrolls there while the footer rows stay stable for the app.
    enter: (size) => {
      const footer = Math.min(footerRows, Math.max(1, size.rows - 1));
      return `${ESC}[1;${size.rows - footer}r${ESC}[${size.rows - footer};1H`;
    },
    exit: (size) => {
      const footer = Math.min(footerRows, Math.max(1, size.rows - 1));
      let wipe = "";
      for (let row = size.rows - footer + 1; row <= size.rows; row += 1) {
        wipe += `${ESC}[${row};1H${ESC}[2K`;
      }
      return `${ESC}[r` + wipe + `${ESC}[${size.rows - footer};1H`;
    },
    paintRect: (size) => {
      const footer = Math.min(footerRows, Math.max(1, size.rows - 1));
      return { column: 0, row: size.rows - footer, width: size.columns, height: footer };
    },
  };
}
