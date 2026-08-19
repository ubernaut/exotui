import { assert, assertEquals } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/exotui/testing";
import { createTestMousePress } from "../../../src/testing/input.ts";
import { createExomuxController } from "../controller.ts";
import { createExomuxTerminalOptions, type ExomuxAppMount, type ExomuxAppMountRef } from "../app.ts";
import { FakeExomuxClient, session } from "./fakes.ts";
import { buildExomuxHitMap, exomuxFirstCellWith, exomuxHitMapCounts, formatExomuxHitMap } from "./hit_map.ts";

// Phase 0 of plan/todo/040. These golden maps are the before-picture the
// pointer refactor has to reproduce: every cell of the desktop, labelled with
// what it resolves to today. A routing change that moves a cell shows up as a
// readable diff instead of as a click that quietly stops working.
//
// Regenerate deliberately with EXOMUX_UPDATE_HIT_MAPS=1, and read the diff.

const FIXTURES = new URL("./fixtures/hit_map/", import.meta.url);

async function goldenMatches(name: string, actual: string): Promise<void> {
  const path = new URL(`${name}.txt`, FIXTURES);
  if (Deno.env.get("EXOMUX_UPDATE_HIT_MAPS") === "1") {
    await Deno.mkdir(FIXTURES, { recursive: true });
    await Deno.writeTextFile(path, actual);
    return;
  }
  let expected: string;
  try {
    expected = await Deno.readTextFile(path);
  } catch {
    throw new Error(`missing hit map golden ${name}; regenerate with EXOMUX_UPDATE_HIT_MAPS=1`);
  }
  if (expected === actual) return;
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const differences: string[] = [];
  for (let line = 0; line < Math.max(expectedLines.length, actualLines.length); line += 1) {
    if (expectedLines[line] === actualLines[line]) continue;
    differences.push(
      `  line ${line}\n    want ${expectedLines[line] ?? "<none>"}\n    got  ${actualLines[line] ?? "<none>"}`,
    );
    if (differences.length >= 6) break;
  }
  throw new Error(`hit map ${name} changed:\n${differences.join("\n")}`);
}

async function mountDesktop(
  size: { columns: number; rows: number },
  sessions: ReturnType<typeof session>[],
) {
  const client = new FakeExomuxClient(sessions);
  const controller = await createExomuxController({ client, initialSessions: sessions });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size });
  const mounted = mount.current;
  assert(mounted);
  await harness.pilot.settle();
  await mounted.whenIdle();
  return {
    controller,
    harness,
    mounted: mounted as ExomuxAppMount,
    map: () => buildExomuxHitMap(mounted as ExomuxAppMount, controller),
    send: async (options: Parameters<typeof createTestMousePress>[0]) => {
      await harness.app.mouse.dispatch(createTestMousePress(options));
      await (mounted as ExomuxAppMount).whenIdle();
    },
    dispose: async () => {
      harness.destroy();
      await controller.dispose();
    },
  };
}

Deno.test("hit map: the desktop at rest", async () => {
  const desktop = await mountDesktop({ columns: 100, rows: 30 }, []);
  try {
    await goldenMatches("desktop-at-rest", formatExomuxHitMap(desktop.map()));
  } finally {
    await desktop.dispose();
  }
});

Deno.test("hit map: a floating terminal over the session manager", async () => {
  const sessions = [session("hm-one", "shell one", 0), session("hm-two", "shell two", 1)];
  const desktop = await mountDesktop({ columns: 100, rows: 30 }, sessions);
  try {
    const body = desktop.mounted.bodyRect.peek();
    desktop.controller.windowHost.execute({
      kind: "set-placement",
      id: "terminal-hm-one",
      placement: "floating",
      rect: { column: 20, row: 6, width: 52, height: 16 },
    }, body);
    await desktop.mounted.whenIdle();
    await desktop.harness.pilot.settle();
    await goldenMatches("floating-terminal", formatExomuxHitMap(desktop.map()));
  } finally {
    await desktop.dispose();
  }
});

