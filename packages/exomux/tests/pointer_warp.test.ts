import { assert, assertEquals } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { createExomuxController } from "../controller.ts";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import { FakeExomuxClient } from "./fakes.ts";
import { defaultExomuxShaderConfig, exomuxPincushionSource, type ExomuxShaderConfig } from "../ghostty.ts";

const MAGNITUDE = 0.35;

function pincushionOn(): ExomuxShaderConfig {
  const base = defaultExomuxShaderConfig();
  return {
    ...base,
    effects: {
      ...base.effects,
      pincushion: { enabled: true, params: { magnitude: MAGNITUDE } },
    },
  };
}

/** The pre-fix estimator: floor of the output-cell-center source sample. */
function centerFloorWarp(
  x: number,
  y: number,
  columns: number,
  rows: number,
): { x: number; y: number } {
  const source = exomuxPincushionSource((x + 0.5) / columns, (y + 0.5) / rows, MAGNITUDE);
  return { x: Math.floor(source.u * columns), y: Math.floor(source.v * rows) };
}

/** Source cells the output cell's footprint touches (test-side mirror). */
function footprintCells(
  x: number,
  y: number,
  columns: number,
  rows: number,
): { x: number; y: number }[] {
  const left = exomuxPincushionSource(x / columns, (y + 0.5) / rows, MAGNITUDE);
  const right = exomuxPincushionSource((x + 1) / columns, (y + 0.5) / rows, MAGNITUDE);
  const top = exomuxPincushionSource((x + 0.5) / columns, y / rows, MAGNITUDE);
  const bottom = exomuxPincushionSource((x + 0.5) / columns, (y + 1) / rows, MAGNITUDE);
  const cells: { x: number; y: number }[] = [];
  const u0 = Math.min(left.u, right.u) * columns;
  const u1 = Math.max(left.u, right.u) * columns;
  const v0 = Math.min(top.v, bottom.v) * rows;
  const v1 = Math.max(top.v, bottom.v) * rows;
  for (let column = Math.floor(u0); column <= Math.ceil(u1) - 1; column += 1) {
    for (let row = Math.floor(v0); row <= Math.ceil(v1) - 1; row += 1) {
      cells.push({ x: column, y: row });
    }
  }
  return cells;
}

Deno.test("pincushion presses snap into controls their sub-cell footprint covers", async () => {
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
    controller.shaderConfig.value = pincushionOn();
    await harness.pilot.settle();

    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager, "the sessions window is floating at mount");
    const minimize = manager.controls.find((control) => control.kind === "minimize");
    assert(minimize?.command, "the sessions window exposes a minimize control");

    const columns = 120;
    const rows = 34;
    const hit = (cell: { x: number; y: number }): boolean =>
      cell.x >= minimize.hitRect.column && cell.x < minimize.hitRect.column + minimize.hitRect.width &&
      cell.y >= minimize.hitRect.row && cell.y < minimize.hitRect.row + minimize.hitRect.height;

    // Find an output cell the OLD estimator resolved off-control even though
    // its visual footprint covers the minimize button — the exact miss the
    // user reported. The distorted upper region reliably produces them.
    let forgiving: { x: number; y: number } | undefined;
    for (let y = 0; y < rows && !forgiving; y += 1) {
      for (let x = 0; x < columns && !forgiving; x += 1) {
        const old = centerFloorWarp(x, y, columns, rows);
        if (hit(old)) continue;
        if (footprintCells(x, y, columns, rows).some(hit)) forgiving = { x, y };
      }
    }
    assert(forgiving, "the distortion produces at least one footprint-only cell over the control");

    await harness.pilot.click(forgiving.x, forgiving.y);
    await mounted.whenIdle();
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === manager.id)?.state,
      "minimized",
      "a press whose footprint covers the minimize control activates it",
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
