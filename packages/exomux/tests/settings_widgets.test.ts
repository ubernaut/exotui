// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import {
  exomuxSettingsButtonSignature,
  type ExomuxSettingsButtonSpec,
  ExomuxSettingsWidgets,
} from "../settings_widgets.ts";

/** Strips SGR sequences so a row's plain glyphs can be inspected. */
const SGR_PATTERN = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
function plainRow(cells: readonly (string | Uint8Array | undefined)[]): string {
  return cells
    .map((cell) => (typeof cell === "string" ? cell.replace(SGR_PATTERN, "") : ""))
    .join("");
}

Deno.test("Exomux settings widgets composite real Button cells for the action buttons", async () => {
  const specs: ExomuxSettingsButtonSpec[] = [
    { key: "background", label: "Background config", width: 22, foreground: [10, 10, 20], background: [220, 160, 40] },
    { key: "close", label: "Close", width: 9, foreground: [10, 10, 20], background: [80, 160, 255] },
  ];
  let repaints = 0;
  const widgets = new ExomuxSettingsWidgets(() => {
    repaints += 1;
  });
  try {
    // The first request has no matching snapshot yet and schedules a render.
    assertEquals(widgets.cellsFor(specs, "background"), undefined);
    assertEquals(widgets.cellsFor(specs, "close"), undefined);

    // Let the off-screen component render settle, then the completed render
    // requests exactly the repaint that will blit the fresh cells.
    for (let attempt = 0; attempt < 50 && repaints === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert(repaints >= 1, "a completed render should request a repaint");

    const background = widgets.cellsFor(specs, "background");
    const close = widgets.cellsFor(specs, "close");
    assert(background, "the background button should have composited cells");
    assert(close, "the close button should have composited cells");
    assertEquals(background.width, 22);
    assertEquals(close.width, 9);
    // A Button fills its whole row, so every cell is painted (styled, non-empty).
    assert(background.cells.every((cell) => cell !== undefined), "the button fills its whole row");
    // The real Button centers its label into the row.
    assert(plainRow(background.cells).includes("Background config"), "the background label renders into the row");
    assert(plainRow(close.cells).includes("Close"), "the close label renders into the row");
  } finally {
    widgets.dispose();
  }
});

Deno.test("Exomux settings button signature changes with theme colours and labels", () => {
  const base: ExomuxSettingsButtonSpec[] = [
    { key: "close", label: "Close", width: 9, foreground: [0, 0, 0], background: [1, 2, 3] },
  ];
  const recolored: ExomuxSettingsButtonSpec[] = [
    { key: "close", label: "Close", width: 9, foreground: [0, 0, 0], background: [9, 9, 9] },
  ];
  const relabeled: ExomuxSettingsButtonSpec[] = [
    { key: "close", label: "Done", width: 9, foreground: [0, 0, 0], background: [1, 2, 3] },
  ];
  assert(exomuxSettingsButtonSignature(base) !== exomuxSettingsButtonSignature(recolored), "colour is part of the key");
  assert(exomuxSettingsButtonSignature(base) !== exomuxSettingsButtonSignature(relabeled), "label is part of the key");
});
