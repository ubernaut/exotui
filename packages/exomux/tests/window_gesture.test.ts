import { assert, assertEquals } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { createTestMousePress } from "../../../src/testing/input.ts";
import { createExomuxController } from "../controller.ts";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import { FakeExomuxClient } from "./fakes.ts";
import { buildExomuxHitMap } from "./hit_map.ts";

// Regression: releasing a window drag over the top shelf used to be claimed
// by the shelf branch, so the release never reached the window host. The
// gesture stayed active forever and every later window click or drag was
// silently swallowed while the software cursor kept rendering normally.

async function mountApp() {
  const previousTermProgram = Deno.env.get("TERM_PROGRAM");
  Deno.env.set("TERM_PROGRAM", "ghostty");
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 120, rows: 34 } });
  const mounted = mount.current;
  assert(mounted);
  const send = async (options: Parameters<typeof createTestMousePress>[0]) => {
    await harness.app.mouse.dispatch(createTestMousePress(options));
    await mounted.whenIdle();
  };
  const dispose = async () => {
    harness.destroy();
    await controller.dispose();
    if (previousTermProgram === undefined) Deno.env.delete("TERM_PROGRAM");
    else Deno.env.set("TERM_PROGRAM", previousTermProgram);
  };
  return { controller, harness, mounted, send, dispose };
}

Deno.test("a window drag released over the shelf completes instead of wedging the desktop", async () => {
  const { controller, mounted, send, dispose } = await mountApp();
  try {
    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager, "the sessions window floats at mount");
    const rect = manager.rect;

    await send({ x: rect.column + 10, y: rect.row, button: 0 });
    await send({ x: rect.column + 10, y: 1, button: 0, drag: true });
    await send({ x: 30, y: 0, button: 0, drag: true });
    assert(controller.windowHost.inspect().interaction.active, "the move gesture is live mid-drag");
    await send({ x: 30, y: 0, button: 0, release: true });
    assertEquals(
      controller.windowHost.inspect().interaction.active,
      undefined,
      "a release over the shelf still ends the gesture",
    );

    // The desktop stays interactive: a titlebar control click works after.
    const projected = mounted.windowProjection.peek().floatingWindows.find((window) => window.id === manager.id);
    assert(projected);
    const minimize = projected.controls.find((control) => control.kind === "minimize");
    assert(minimize?.command);
    await send({ x: minimize.hitRect.column, y: minimize.hitRect.row, button: 0 });
    await send({ x: minimize.hitRect.column, y: minimize.hitRect.row, button: 0, release: true });
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === manager.id)?.state,
      "minimized",
      "window commands still execute after a shelf release",
    );
  } finally {
    await dispose();
  }
});

Deno.test("a fresh press cancels a stale gesture whose release was lost", async () => {
  const { controller, mounted, send, dispose } = await mountApp();
  try {
    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager);
    const rect = manager.rect;

    // A gesture whose release never arrives (dropped by the terminal).
    await send({ x: rect.column + 10, y: rect.row, button: 0 });
    await send({ x: rect.column + 12, y: rect.row + 2, button: 0, drag: true });
    assert(controller.windowHost.inspect().interaction.active, "the orphaned gesture is active");

    // The next physical press proves the button came back up: it cancels the
    // phantom gesture (rolling the window back) instead of being swallowed.
    await send({ x: rect.column + 5, y: rect.row + 5, button: 0 });
    await send({ x: rect.column + 5, y: rect.row + 5, button: 0, release: true });
    assertEquals(
      controller.windowHost.inspect().interaction.active,
      undefined,
      "the stale gesture is gone",
    );

    // With sanity restored, the desktop is fully interactive again.
    const projected = mounted.windowProjection.peek().floatingWindows.find((window) => window.id === manager.id);
    assert(projected);
    const minimize = projected.controls.find((control) => control.kind === "minimize");
    assert(minimize?.command);
    await send({ x: minimize.hitRect.column, y: minimize.hitRect.row, button: 0 });
    await send({ x: minimize.hitRect.column, y: minimize.hitRect.row, button: 0, release: true });
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === manager.id)?.state,
      "minimized",
      "window commands work again after recovery",
    );
  } finally {
    await dispose();
  }
});

// Regression: double-click-to-maximize used to fire on the second press, so
// the ordinary "click the title bar to focus, then drag it" gesture snapped the
// window full screen instead of moving it — and a maximized window cannot be
// dragged, so the desktop felt like it was ignoring the mouse entirely.

Deno.test("clicking a title bar and then dragging it moves the window", async () => {
  const { controller, mounted, send, dispose } = await mountApp();
  try {
    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager);
    const before = manager.rect;
    const column = before.column + 8;
    const row = before.row;

    // Click to focus.
    await send({ x: column, y: row, button: 0 });
    await send({ x: column, y: row, button: 0, release: true });
    // Then drag immediately — well inside the double-click window.
    await send({ x: column, y: row, button: 0 });
    await send({ x: column + 6, y: row + 3, button: 0, drag: true });
    await send({ x: column + 6, y: row + 3, button: 0, release: true });

    const inspection = controller.windowHost.controller.inspect();
    assertEquals(
      inspection.windows.find((window) => window.id === manager.id)?.state,
      "normal",
      "a drag must not be taken for the second half of a double-click",
    );
    const after = mounted.windowProjection.peek().floatingWindows.find((window) => window.id === manager.id);
    assert(after);
    assert(
      after.rect.column !== before.column || after.rect.row !== before.row,
      "the window follows the drag",
    );
  } finally {
    await dispose();
  }
});

