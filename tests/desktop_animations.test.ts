import { assert, assertEquals, assertNotEquals } from "./deps.ts";
import {
  DEFAULT_DESKTOP_ANIMATIONS,
  DESKTOP_ANIMATION_CHOICES,
  desktopAnimationSettings,
  DesktopWindowAnimations,
} from "../examples/web/desktop_animations.ts";
import type { WorkbenchWindowChromeProjection } from "../src/app/workbench_window_host.ts";
import type { Rectangle } from "../src/types.ts";
import type { VizCell } from "../src/viz/render.ts";

type State = "normal" | "closed" | "minimized" | "maximized";
const bounds = { column: 0, row: 1, width: 40, height: 19 };
const rectA = { column: 2, row: 3, width: 16, height: 8 };
const rectB = { column: 9, row: 6, width: 18, height: 8 };
const ink = [10, 20, 30] as const, ground = [30, 40, 50] as const;
function harness() {
  const animations = new DesktopWindowAnimations();
  let paints = 0;
  function render(now: number, a: State = "normal", b: State = "closed", active = "a", aRect: Rectangle = rectA) {
    const frame: VizCell[][] = Array.from(
      { length: 20 },
      () => Array.from({ length: 40 }, () => ({ char: ".", foreground: [1, 2, 3], background: [4, 5, 6] })),
    );
    const states = [{ id: "a", state: a }, { id: "b", state: b }];
    const windows = states.filter((s) => s.state === "normal" || s.state === "maximized")
      .map((s) =>
        ({
          id: s.id,
          state: s.state,
          active: s.id === active,
          rect: s.id === "a" ? aRect : rectB,
        }) as WorkbenchWindowChromeProjection
      )
      .sort((left, right) => Number(left.active) - Number(right.active));
    animations.beginFrame({
      now,
      bounds,
      windows,
      states,
      anchor: () => ({ column: 28, row: 0, width: 8, height: 1 }),
    });
    for (const window of windows) {
      animations.paintWindow(frame, window, () => {
        paints++;
        for (let y = 0; y < window.rect.height; y++) {
          for (let x = 0; x < window.rect.width; x++) {
            frame[window.rect.row + y]![window.rect.column + x] = {
              char: window.id.toUpperCase(),
              foreground: ink,
              background: ground,
            };
          }
        }
      });
    }
    animations.paintOverlays(frame);
    return frame;
  }
  return { animations, render, paints: () => paints };
}
const chars = (frame: VizCell[][]) => frame.map((row) => row.map((cell) => cell.char).join("")).join("\n");

Deno.test("desktop animations start from a clean baseline and fly styled cells to the real taskbar", () => {
  const { animations, render } = harness();
  const initial = render(0);
  assertEquals(animations.status(), []);
  assertEquals(render(10, "minimized"), initial, "outgoing snapshot starts where the eye saw it");
  const middle = render(150, "minimized");
  assertEquals(animations.status()[0]?.transition, "minimize");
  assertNotEquals(chars(middle), chars(initial));
  const cells = middle.flatMap((row, y) => row.map((cell, x) => ({ cell, x, y }))).filter(({ cell }) =>
    cell.char === "A"
  );
  assert(cells.length > 0 && cells.some(({ x, y }) => x >= rectA.column + rectA.width || y < rectA.row));
  assert(cells.every(({ cell }) => JSON.stringify(cell.foreground) === JSON.stringify(ink)));
  assertEquals(middle[0]!.map((cell) => cell.char).join(""), ".".repeat(40), "particles cannot cover taskbar controls");
  assert(!chars(render(500, "minimized")).includes("A"));
  assertEquals(animations.status(), []);
});

Deno.test("open and restored windows paint their live client once but stay hidden until the cells land", () => {
  const { animations, render, paints } = harness();
  render(0);
  const opening = render(10, "normal", "normal", "b");
  assertEquals(animations.status()[0], { id: "b", transition: "open", incoming: true });
  assert(!chars(opening).includes("B"));
  assertEquals(paints(), 3, "hidden incoming content still lays out exactly once");
  assert(chars(render(250, "normal", "normal", "b")).includes("B"));
  assertEquals(animations.status(), []);
  render(300, "normal", "minimized", "a");
  render(700, "normal", "minimized", "a");
  render(710, "normal", "normal", "b");
  assertEquals(animations.status()[0], { id: "b", transition: "restore", incoming: true });
  assert(animations.hides("b"));
  assert(chars(render(850, "normal", "normal", "b")).includes("B"));
  const landed = render(1100, "normal", "normal", "b");
  assertEquals(landed[rectB.row + 2]![rectB.column + 2]!.char, "B");
  assert(!animations.hides("b"));
});

