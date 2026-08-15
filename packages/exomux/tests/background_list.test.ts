// Copyright 2023 Im-Beast. MIT license.

import { assert } from "./deps.ts";
import { ExomuxBackgroundList } from "../background_list.ts";

const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
function plainRow(list: ExomuxBackgroundList, row: number, width: number): string {
  let text = "";
  for (let column = 0; column < width; column += 1) {
    const cell = list.cellAt(row, column);
    text += typeof cell === "string" ? cell.replace(SGR, "") : " ";
  }
  return text;
}

async function settle(pending: () => boolean, limit = 60) {
  for (let attempt = 0; attempt < limit && pending(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

Deno.test("background list composites a List with cursor and active markers", async () => {
  let repaints = 0;
  const host = new ExomuxBackgroundList(() => {
    repaints += 1;
  });
  const base = {
    width: 24,
    height: 5,
    scrollTop: -1,
    items: ["Geiss", "Flexi", "Martin", "Aderrasi"],
    foreground: [220, 230, 255] as const,
    background: [30, 40, 70] as const,
    selectedForeground: [10, 10, 20] as const,
    selectedBackground: [255, 105, 180] as const,
    scrollbarTrack: [40, 50, 80] as const,
    scrollbarThumb: [120, 130, 160] as const,
  };
  try {
    // Cursor on row 0, active preset on row 2.
    host.sync({ ...base, selectedIndex: 0, activeIndex: 2 });
    await settle(() => !host.ready());
    assert(host.ready(), "the list renders a snapshot");
    assert(repaints >= 1, "a completed render requests a repaint");

    assert(plainRow(host, 0, 24).trimStart().startsWith(">"), "row 0 is the cursor");
    assert(plainRow(host, 2, 24).trimStart().startsWith("·"), "row 2 marks the active preset");
    assert(plainRow(host, 0, 24).includes("Geiss"), "items render");

    // Moving the cursor and the active preset re-renders both markers.
    host.sync({ ...base, selectedIndex: 1, activeIndex: 3 });
    await settle(() => !plainRow(host, 1, 2).includes(">"));
    assert(plainRow(host, 1, 24).trimStart().startsWith(">"), "the cursor moved to row 1");
    assert(plainRow(host, 3, 24).trimStart().startsWith("·"), "the active marker moved to row 3");
  } finally {
    host.dispose();
  }
});
