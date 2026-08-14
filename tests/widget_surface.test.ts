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