Deno.test("raise reveals the new foreground while lower never paints over it", () => {
  const { animations, render } = harness();
  render(0, "normal", "normal", "b");
  render(10, "normal", "normal", "a");
  assertEquals(animations.status().map((entry) => entry.transition), ["raise", "lower"]);
  const settled = render(500, "normal", "normal", "a");
  assertEquals(settled[rectB.row]![rectB.column]!.char, "A", "new foreground wins the overlapping titlebar");
  assertEquals(animations.status(), []);
});

Deno.test("maximize and unmaximize detach the old geometry without hiding the new window", () => {
  const { animations, render } = harness();
  render(0);
  render(10, "maximized", "closed", "a", bounds);
  assertEquals(animations.status()[0], { id: "a", transition: "maximize", incoming: false });
  const settled = render(500, "maximized", "closed", "a", bounds);
  assertEquals(settled[18]![38]!.char, "A");
  render(510);
  assertEquals(animations.status()[0]?.transition, "maximize");
  assertEquals(render(1000)[18]![38]!.char, ".");
});

Deno.test("all shared effects including random run through the desktop compositor and finish cleanly", () => {
  for (const effect of DESKTOP_ANIMATION_CHOICES) {
    const { animations, render } = harness();
    animations.setSettings({
      ...DEFAULT_DESKTOP_ANIMATIONS,
      kinds: { ...DEFAULT_DESKTOP_ANIMATIONS.kinds, close: effect },
    });
    render(0);
    render(10, "closed");
    assertEquals(animations.status()[0]?.transition, "close", effect);
    render(180, "closed");
    assert(!chars(render(1000, "closed")).includes("A"), effect);
    assertEquals(animations.status(), []);
  }
});

Deno.test("rapid close/reopen replaces old ghosts; dragging an incoming window cancels stale geometry", () => {
  const { animations, render } = harness();
  render(0);
  render(10, "closed");
  render(30);
  assertEquals(animations.status(), [{ id: "a", transition: "open", incoming: true }]);
  const moved = { ...rectA, column: 4 };
  const frame = render(50, "normal", "closed", "a", moved);
  assertEquals(animations.status(), []);
  assertEquals(frame[4]![4]!.char, "A");
  assertEquals(frame[4]![2]!.char, ".");
});

Deno.test("off, preference changes and viewport resize immediately clear ghosts and suppression", () => {
  const { animations, render } = harness();
  render(0);
  render(10, "normal", "normal", "b");
  assert(animations.hides("b"));
  animations.setSettings({ ...DEFAULT_DESKTOP_ANIMATIONS, speed: "off" });
  assertEquals(animations.status(), []);
  assert(chars(render(20, "normal", "normal", "b")).includes("B"));
  render(30, "closed", "normal", "b");
  assertEquals(animations.status(), []);
  animations.setSettings(DEFAULT_DESKTOP_ANIMATIONS);
  render(40, "normal", "normal", "a");
  animations.beginFrame({ now: 50, bounds, windows: [], states: [], anchor: () => undefined, reducedMotion: true });
  assertEquals(animations.status(), []);
  assert(!animations.hides("a"));
  render(60, "normal", "normal", "b");
  animations.resize();
  assertEquals(animations.status(), []);
  render(70, "normal", "normal", "b");
  assertEquals(animations.status(), [], "resizing establishes a clean baseline, not an open animation");
});

Deno.test("invalid persisted choices preserve defaults", () => {
  assertEquals(desktopAnimationSettings(null), DEFAULT_DESKTOP_ANIMATIONS);
  assertEquals(desktopAnimationSettings({ speed: "banana", kinds: { close: "unknown" } }), DEFAULT_DESKTOP_ANIMATIONS);
  assertEquals(desktopAnimationSettings({ speed: "fast", kinds: { minimize: "explode" } }).kinds.minimize, "explode");
});

Deno.test("multi-unit/wide Unicode cells do not shift animation columns or emit broken surrogates", () => {
  const animations = new DesktopWindowAnimations();
  const rect = { column: 2, row: 2, width: 6, height: 1 };
  const window = { id: "a", active: true, rect } as WorkbenchWindowChromeProjection;
  const grid = () => Array.from({ length: 20 }, () => Array.from({ length: 40 }, () => ({ char: "." })));
  const first = grid();
  animations.beginFrame({
    now: 0,
    bounds,
    windows: [window],
    states: [{ id: "a", state: "normal" }],
    anchor: () => undefined,
  });
  animations.paintWindow(first, window, () => {
    ["A", "🌙", "", "界", "é", "Z"].forEach((char, column) => first[2]![column + 2] = { char });
  });
  animations.paintOverlays(first);
  const closed = grid();
  animations.beginFrame({
    now: 10,
    bounds,
    windows: [],
    states: [{ id: "a", state: "closed" }],
    anchor: () => undefined,
  });
  animations.paintOverlays(closed);
  assertEquals(closed[2]!.slice(2, 8).map((cell) => cell.char).join(""), "A....Z");
});