// The block cursor is the pointer, not a picture of it: motion moves it, and a
// button event acts on the cell it is showing. If the terminal's report for a
// press disagrees with the last motion it sent, the cursor wins — the user
// aimed at the block they can see.

Deno.test("a click acts where the block cursor is, not where the press claims", async () => {
  const { controller, mounted, send, dispose } = await mountApp();
  try {
    controller.globalSettings.value = { ...controller.globalSettings.peek(), blockCursor: true };
    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager);
    const minimize = manager.controls.find((control) => control.kind === "minimize");
    assert(minimize?.command);

    // Hover onto the minimize control: the cursor now sits there.
    await send({ x: minimize.hitRect.column, y: minimize.hitRect.row, button: 3 as never, drag: true });

    // The press reports a different cell — bare desktop, far from any window.
    await send({ x: 100, y: 30, button: 0 });
    await send({ x: 100, y: 30, button: 0, release: true });

    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === manager.id)?.state,
      "minimized",
      "the control under the block cursor is what got clicked",
    );
  } finally {
    await dispose();
  }
});

Deno.test("without the block cursor a press uses its own cell", async () => {
  const { controller, mounted, send, dispose } = await mountApp();
  try {
    assertEquals(controller.globalSettings.peek().blockCursor, false, "off by default");
    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager);
    const minimize = manager.controls.find((control) => control.kind === "minimize");
    assert(minimize?.command);

    // A stale hover elsewhere must not capture the click when nothing is drawn.
    await send({ x: 100, y: 30, button: 3 as never, drag: true });
    await send({ x: minimize.hitRect.column, y: minimize.hitRect.row, button: 0 });
    await send({ x: minimize.hitRect.column, y: minimize.hitRect.row, button: 0, release: true });

    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === manager.id)?.state,
      "minimized",
      "the press lands on its own cell",
    );
  } finally {
    await dispose();
  }
});

// Regression: the animated background got first refusal on any cell that was
// not a window's *client* area, which includes every title bar and border. The
// circuit board paints chips across the whole desktop, so a chip behind a title
// bar swallowed the press and the window would not drag.

Deno.test("a background chip behind a title bar does not swallow the drag", async () => {
  const { controller, harness, mounted, send, dispose } = await mountApp();
  try {
    controller.backgroundId.value = "circuit";
    await harness.pilot.settle();
    await mounted.whenIdle();
    for (let frame = 0; frame < 4; frame += 1) await harness.pilot.settle();

    const manager = mounted.windowProjection.peek().floatingWindows.at(-1);
    assert(manager);
    const rect = manager.rect;

    // The whole title row belongs to the window, whatever the board painted
    // behind it. Asking the hit map answers for every cell at once, instead of
    // pressing each one and sleeping past the double-click timer — the reason
    // this test used to take eleven seconds.
    const map = buildExomuxHitMap(mounted, controller);
    const stolen: string[] = [];
    for (let column = rect.column; column < rect.column + rect.width; column += 1) {
      const label = map.cells[rect.row]?.[column] ?? "";
      if (!label.startsWith(`win:${manager.id}:`)) stolen.push(`(${column},${rect.row}) -> ${label}`);
    }
    assertEquals(stolen, [], "no title cell resolves to the background");

    // And one real drag, to prove the map and the pointer still agree.
    const bare = rect.column + 2;
    await send({ x: bare, y: rect.row, button: 0 });
    await send({ x: bare + 5, y: rect.row + 3, button: 0, drag: true });
    await send({ x: bare + 5, y: rect.row + 3, button: 0, release: true });
    const after = mounted.windowProjection.peek().floatingWindows.find((window) => window.id === manager.id);
    assert(after);
    assert(
      after.rect.column !== rect.column || after.rect.row !== rect.row,
      "the window follows a drag over a painted chip",
    );
  } finally {
    await dispose();
  }
});

Deno.test("the background still answers clicks on bare desktop", async () => {
  const { controller, harness, mounted, send, dispose } = await mountApp();
  try {
    controller.backgroundId.value = "circuit";
    await harness.pilot.settle();
    await mounted.whenIdle();
    for (let frame = 0; frame < 4; frame += 1) await harness.pilot.settle();

    // Clear the desktop so every cell below is genuinely bare.
    for (const window of mounted.windowProjection.peek().floatingWindows) {
      controller.windowHost.execute({ kind: "minimize", id: window.id }, mounted.bodyRect.peek());
    }
    await mounted.whenIdle();
    await harness.pilot.settle();

    const body = mounted.bodyRect.peek();
    const before = mounted.metaballFrameRevision();
    for (let row = body.row + 1; row < body.row + body.height - 1; row += 2) {
      for (let column = 2; column < body.width - 2; column += 2) {
        await send({ x: column, y: row, button: 0 });
        await send({ x: column, y: row, button: 0, release: true });
        if (mounted.metaballFrameRevision() > before) return; // a gate answered
      }
    }
    throw new Error("no desktop cell reached the circuit board");
  } finally {
    await dispose();
  }
});
