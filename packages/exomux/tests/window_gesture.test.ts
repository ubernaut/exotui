import { assert, assertEquals } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { createTestMousePress } from "../../../src/testing/input.ts";
import { createExomuxController } from "../controller.ts";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import { FakeExomuxClient } from "./fakes.ts";

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
