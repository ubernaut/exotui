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
import { encodeTerminalIndexedColor, encodeTerminalRgbColor } from "../src/runtime/terminal_color.ts";
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

Deno.test("TerminalScreen component forwards sanitized OSC 8 hyperlinks and drops unsafe schemes", async () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write(
    "\x1b]8;;https://example.com/docs\x1b\\ok\x1b]8;;\x1b\\ \x1b]8;;javascript:alert(1)\x1b\\no\x1b]8;;\x1b\\",
  );
  const revision = new Signal(0);
  const surface = new WidgetSurface(12, 2);
  try {
    surface.mount((tui) => [
      new TerminalScreen({
        parent: tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: 12, height: 2 },
        screen,
        revision,
        colors: {
          defaultBackground: SURFACE,
          defaultForeground: TEXT,
          cursorForeground: [0, 0, 0],
          cursorBackground: [255, 200, 0],
        },
        showCursor: false,
      }),
    ]);
    await surface.render();
    const first = surface.cellAt(0, 0);
    const unsafe = surface.cellAt(0, 3);
    assert(typeof first === "string" && first.includes("\x1b]8;;https://example.com/docs\x1b\\"));
    assert(typeof unsafe === "string" && !unsafe.includes("javascript:"));
  } finally {
    surface.dispose();
  }
});

Deno.test("resolveTerminalCellStyle and TerminalScreen render DECSCUSR block, underline, bar, and blink cues", async () => {
  const options: TerminalCellStyleOptions = {
    defaultBackground: SURFACE,
    defaultForeground: TEXT,
    contrastLift: true,
    cursorForeground: [0, 0, 0],
    cursorBackground: [255, 200, 0],
  };

  // Underline cursor preserves text & background while applying an accent underline.
  const underline = resolveTerminalCellStyle({ char: "x" }, 0, 0, true, { ...options, cursorShape: "underline" });
  assertEquals(underline.glyph, "x");
  assertEquals(underline.background, SURFACE);
  assertEquals(underline.underline, true);
  assertEquals(underline.underlineStyle, "solid");
  assertEquals(underline.underlineColor, [255, 200, 0]);

  // Bar cursor paints a thin vertical bar on empty cells and tints existing glyphs legibly.
  const barBlank = resolveTerminalCellStyle({ char: " " }, 0, 0, true, { ...options, cursorShape: "bar" });
  assertEquals(barBlank.glyph, "▏");
  assertEquals(barBlank.foreground, [255, 200, 0]);
  assertEquals(barBlank.background, SURFACE);

  const barText = resolveTerminalCellStyle({ char: "x" }, 0, 0, true, { ...options, cursorShape: "bar" });
  assertEquals(barText.glyph, "x");
  assertEquals(barText.background, mixTerminalRgb(SURFACE, [255, 200, 0], 0.35));
  assert(terminalContrastRatio(barText.foreground, barText.background) >= 4.5);

  // cursorHidden suppresses the cursor cue during blink off-phase.
  const hidden = resolveTerminalCellStyle({ char: "x" }, 0, 0, true, {
    ...options,
    cursorShape: "block",
    cursorHidden: true,
  });
  assertEquals(hidden.background, SURFACE);
  assertEquals(hidden.foreground, TEXT);

  // Mounted TerminalScreen honors DECSCUSR shape + blinking phase.
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });
  const revision = new Signal(0);
  const blinkOn = new Signal(true);
  const surface = new WidgetSurface(8, 2);
  try {
    surface.mount((tui) => [
      new TerminalScreen({
        parent: tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: 8, height: 2 },
        screen,
        revision,
        colors: {
          defaultBackground: SURFACE,
          defaultForeground: TEXT,
          cursorForeground: [0, 0, 0],
          cursorBackground: [255, 200, 0],
        },
        showCursor: true,
        cursorBlinkOn: blinkOn,
      }),
    ]);

    screen.write("\x1b[6 q");
    revision.value += 1;
    await surface.render();
    assertEquals(widgetSurfaceCellData(surface.cellAt(0, 0))?.glyph, "▏");

    // Steady cursor (`6 q`) stays visible even when blinkOn is false.
    blinkOn.value = false;
    await surface.render();
    assertEquals(widgetSurfaceCellData(surface.cellAt(0, 0))?.glyph, "▏");

    // Blinking cursor (`5 q`) hides during blink off-phase.
    screen.write("\x1b[5 q");
    revision.value += 1;
    await surface.render();
    assertEquals(widgetSurfaceCellData(surface.cellAt(0, 0))?.glyph, " ");

    // Underline cursor (`4 q`) renders underline SGR on the cursor cell.
    screen.write("\x1b[4 qA\x1b[D");
    revision.value += 1;
    await surface.render();
    const cell = surface.cellAt(0, 0);
    assert(typeof cell === "string" && cell.includes("58;2;255;200;0"));
  } finally {
    surface.dispose();
  }
});

Deno.test("TerminalScreen applies dynamic OSC 4 palette overrides and restores defaults on OSC 104", async () => {
  const screen = new TerminalScreenController({ columns: 6, rows: 2 });
  screen.write("\x1b]4;1;#12ab34\x07\x1b[31mR\x1b[0m");
  const revision = new Signal(0);
  const surface = new WidgetSurface(6, 2);
  try {
    surface.mount((tui) => [
      new TerminalScreen({
        parent: tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: 6, height: 2 },
        screen,
        revision,
        contrastLift: false,
        colors: {
          defaultBackground: SURFACE,
          defaultForeground: TEXT,
          cursorForeground: [0, 0, 0],
          cursorBackground: [255, 200, 0],
        },
        showCursor: false,
      }),
    ]);
    await surface.render();
    assertEquals(widgetSurfaceCellData(surface.cellAt(0, 0))?.foreground, [0x12, 0xab, 0x34]);

    screen.write("\x1b]104;1\x07");
    revision.value += 1;
    await surface.render();
    assertEquals(widgetSurfaceCellData(surface.cellAt(0, 0))?.foreground, [205, 49, 49]);
  } finally {
    surface.dispose();
  }
});
