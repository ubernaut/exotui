// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { Signal } from "@ubernaut/exotui";
import { type ExomuxPickerBindings, type ExomuxPickerSpec, ExomuxSettingsSurface } from "../settings_surface.ts";

function mockBindings() {
  const theme = new Signal(0);
  const background = new Signal(0);
  const themeSets: number[] = [];
  const backgroundSets: number[] = [];
  const bindings: ExomuxPickerBindings = {
    themeIndex: () => theme.peek(),
    setThemeIndex: (index) => {
      themeSets.push(index);
      theme.value = index;
    },
    onThemeIndexChanged: (listener) => {
      theme.subscribe(listener);
      return () => theme.unsubscribe(listener);
    },
    backgroundIndex: () => background.peek(),
    setBackgroundIndex: (index) => {
      backgroundSets.push(index);
      background.value = index;
    },
    onBackgroundIndexChanged: (listener) => {
      background.subscribe(listener);
      return () => background.unsubscribe(listener);
    },
  };
  return { theme, background, themeSets, backgroundSets, bindings };
}

function specs(): { theme: ExomuxPickerSpec; background: ExomuxPickerSpec } {
  return {
    theme: {
      column: 0,
      row: 0,
      width: 16,
      height: 5,
      items: ["one", "two", "three", "four", "five"],
      foreground: [220, 230, 255],
      background: [30, 40, 70],
      selectedForeground: [10, 10, 20],
      selectedBackground: [255, 105, 180],
      scrollbarTrack: [40, 50, 80],
      scrollbarThumb: [120, 130, 160],
    },
    background: {
      column: 18,
      row: 0,
      width: 16,
      height: 5,
      items: ["metaballs", "matrix", "fire", "ivy"],
      foreground: [220, 230, 255],
      background: [30, 40, 70],
      selectedForeground: [10, 10, 20],
      selectedBackground: [255, 105, 180],
      scrollbarTrack: [40, 50, 80],
      scrollbarThumb: [120, 130, 160],
    },
  };
}

async function settle(pending: () => boolean, limit = 60) {
  for (let attempt = 0; attempt < limit && pending(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

Deno.test("settings surface pickers route clicks, wheel, and keys into the bound controller", async () => {
  const { theme, background, themeSets, backgroundSets, bindings } = mockBindings();
  let repaints = 0;
  const surface = new ExomuxSettingsSurface(() => {
    repaints += 1;
  });
  try {
    surface.bind(bindings);
    const spec = specs();
    surface.sync(spec.theme, spec.background);
    await settle(() => !surface.ready());
    assert(surface.ready(), "the surface renders a snapshot");
    assert(repaints >= 1, "a completed render requests a repaint");

    // The theme list renders its rows: the selected first row carries the marker.
    const row0 = plainRow(surface, 0, 0, 16);
    assert(row0.includes("one"), `theme row 0 should render an item, saw "${row0}"`);
    assert(row0.trimStart().startsWith(">"), "the selected row carries the list marker");

    // Clicking the third visible row selects it and applies it to the controller.
    surface.handlePointer("theme", 3, 2);
    assertEquals(theme.peek(), 2);
    assertEquals(themeSets.at(-1), 2);

    // The wheel scrolls the viewport, never the selection (these lists fit, so
    // it is simply a no-op here — it must not change the theme).
    surface.handleScroll("theme", 1);
    assertEquals(theme.peek(), 2, "scrolling a picker must not change its selection");

    // Arrow keys move the background selection.
    surface.handleKey("background", { key: "down" });
    assertEquals(background.peek(), 1);
    surface.handleKey("background", { key: "up" });
    assertEquals(background.peek(), 0);
    assert(backgroundSets.length >= 1, "the background setter was invoked");

    // Controller -> surface: an external theme change reflects in the list marker.
    // Index 4 of five items (height 5) sits at visible row 4.
    bindings.setThemeIndex(4);
    // Wait for the re-render to move the marker to row 4 (every item is always
    // visible here, so track the marker, not the item text).
    await settle(() => !plainRow(surface, 4, 0, 2).includes(">"));
    assertEquals(surface.ready(), true);
    const lastRow = plainRow(surface, 4, 0, 16);
    assert(lastRow.includes("five"), `the external selection shows in the list, saw "${lastRow}"`);
    assert(lastRow.trimStart().startsWith(">"), "row 4 becomes the marked selection");
  } finally {
    surface.dispose();
  }
});

Deno.test("settings surface picker scrolls without duplicating rows", async () => {
  const { bindings } = mockBindings();
  const surface = new ExomuxSettingsSurface(() => {});
  try {
    surface.bind(bindings);
    const items = Array.from({ length: 10 }, (_, index) => `theme-${index}`);
    const picker = (over: Partial<ExomuxPickerSpec>): ExomuxPickerSpec => ({
      column: 0,
      row: 0,
      width: 16,
      height: 4,
      items,
      foreground: [220, 230, 255],
      background: [30, 40, 70],
      selectedForeground: [10, 10, 20],
      selectedBackground: [255, 105, 180],
      scrollbarTrack: [40, 50, 80],
      scrollbarThumb: [120, 130, 160],
      ...over,
    });
    surface.sync(picker({}), picker({ column: 18, items: ["a", "b", "c"] }));
    await settle(() => !surface.ready());

    // Wheel the viewport down one notch at a time. Each step must show four
    // distinct consecutive items: the "duplicate row" artifact left the same
    // item on two rows after a scroll (a stale cell the incremental renderer
    // skipped when the selection highlight scrolled out of view).
    for (let top = 1; top <= items.length - 4; top += 1) {
      surface.handleScroll("theme", 1);
      await settle(() => !plainRow(surface, 0, 0, 15).includes(`theme-${top}`));
      const visible = [0, 1, 2, 3].map((row) => plainRow(surface, row, 0, 15).replace(/[>]/g, "").trim());
      assertEquals(
        new Set(visible).size,
        visible.length,
        `scroll to ${top} duplicated a row: ${JSON.stringify(visible)}`,
      );
      assertEquals(visible, [0, 1, 2, 3].map((offset) => `theme-${top + offset}`));
    }
  } finally {
    surface.dispose();
  }
});

/** Strips SGR from a run of cells on one surface row. */
const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
function plainRow(surface: ExomuxSettingsSurface, row: number, column: number, width: number): string {
  let text = "";
  for (let offset = 0; offset < width; offset += 1) {
    const cell = surface.cellAt(row, column + offset);
    text += typeof cell === "string" ? cell.replace(SGR, "") : " ";
  }
  return text;
}
