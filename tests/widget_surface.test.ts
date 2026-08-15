// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { WidgetSurface } from "../mod.app.ts";
import { Button } from "../src/components/button.ts";
import { createAnsiStyle } from "../src/theme.ts";

const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
function rowText(surface: WidgetSurface, row: number, width: number): string {
  let text = "";
  for (let column = 0; column < width; column += 1) {
    const cell = surface.cellAt(row, column);
    text += typeof cell === "string" ? cell.replace(SGR, "") : " ";
  }
  return text;
}

Deno.test("WidgetSurface renders a mounted component to a readable cell grid", async () => {
  const surface = new WidgetSurface(20, 3);
  try {
    const base = createAnsiStyle({ foreground: [220, 230, 255], background: [30, 40, 70] });
    surface.mount((tui) => [
      new Button({
        parent: tui,
        rectangle: { column: 0, row: 0, width: 12, height: 3 },
        zIndex: 1,
        theme: { base },
        label: { text: "Rename" },
      }),
    ]);
    await surface.render();

    // The component's label is present in the read-back cells.
    let found = false;
    for (let row = 0; row < surface.rows && !found; row += 1) {
      if (rowText(surface, row, surface.columns).includes("Rename")) found = true;
    }
    assert(found, "the mounted Button's label should render into the surface cells");
  } finally {
    surface.dispose();
  }
});

Deno.test("WidgetSurface resizes and tears down its components", () => {
  const surface = new WidgetSurface(30, 6);
  assertEquals([surface.columns, surface.rows], [30, 6]);
  surface.resize(10, 2);
  assertEquals([surface.columns, surface.rows], [10, 2]);
  // Same size is a no-op.
  surface.resize(10, 2);
  assertEquals([surface.columns, surface.rows], [10, 2]);
  surface.dispose(); // no components mounted — must not throw
});

Deno.test("widgetSurfaceCellData decodes glyph, truecolor attributes, and bold", async () => {
  const { widgetSurfaceCellData } = await import("../mod.app.ts");
  // A cell shaped exactly like the style pipeline's output.
  const styled = createAnsiStyle({ foreground: [205, 49, 49], background: [36, 114, 200], bold: true })("R");
  const data = widgetSurfaceCellData(styled);
  assert(data);
  assertEquals(data.glyph, "R");
  assertEquals(data.foreground, [205, 49, 49]);
  assertEquals(data.background, [36, 114, 200]);
  assertEquals(data.bold, true);

  // A real rendered cell round-trips the same way.
  const surface = new WidgetSurface(4, 1);
  try {
    surface.mount((tui) => [
      new Button({
        parent: tui,
        rectangle: { column: 0, row: 0, width: 4, height: 1 },
        zIndex: 1,
        theme: { base: createAnsiStyle({ foreground: [10, 20, 30], background: [40, 50, 60] }) },
        label: { text: "ab" },
      }),
    ]);
    await surface.render();
    for (let column = 0; column < 4; column += 1) {
      const cell = widgetSurfaceCellData(surface.cellAt(0, column));
      if (cell?.glyph === "a") {
        assertEquals(cell.foreground, [10, 20, 30]);
        assertEquals(cell.background, [40, 50, 60]);
        return;
      }
    }
    assert(false, "expected to find the rendered 'a' cell");
  } finally {
    surface.dispose();
  }

  // Untouched cells and resets decode conservatively.
  assertEquals(widgetSurfaceCellData(undefined), undefined);
  const reset = widgetSurfaceCellData("\x1b[0m ");
  assertEquals(reset?.glyph, " ");
  assertEquals(reset?.foreground, undefined);
});