Deno.test("hit map: a modal owns every cell", async () => {
  const desktop = await mountDesktop({ columns: 100, rows: 30 }, [session("hm-one", "shell one", 0)]);
  try {
    desktop.controller.openHelp();
    await desktop.mounted.whenIdle();
    const counts = exomuxHitMapCounts(desktop.map());
    assertEquals(counts.size, 1, "a modal leaves exactly one label");
    assertEquals(counts.get("modal"), 100 * 30);
  } finally {
    await desktop.dispose();
  }
});

Deno.test("hit map: a phone-sized desktop", async () => {
  const desktop = await mountDesktop({ columns: 44, rows: 26 }, [session("hm-one", "shell one", 0)]);
  try {
    await goldenMatches("phone", formatExomuxHitMap(desktop.map()));
  } finally {
    await desktop.dispose();
  }
});

// The map is only worth having if its labels mean what they say. These press
// the first cell of each label and check the outcome the label promises.
Deno.test("hit map labels predict what a press actually does", async () => {
  const sessions = [session("hm-one", "shell one", 0)];
  const desktop = await mountDesktop({ columns: 100, rows: 30 }, sessions);
  try {
    const body = desktop.mounted.bodyRect.peek();
    const windowId = "terminal-hm-one";
    const home = { column: 20, row: 6, width: 52, height: 16 };
    const reset = async () => {
      desktop.controller.windowHost.execute({ kind: "restore", id: windowId }, body);
      desktop.controller.windowHost.execute(
        { kind: "set-placement", id: windowId, placement: "floating", rect: home },
        body,
      );
      await desktop.mounted.whenIdle();
      await desktop.harness.pilot.settle();
      // Past the double-click window so each probe stands alone.
      await new Promise((resolve) => setTimeout(resolve, 450));
    };
    const stateOf = (id: string) =>
      desktop.controller.windowHost.controller.inspect().windows.find((window) => window.id === id)?.state;
    const rectOf = (id: string) =>
      desktop.mounted.windowProjection.peek().floatingWindows.find((window) => window.id === id)?.rect;

    await reset();
    const map = desktop.map();

    // A title cell drags the window it names.
    const title = exomuxFirstCellWith(map, `win:${windowId}:title`);
    assert(title, "the map found a draggable title cell");
    const before = rectOf(windowId)!;
    await desktop.send({ x: title.x, y: title.y, button: 0 });
    await desktop.send({ x: title.x + 4, y: title.y + 2, button: 0, drag: true });
    await desktop.send({ x: title.x + 4, y: title.y + 2, button: 0, release: true });
    const moved = rectOf(windowId)!;
    assert(
      moved.column !== before.column || moved.row !== before.row,
      "a cell labelled title moves the window",
    );

    // A control cell runs its control.
    await reset();
    const minimize = exomuxFirstCellWith(desktop.map(), `win:${windowId}:control:minimize`);
    assert(minimize, "the map found the minimize control");
    await desktop.send({ x: minimize.x, y: minimize.y, button: 0 });
    await desktop.send({ x: minimize.x, y: minimize.y, button: 0, release: true });
    assertEquals(stateOf(windowId), "minimized", "a cell labelled minimize minimizes");

    // A desktop cell moves nothing.
    await reset();
    const bare = exomuxFirstCellWith(desktop.map(), "desktop");
    assert(bare, "the map found bare desktop");
    const restingRect = rectOf(windowId)!;
    await desktop.send({ x: bare.x, y: bare.y, button: 0 });
    await desktop.send({ x: bare.x + 3, y: bare.y + 1, button: 0, drag: true });
    await desktop.send({ x: bare.x + 3, y: bare.y + 1, button: 0, release: true });
    assertEquals(rectOf(windowId), restingRect, "a cell labelled desktop drags nothing");
    assertEquals(stateOf(windowId), "normal");
  } finally {
    await desktop.dispose();
  }
});
