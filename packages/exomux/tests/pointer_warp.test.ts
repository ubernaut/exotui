import { assert, assertEquals } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { createExomuxController } from "../controller.ts";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import { FakeExomuxClient } from "./fakes.ts";
import { defaultExomuxShaderConfig, type ExomuxShaderConfig } from "../ghostty.ts";
import { exomuxPointerWarpCell } from "../ghostty.ts";

function pincushionOn(magnitude: number): ExomuxShaderConfig {
  const base = defaultExomuxShaderConfig();
  return {
    ...base,
    effects: {
      ...base.effects,
      pincushion: { enabled: true, params: { magnitude } },
    },
  };
}

Deno.test("one warp function: the cursor cell is total, deterministic, and near-identity when subtle", () => {
  const columns = 120;
  const rows = 34;
  for (const magnitude of [0.025, 0.1, 0.35]) {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const first = exomuxPointerWarpCell(x, y, columns, rows, magnitude);
        const second = exomuxPointerWarpCell(x, y, columns, rows, magnitude);
        assertEquals(first, second, "the warp is deterministic");
        assert(first.x >= 0 && first.x < columns && first.y >= 0 && first.y < rows, "the warp stays on-grid");
      }
    }
  }
  // At 2.5% the correction is at most one cell anywhere on screen.
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const cell = exomuxPointerWarpCell(x, y, columns, rows, 0.025);
      assert(Math.abs(cell.x - x) <= 1 && Math.abs(cell.y - y) <= 1, "2.5% shifts by at most one cell");
    }
  }
});

Deno.test("a subtle pincushion keeps row-1 clicks out of the start menu", async () => {
  const previousTermProgram = Deno.env.get("TERM_PROGRAM");
  Deno.env.set("TERM_PROGRAM", "ghostty");
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 120, rows: 34 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    controller.shaderConfig.value = pincushionOn(0.025);
    await harness.pilot.settle();

    // The user's report: cursor visibly on the row below the start button.
    // Wherever the cursor shows row 1, the click must act on row 1.
    for (let column = 0; column <= 12; column += 1) {
      if (exomuxPointerWarpCell(column, 1, 120, 34, 0.025).y !== 1) continue;
      await harness.pilot.click(column, 1);
      await mounted.whenIdle();
      assertEquals(
        controller.startMenuVisible.peek(),
        false,
        `row-1 click at column ${column} leaked into the start menu`,
      );
    }

    // Aiming where the cursor shows the button opens it.
    let onButton: number | undefined;
    for (let column = 0; column <= 12; column += 1) {
      const cell = exomuxPointerWarpCell(column, 0, 120, 34, 0.025);
      if (cell.y === 0 && cell.x <= 12) {
        onButton = column;
        break;
      }
    }
    assert(onButton !== undefined, "some output cell shows the cursor on the start button");
    await harness.pilot.click(onButton, 0);
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), true, "a cursor-on-button click opens the start menu");
  } finally {
    harness.destroy();
    await controller.dispose();
    if (previousTermProgram === undefined) Deno.env.delete("TERM_PROGRAM");
    else Deno.env.set("TERM_PROGRAM", previousTermProgram);
  }
});

Deno.test("cursor-on-control clicks activate the control under strong distortion", async () => {
  const previousTermProgram = Deno.env.get("TERM_PROGRAM");
  Deno.env.set("TERM_PROGRAM", "ghostty");
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 120, rows: 34 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    controller.shaderConfig.value = pincushionOn(0.35);
    await harness.pilot.settle();

    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager, "the sessions window is floating at mount");
    const minimize = manager.controls.find((control) => control.kind === "minimize");
    assert(minimize?.command, "the sessions window exposes a minimize control");

    // Find an output cell where the cursor shows the minimize control, then
    // click it: cursor position drives the behavior, WYSIWYG.
    let press: { x: number; y: number } | undefined;
    for (let y = 0; y < 34 && !press; y += 1) {
      for (let x = 0; x < 120 && !press; x += 1) {
        const cell = exomuxPointerWarpCell(x, y, 120, 34, 0.35);
        if (
          cell.x >= minimize.hitRect.column && cell.x < minimize.hitRect.column + minimize.hitRect.width &&
          cell.y >= minimize.hitRect.row && cell.y < minimize.hitRect.row + minimize.hitRect.height
        ) press = { x, y };
      }
    }
    assert(press, "some output cell puts the cursor on the minimize control");

    await harness.pilot.click(press.x, press.y);
    await mounted.whenIdle();
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === manager.id)?.state,
      "minimized",
      "the cursor-on-control click minimizes",
    );
  } finally {
    harness.destroy();
    await controller.dispose();
    if (previousTermProgram === undefined) Deno.env.delete("TERM_PROGRAM");
    else Deno.env.set("TERM_PROGRAM", previousTermProgram);
  }
});

Deno.test("without the pincushion the pointer pipeline stays raw", async () => {
  const previousTermProgram = Deno.env.get("TERM_PROGRAM");
  Deno.env.delete("TERM_PROGRAM");
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 120, rows: 34 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await harness.pilot.settle();
    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager);
    const minimize = manager.controls.find((control) => control.kind === "minimize");
    assert(minimize);
    await harness.pilot.click(minimize.hitRect.column, minimize.hitRect.row);
    await mounted.whenIdle();
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === manager.id)?.state,
      "minimized",
      "an exact raw click still minimizes with the shader off",
    );
  } finally {
    harness.destroy();
    await controller.dispose();
    if (previousTermProgram !== undefined) Deno.env.set("TERM_PROGRAM", previousTermProgram);
  }
});
