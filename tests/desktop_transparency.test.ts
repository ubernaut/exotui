import { assert, assertEquals } from "./deps.ts";
import { createDesktopApp, type DesktopDemo } from "../examples/web/desktop_app.ts";
import type { ShellPresenter } from "../src/app/shell_presenter.ts";
import type { WorkbenchWindowChromeProjection } from "../src/app/workbench_window_host.ts";
import type { PointerInputEvent } from "../src/pointer_input.ts";
import { MemoryStore } from "../src/runtime/storage.ts";
import { shellCellImpression } from "../src/app/workbench_shell.ts";

Deno.test("shared Exomux impression preserves blank grounds and exact shade/ordinary ink coverage", () => {
  const foreground = [200, 100, 80] as const, ground = [0, 20, 40] as const;
  assertEquals(shellCellImpression(" ", foreground, ground), ground);
  assertEquals(shellCellImpression("", foreground, ground), ground);
  assertEquals(shellCellImpression("A", undefined, ground), ground);
  assertEquals(shellCellImpression("░", foreground, ground), [50, 40, 50]);
  assertEquals(shellCellImpression("▒", foreground, ground), [100, 60, 60]);
  assertEquals(shellCellImpression("▓", foreground, ground), [150, 80, 70]);
  assertEquals(shellCellImpression("█", foreground, ground), foreground);
  assertEquals(shellCellImpression("A", foreground, ground), [110, 64, 62]);
  assertEquals(shellCellImpression("─", foreground, ground), [110, 64, 62]);
});

let sequence = 0, fixture = 0;
let closeFixture = () => {};
function pointer(kind: "down" | "move" | "up", x: number, y: number): PointerInputEvent {
  return {
    schemaVersion: 1,
    sequence: ++sequence,
    timestamp: sequence * 1000,
    source: "test",
    trust: "synthetic",
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    pointerId: 1,
    device: "mouse",
    kind,
    coordinates: { cell: { space: "cell", x, y } },
    primary: true,
    button: kind === "down" ? 0 : null,
    buttons: kind === "up" ? 0 : 1,
  };
}
async function setup(opacity: number) {
  // The example desktop deliberately shares its window host. Close the previous
  // fixture through real chrome input, or its glass changes the next underlay.
  closeFixture();
  const prefix = `glass-${++fixture}-`, ids = [prefix + "under", prefix + "over", prefix + "top"];
  const colors = [[200, 20, 40], [20, 40, 200], [20, 200, 40]] as const;
  const store = new MemoryStore();
  await store.set("settings", { themeId: "section9", wallpaper: "plain", windowOpacity: opacity });
  let windows: readonly WorkbenchWindowChromeProjection[] = [];
  const applications: DesktopDemo[] = ids.map((id, index) => ({
    id,
    title: id,
    summary: "Styled glass fixture",
    window: { width: 60, height: 18, minWidth: 20, minHeight: 8 },
    render: (width, height) =>
      Array.from({ length: height }, () =>
        Array.from({ length: width }, () => ({
          char: index === 0 ? "A" : " ",
          foreground: [220, 60, 80],
          background: colors[index]!,
        }))),
  }));
  const size = { columns: 100, rows: 40 };
  const app = createDesktopApp({
    applications,
    initialWindow: ids[0],
    reducedMotion: () => true,
    onWindows: (given) => windows = given,
  });
  await app.init!({ size: () => size, store: () => store } as unknown as ShellPresenter);
  const frame = () => app.frame(1000, size);
  frame();
  closeFixture = () => {
    for (const window of [...windows].reverse()) {
      const close = window.controls.find((control) => control.kind === "close")!.rect;
      app.pointer!(pointer("down", close.column + 1, close.row));
      app.pointer!(pointer("up", close.column + 1, close.row));
      frame();
    }
  };
  const open = (index: number) => {
    app.openWindow(ids[index]!);
    return frame();
  };
  const window = (index: number) => windows.find((w) => w.id === ids[index])!;
  return { app, frame, open, window };
}

Deno.test("portable glass recursively composites three windows against lower ink, never itself or wallpaper only", async () => {
  const { frame, open, window } = await setup(.65);
  open(1);
  const output = open(2);
  const x = Math.max(...[0, 1, 2].map((i) => window(i).clientRect.column)) + 2;
  const y = Math.max(...[0, 1, 2].map((i) => window(i).clientRect.row)) + 2;
  for (const i of [0, 1, 2]) {
    assert(
      x < window(i).clientRect.column + window(i).clientRect.width &&
        y < window(i).clientRect.row + window(i).clientRect.height,
    );
  }
  // Section9 wallpaper [3,17,22] -> lower red ground [131,19,34]
  // -> 55% lower A ink [180,42,59] -> middle blue [76,41,151]
  // -> upper green [40,144,79]. Upper blanks carry no ink impression.
  assertEquals(output[y]![x]!.background, [40, 144, 79]);
  assertEquals(output[y]![x]!.char, " ", "lower text must not leak into upper text/copy semantics");
  assertEquals(frame()[y]![x]!.background, [40, 144, 79], "frames must not accumulate their own alpha deposits");
});

Deno.test("solid windows remain exact and exclude every lower-layer impression", async () => {
  const { open, window } = await setup(1);
  open(1);
  const output = open(2), target = window(2).clientRect;
  assertEquals(output[target.row + 2]![target.column + 2]!.background, [20, 200, 40]);
});

Deno.test("moving a floating window resamples its actual lower scene", async () => {
  const { app, frame, open, window } = await setup(.65);
  open(1);
  const before = window(1);
  app.pointer!(pointer("down", before.rect.column + 4, before.rect.row));
  app.pointer!(pointer("move", 0, before.rect.row));
  app.pointer!(pointer("up", 0, before.rect.row));
  const output = frame();
  assertEquals(window(1).rect.column, 0, "the native drag clamps to the left viewport edge");
  const x = window(0).clientRect.column + 3, y = Math.max(window(0).clientRect.row, window(1).clientRect.row) + 2;
  for (const i of [0, 1]) {
    const client = window(i).clientRect;
    assert(x >= client.column && x < client.column + client.width && y >= client.row && y < client.row + client.height);
  }
  assertEquals(output[y]![x]!.background, [76, 41, 151]);
});
