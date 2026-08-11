// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { type ExomuxOptionControlSpec, ExomuxSettingsOptions } from "../settings_options.ts";

const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
function plain(cells: readonly (string | Uint8Array | undefined)[]): string {
  return cells.map((cell) => (typeof cell === "string" ? cell.replace(SGR, "") : " ")).join("");
}

async function settle(pending: () => boolean, limit = 60) {
  for (let attempt = 0; attempt < limit && pending(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

Deno.test("settings options render Cycler and CheckBox controls to composited cells", async () => {
  let repaints = 0;
  const host = new ExomuxSettingsOptions(() => {
    repaints += 1;
  });
  const specs: ExomuxOptionControlSpec[] = [
    {
      kind: "cycler",
      key: "opacity",
      width: 12,
      foreground: [10, 10, 20],
      background: [30, 40, 70],
      options: ["low", "mid", "high"],
      activeIndex: 1,
    },
    { kind: "checkbox", key: "overgrow", width: 3, foreground: [10, 10, 20], background: [30, 40, 70], checked: true },
  ];
  try {
    // First request has no snapshot; it schedules a render.
    assertEquals(host.cellsFor(specs), [undefined, undefined]);
    await settle(() => repaints === 0);
    assert(repaints >= 1, "a completed render requests a repaint");

    const [cycler, checkbox] = host.cellsFor(specs);
    assert(cycler, "the cycler control has cells");
    assert(checkbox, "the checkbox control has cells");
    const cyclerText = plain(cycler.cells);
    assert(cyclerText.includes("mid"), `cycler shows the active value, saw "${cyclerText}"`);
    assert(cyclerText.includes("<") && cyclerText.includes(">"), "cycler shows its step affordances");
    const checkboxText = plain(checkbox.cells);
    assert(checkboxText.includes("✓"), `checked checkbox shows a check, saw "${checkboxText}"`);

    // Changing a value re-renders: the cycler now shows a different value.
    const moved = specs.map((spec) => (spec.key === "opacity" ? { ...spec, activeIndex: 2 } : spec));
    host.cellsFor(moved);
    await settle(() => !plain(host.cellsFor(moved)[0]?.cells ?? []).includes("high"));
    assert(plain(host.cellsFor(moved)[0]!.cells).includes("high"), "the cycler reflects the new value");
  } finally {
    host.dispose();
  }
});
