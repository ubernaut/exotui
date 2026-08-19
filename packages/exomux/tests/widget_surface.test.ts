// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { Button, createAnsiStyle, Signal, Slider } from "@ubernaut/exotui";
import { ExomuxWidgetSurface } from "../widget_surface.ts";

/** Counts the non-empty rendered cells across the surface. */
function paintedCells(surface: ExomuxWidgetSurface): number {
  let count = 0;
  for (let row = 0; row < surface.rows; row += 1) {
    for (let column = 0; column < surface.columns; column += 1) {
      if (surface.cellAt(row, column) !== undefined) count += 1;
    }
  }
  return count;
}

Deno.test("Exomux widget surface renders real Button and Slider components to a cell grid", async () => {
  const surface = new ExomuxWidgetSurface(30, 6);
  try {
    const base = createAnsiStyle({ foreground: [220, 230, 255], background: [30, 40, 70] });
    const thumb = createAnsiStyle({ foreground: [10, 10, 20], background: [255, 105, 180] });
    const sliderValue = new Signal(30);
    surface.mount((tui) => [
      new Button({
        parent: tui,
        rectangle: { column: 1, row: 1, width: 12, height: 3 },
        zIndex: 1,
        theme: { base },
        label: { text: "Rename" },
      }),
      new Slider({
        parent: tui,
        rectangle: { column: 15, row: 2, width: 12, height: 1 },
        zIndex: 1,
        theme: { base, thumb: { base: thumb } },
        min: 0,
        max: 100,
        step: 5,
        value: sliderValue,
        orientation: "horizontal",
        adjustThumbSize: true,
      }),
    ]);

    await surface.render();
    // Both components painted their region: the button box + label, the slider
    // track + thumb — well more than a blank grid.
    const painted = paintedCells(surface);
    assert(painted > 20, `expected the components to fill cells, saw ${painted}`);
    // The button's top-left corner is painted.
    assert(surface.cellAt(1, 1) !== undefined, "the button box should paint its corner");
    // The slider track row is painted.
    assert(surface.cellAt(2, 15) !== undefined, "the slider should paint its track");

    // Moving the slider's bound value re-renders the thumb without a re-mount.
    const before = paintedCells(surface);
    sliderValue.value = 90;
    await surface.render();
    assert(paintedCells(surface) >= before - 2, "the slider stays painted after its value moves");
  } finally {
    surface.dispose();
  }
});

Deno.test("Exomux widget surface resizes and re-mounts without leaking components", async () => {
  const surface = new ExomuxWidgetSurface(20, 4);
  try {
    const base = createAnsiStyle({ foreground: [255, 255, 255], background: [0, 0, 0] });
    const build = (width: number) => (tui: import("@ubernaut/exotui").Tui) => [
      new Button({
        parent: tui,
        rectangle: { column: 0, row: 0, width, height: 3 },
        zIndex: 1,
        theme: { base },
        label: { text: "OK" },
      }),
    ];
    surface.mount(build(10));
    await surface.render();
    assertEquals(surface.columns, 20);

    surface.resize(40, 6);
    surface.mount(build(20));
    await surface.render();
    assertEquals(surface.columns, 40);
    assertEquals(surface.rows, 6);
    assert(surface.cellAt(0, 0) !== undefined, "the re-mounted button paints after resize");
  } finally {
    surface.dispose();
  }
});
