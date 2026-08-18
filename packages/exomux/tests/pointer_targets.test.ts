import { assert, assertEquals } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { createExomuxController } from "../controller.ts";
import { createExomuxTerminalOptions, type ExomuxAppMount, type ExomuxAppMountRef } from "../app.ts";
import { EXOMUX_START_BUTTON, exomuxMenuQuitRect } from "../desktop_layout.ts";
import {
  buildExomuxPointerModel,
  EXOMUX_POINTER_LAYERS,
  exomuxPointerLabelAt,
  exomuxWindowRegionResolver,
} from "../pointer_targets.ts";
import { buildExomuxHitMap, exomuxModalOpen } from "./hit_map.ts";
import { FakeExomuxClient, session } from "./fakes.ts";

// Phase 3 of plan/todo/040. The desktop is now expressed as ordered pointer
// targets. Nothing dispatches through the model yet — these tests prove it
// answers exactly what the desktop answers today, cell for cell, so Phase 4 can
// hand dispatch over without changing behavior.

async function mountDesktop(size: { columns: number; rows: number }, sessions: ReturnType<typeof session>[]) {
  const client = new FakeExomuxClient(sessions);
  const controller = await createExomuxController({ client, initialSessions: sessions });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size });
  const mounted = mount.current;
  assert(mounted);
  await harness.pilot.settle();
  await mounted.whenIdle();
  const typed = mounted as ExomuxAppMount;
  return {
    controller,
    harness,
    mounted: typed,
    /** The model built from the same frame the hit map describes. */
    model: () => {
      const projection = typed.windowProjection.peek();
      const body = typed.bodyRect.peek();
      return buildExomuxPointerModel({
        body,
        shelf: typed.shelfBounds.peek(),
        startButton: EXOMUX_START_BUTTON,
        quit: exomuxMenuQuitRect(harness.app.tui.rectangle.peek()),
        projection,
        modalOpen: exomuxModalOpen(controller),
        windowRegionAt: exomuxWindowRegionResolver(
          projection,
          (column, row) => controller.windowHost.interactions.hitTest({ column, row }, body),
        ),
      });
    },
    dispose: async () => {
      harness.destroy();
      await controller.dispose();
    },
  };
}

/** Compares the model against the desktop's current answer for every cell. */
function differences(desktop: Awaited<ReturnType<typeof mountDesktop>>): string[] {
  const map = buildExomuxHitMap(desktop.mounted, desktop.controller);
  const model = desktop.model();
  const found: string[] = [];
  for (let row = 0; row < map.rows; row += 1) {
    for (let column = 0; column < map.columns; column += 1) {
      const expected = map.cells[row]![column]!;
      const actual = exomuxPointerLabelAt(model, column, row);
      // The footer row is outside the model's world; the map names it and the
      // model has nothing registered there.
      if (expected === "footer") continue;
      if (expected !== actual) found.push(`(${column},${row}) map=${expected} model=${actual}`);
    }
  }
  return found;
}

Deno.test("the pointer model matches the desktop at rest", async () => {
  const desktop = await mountDesktop({ columns: 100, rows: 30 }, []);
  try {
    assertEquals(differences(desktop).slice(0, 8), []);
  } finally {
    await desktop.dispose();
  }
});

Deno.test("the pointer model matches a floating terminal over a tiled one", async () => {
  const sessions = [session("pt-one", "shell one", 0), session("pt-two", "shell two", 1)];
  const desktop = await mountDesktop({ columns: 100, rows: 30 }, sessions);
  try {
    desktop.controller.windowHost.execute({
      kind: "set-placement",
      id: "terminal-pt-one",
      placement: "floating",
      rect: { column: 20, row: 6, width: 52, height: 16 },
    }, desktop.mounted.bodyRect.peek());
    await desktop.mounted.whenIdle();
    await desktop.harness.pilot.settle();
    assertEquals(differences(desktop).slice(0, 8), []);
  } finally {
    await desktop.dispose();
  }
});

Deno.test("the pointer model matches a phone-sized desktop", async () => {
  const desktop = await mountDesktop({ columns: 44, rows: 26 }, [session("pt-one", "shell one", 0)]);
  try {
    assertEquals(differences(desktop).slice(0, 8), []);
  } finally {
    await desktop.dispose();
  }
});

Deno.test("a modal takes every cell from the model too", async () => {
  const desktop = await mountDesktop({ columns: 60, rows: 20 }, [session("pt-one", "shell one", 0)]);
  try {
    desktop.controller.openHelp();
    await desktop.mounted.whenIdle();
    const model = desktop.model();
    for (const [column, row] of [[0, 0], [30, 10], [59, 19]] as const) {
      assertEquals(exomuxPointerLabelAt(model, column, row), "modal");
    }
  } finally {
    await desktop.dispose();
  }
});

Deno.test("the stack is data: layer order is printable and ordered bottom to top", () => {
  const layers = Object.entries(EXOMUX_POINTER_LAYERS);
  const values = layers.map(([, value]) => value);
  assertEquals([...values].sort((left, right) => left - right), values, "declared bottom to top");
  assertEquals(layers[0]?.[0], "desktop", "the background is the bottom of the stack");
  assertEquals(layers.at(-1)?.[0], "modal", "a modal is the top");
});
