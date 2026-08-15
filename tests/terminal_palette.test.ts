// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
  mixTerminalRgb,
  resolveTerminalCellStyle,
  type TerminalCellStyleOptions,
  terminalContrastRatio,
  terminalPaletteRgb,
  terminalReadableForegroundRgb,
  type TerminalRgb,
} from "../src/runtime/terminal_palette.ts";
import {
  encodeTerminalIndexedColor,
  encodeTerminalRgbColor,
} from "../src/runtime/terminal_color.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { TerminalScreen } from "../src/components/terminal_screen.ts";
import { WidgetSurface, widgetSurfaceCellData } from "../mod.app.ts";
import { Signal } from "../src/signals/mod.ts";

const SURFACE: TerminalRgb = [20, 24, 34];
const TEXT: TerminalRgb = [220, 226, 240];

Deno.test("terminalPaletteRgb resolves ansi, indexed, and truecolor values", () => {
  // SGR 31 (red) arrives encoded as an ansi slot; slot 1 is xterm red.
  assertEquals(terminalPaletteRgb(encodeTerminalIndexedColor(1), false), [205, 49, 49]);
  // 256-color cube index 196 is pure red.
  assertEquals(terminalPaletteRgb(encodeTerminalIndexedColor(196), false), [255, 0, 0]);
  // Grayscale ramp: 232 is near-black.
  assertEquals(terminalPaletteRgb(encodeTerminalIndexedColor(232), false), [8, 8, 8]);
  // Truecolor round-trips exactly.
  assertEquals(terminalPaletteRgb(encodeTerminalRgbColor(12, 34, 56), false), [12, 34, 56]);
  assertEquals(terminalPaletteRgb(undefined, false), undefined);
});

Deno.test("terminalReadableForegroundRgb lifts low-contrast ANSI text only", () => {
  // ANSI blue (SGR 34) reads poorly on a dark surface; the lift must reach AA.
  const lifted = terminalReadableForegroundRgb(34, SURFACE, TEXT);
  assert(lifted);
  assert(terminalContrastRatio(lifted, SURFACE) >= 4.5, `lifted contrast ${terminalContrastRatio(lifted, SURFACE)}`);
  // A program that chose an exact truecolor keeps it, readable or not.
  const exact = terminalReadableForegroundRgb(encodeTerminalRgbColor(21, 25, 35), SURFACE, TEXT);
  assertEquals(exact, [21, 25, 35]);
});

Deno.test("resolveTerminalCellStyle inverts the cursor, dims, and blends grounds", () => {
  const options: TerminalCellStyleOptions = {
    defaultBackground: SURFACE,
    defaultForeground: TEXT,
    contrastLift: true,
    cursorForeground: [0, 0, 0],
    cursorBackground: [255, 200, 0],
  };
  // A plain cell takes the defaults.
  const plain = resolveTerminalCellStyle({ char: "a" }, 0, 0, false, options);
  assertEquals(plain.background, SURFACE);
  assertEquals(plain.foreground, TEXT);
  assertEquals(plain.bold, false);

  // The cursor cell is an inverted bold block.
  const cursor = resolveTerminalCellStyle({ char: "a" }, 0, 0, true, options);
  assertEquals(cursor.background, [255, 200, 0]);
  assertEquals(cursor.foreground, [0, 0, 0]);
  assertEquals(cursor.bold, true);

  // Dim fades both channels toward the target.
  const dim = resolveTerminalCellStyle({ char: "a" }, 0, 0, false, { ...options, dimToward: [0, 0, 0] });
  assert(dim.foreground[0] < TEXT[0]);
  assert(dim.background[0] < SURFACE[0] + 1);

  // A translucent ground only sees through default-background cells.
  const ground = (): TerminalRgb => [100, 100, 100];
  const seeThrough = resolveTerminalCellStyle({ char: "a" }, 0, 0, false, { ...options, ground, opacity: 0.5 });
  assertEquals(seeThrough.background, mixTerminalRgb([100, 100, 100], SURFACE, 0.5));
  const painted = resolveTerminalCellStyle(
    { char: "a", background: encodeTerminalIndexedColor(196) },
    0,
    0,
    false,
    { ...options, ground, opacity: 0.5 },
  );
  assertEquals(painted.background, [255, 0, 0]);
});

Deno.test("TerminalScreen component renders a PTY screen with palette, cursor, and warning", async () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 3 });
  screen.write("\x1b[31mR\x1b[0m\x1b[38;2;12;34;56mY\x1b[0m plain");
  const revision = new Signal(0);
  const warning = new Signal<string | undefined>(undefined);
  const surface = new WidgetSurface(12, 3);
  try {
    surface.mount((tui) => [
      new TerminalScreen({
        parent: tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: 12, height: 3 },
        screen,
        revision,
        colors: {
          defaultBackground: SURFACE,
          defaultForeground: TEXT,
          cursorForeground: [0, 0, 0],
          cursorBackground: [255, 200, 0],
          warningForeground: [255, 180, 0],
          warningBackground: [40, 30, 10],
        },
        showCursor: false,
        warning,
      }),
    ]);
    await surface.render();

    // ANSI red text gets the palette (contrast-lifted toward the default text,
    // so at least as bright as xterm red), truecolor passes through exactly.
    const red = widgetSurfaceCellData(surface.cellAt(0, 0));
    assertEquals(red?.glyph, "R");
    assert(red?.foreground && red.foreground[0] >= 205, `saw ${red?.foreground}`);
    const truecolor = widgetSurfaceCellData(surface.cellAt(0, 1));
    assertEquals(truecolor?.glyph, "Y");
    assertEquals(truecolor?.foreground, [12, 34, 56]);
    assertEquals(truecolor?.background, [...SURFACE]);

    // Setting a warning overlays the bottom row.
    warning.value = "no audio";
    await surface.render();
    let bottom = "";
    for (let column = 0; column < 12; column += 1) {
      bottom += widgetSurfaceCellData(surface.cellAt(2, column))?.glyph ?? " ";
    }
    assertEquals(bottom.trimEnd(), "! no audio");
  } finally {
    surface.dispose();
  }
});
