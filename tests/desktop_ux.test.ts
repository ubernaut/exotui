import { assert, assertEquals } from "./deps.ts";
import { createDesktopApp, type DesktopDemo, type DesktopShaderService } from "../examples/web/desktop_app.ts";
import { fontGeneratorDemo } from "../examples/web/desktop_font_generator.ts";
import { browserAudioSource } from "../examples/web/browser_audio_source.ts";
import type { ShellPresenter, ShellPresenterSize } from "../src/app/shell_presenter.ts";
import type { WorkbenchWindowChromeProjection } from "../src/app/workbench_window_host.ts";
import type { PointerInputEvent } from "../src/pointer_input.ts";
import type { KeyPressEvent, MouseScrollEvent } from "../src/input_reader/types.ts";
import { MemoryStore } from "../src/runtime/storage.ts";
import { glyphTextFont, renderGlyphText } from "../src/content/ascii_fonts.ts";
import { CANVAS_SHADERS } from "../src/web/canvas_shader.ts";
import type { Rectangle } from "../src/types.ts";

function key(value: string, ctrl = false): KeyPressEvent {
  return {
    key: value as KeyPressEvent["key"],
    ctrl,
    meta: false,
    shift: false,
    buffer: new TextEncoder().encode(value),
  };
}
let sequence = 0;
function pointer(kind: "down" | "move" | "up", x: number, y: number, button = 0): PointerInputEvent {
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
    button: kind === "down" ? button : null,
    buttons: kind === "up" ? 0 : 1,
  };
}
function wheel(x: number, y: number, scroll: 1 | -1): MouseScrollEvent {
  return {
    key: "mouse",
    x,
    y,
    movementX: 0,
    movementY: scroll,
    meta: false,
    ctrl: false,
    shift: false,
    buffer: new Uint8Array(),
    drag: false,
    scroll,
  };
}
interface Hook {
  menu(): { items: { id: string; href?: string }[]; itemRects: (Rectangle | undefined)[]; selected: number };
  context(): { rect: Rectangle; items: { label: string }[] } | undefined;
  alert(): { rect: Rectangle; button: Rectangle } | undefined;
  selection(): string;
}

Deno.test("a quick touch swipe coasts briefly, but a pause or new press stops it", async () => {
  const size = { columns: 42, rows: 30 };
  let client!: Rectangle;
  let offset = 0;
  const app = createDesktopApp({
    initialWindow: "touch-coast",
    viewportWidth: () => 390,
    applications: [{
      id: "touch-coast",
      title: "Touch coast",
      summary: "Long document",
      window: { width: 40, height: 28, minWidth: 15, minHeight: 10 },
      render: (width, height) =>
        Array.from({ length: height }, () => Array.from({ length: width }, () => ({ char: " " }))),
      onWheel: (direction) => (offset += direction * 3, true),
      vscroll: () => ({ offset, total: 500 }),
      scrollTo: (row) => {
        offset = row;
      },
    }],
    onWindows: (windows) => client = windows.find((window) => window.id === "touch-coast")!.clientRect,
  });
  await app.init!({ size: () => size, store: () => new MemoryStore() } as unknown as ShellPresenter);
  const frame = (now: number) => app.frame(now, size);
  frame(0);
  const touch = (kind: "down" | "move" | "up", y: number, timestamp: number) =>
    app.pointer!({ ...pointer(kind, client.column + 2, client.row + y), device: "touch", timestamp });
  const swipe = (start: number, hold = 0) => {
    touch("down", 15, start);
    touch("move", 12, start + 20);
    touch("move", 9, start + 40);
    touch("up", 9, start + 45 + hold);
  };
  swipe(100);
  const release = offset;
  assertEquals(release, 6);
  frame(205);
  assert(offset > release, "a flick travels farther after release");
  // The finger lifted at 145. Friction lets a glide keep a third of its speed for 180 ms, so it is still moving
  // 300 ms later, has stopped after 540 ms, and never goes farther than 18 rows.
  frame(445);
  const gliding = offset;
  frame(700);
  assert(offset > gliding, "the coast is still moving 300 ms after the finger lifts");
  assertEquals(offset - release, 17, "a full-speed flick covers 95% of its 18 rows");
  const settled = offset;
  frame(800);
  assertEquals(offset, settled, "the coast has ended");

  swipe(900, 150);
  const paused = offset;
  frame(1200);
  assertEquals(offset, paused, "holding still before release does not fling");

  swipe(1300);
  touch("down", 9, 1360);
  const stopped = offset;
  frame(1500);
  assertEquals(offset, stopped, "a new touch interrupts the coast");
  touch("up", 9, 1510);
});

/**
 * A window that counts wheel ticks, one row per tick, so a test reads the speed straight off the offset. Applications
 * register for the life of the process, so every desktop in a test names its own.
 */
function tickCounter(id: string, counter: { ticks: number }): DesktopDemo {
  return {
    id,
    title: "Ticks",
    summary: "Counts wheel ticks",
    window: { width: 40, height: 20, minWidth: 15, minHeight: 10 },
    render: (width, height) =>
      Array.from({ length: height }, () => Array.from({ length: width }, () => ({ char: " " }))),
    onWheel: (direction) => (counter.ticks += direction, true),
    vscroll: () => ({ offset: Math.max(0, counter.ticks), total: 5000 }),
    scrollTo: (row) => {
      counter.ticks = row;
    },
  };
}

Deno.test("dragging a window to an edge or a corner previews the whole outline of where it will land", async () => {
  const size = { columns: 80, rows: 30 };
  let windows: readonly WorkbenchWindowChromeProjection[] = [];
  const app = createDesktopApp({
    initialWindow: "snap-outline",
    applications: [{
      id: "snap-outline",
      title: "Snap outline",
      summary: "Any window",
      window: { width: 30, height: 12, minWidth: 15, minHeight: 6 },
      render: (width, height) =>
        Array.from({ length: height }, () => Array.from({ length: width }, () => ({ char: " " }))),
    }],
    onWindows: (projected) => windows = projected,
  });
  await app.init!({ size: () => size, store: () => new MemoryStore() } as unknown as ShellPresenter);
  let now = 0;
  const cells = () => app.frame(now += 1000, size);
  cells();
  const title = windows.find((window) => window.id === "snap-outline")!.titleBarRect;
  app.pointer!(pointer("down", title.column + 4, title.row));

  /** Every cell on the edge of `rect` is a border glyph. The drawn pointer covers the one cell it is on. */
  const outlined = (rect: Rectangle, cursor: { x: number; y: number }) => {
    const frame = cells();
    const right = rect.column + rect.width - 1;
    const bottom = rect.row + rect.height - 1;
    const expect = (column: number, row: number, glyph: string) => {
      if (column === cursor.x && row === cursor.y) return;
      assertEquals(frame[row]![column]!.char, glyph, `the preview's edge at column ${column}, row ${row}`);
    };
    expect(rect.column, rect.row, "┌");
    expect(right, rect.row, "┐");
    expect(rect.column, bottom, "└");
    expect(right, bottom, "┘");
    for (let column = rect.column + 1; column < right; column += 1) {
      expect(column, rect.row, "─");
      expect(column, bottom, "─");
    }
    for (let row = rect.row + 1; row < bottom; row += 1) {
      expect(rect.column, row, "│");
      expect(right, row, "│");
    }
    return frame;
  };
  try {
    // The left edge: the left half of everything below the bar, down to the last row.
    app.pointer!(pointer("move", 0, 12));
    outlined({ column: 0, row: 1, width: 40, height: 29 }, { x: 0, y: 12 });
    // The top right corner: one quarter.
    app.pointer!(pointer("move", 79, 2));
    outlined({ column: 40, row: 1, width: 40, height: 15 }, { x: 79, y: 2 });
    // The middle of the bottom edge: the lower half, full width.
    app.pointer!(pointer("move", 40, 29));
    outlined({ column: 0, row: 16, width: 80, height: 14 }, { x: 40, y: 29 });
    // Away from every edge there is nothing to preview.
    app.pointer!(pointer("move", 40, 15));
    const away = cells();
    assert(
      away[1]![0]!.char !== "┌" && away[29]![0]!.char !== "└",
      "the outline goes when the pointer leaves the edge",
    );
  } finally {
    // The desktop is one per process: a gesture left open would fail every test after this one.
    app.pointer!(pointer("move", 40, 15));
    app.pointer!(pointer("up", 40, 15));
  }
});

Deno.test("one wheel event moves two ticks by default; a saved speed makes it one or four", async () => {
  const size = { columns: 100, rows: 34 };
  for (
    const [saved, perEvent] of [[undefined, 2], ["slow", 1], ["medium", 2], ["fast", 4], ["warp", 2]] as const
  ) {
    const counter = { ticks: 0 };
    const id = `ticks-wheel-${saved ?? "unsaved"}`;
    let client!: Rectangle;
    const store = new MemoryStore();
    if (saved) await store.set("settings", { scrollSpeed: saved });
    const app = createDesktopApp({
      initialWindow: id,
      applications: [tickCounter(id, counter)],
      onWindows: (windows) => client = windows.find((window) => window.id === id)!.clientRect,
    });
    await app.init!({ size: () => size, store: () => store } as unknown as ShellPresenter);
    app.frame(0, size);
    app.wheel!(wheel(client.column + 3, client.row + 3, 1));
    assertEquals(counter.ticks, perEvent, `${saved ?? "no saved speed"}: ticks down`);
    app.wheel!(wheel(client.column + 3, client.row + 3, -1));
    app.wheel!(wheel(client.column + 3, client.row + 3, -1));
    assertEquals(counter.ticks, -perEvent, `${saved ?? "no saved speed"}: ticks up`);
    // The desktop itself is not a window: a wheel event outside every client scrolls nothing.
    app.wheel!(wheel(0, size.rows - 1, 1));
    assertEquals(counter.ticks, -perEvent);
  }
});

Deno.test("the settings row steps the scroll speed both ways and the choice is saved", async () => {
  const size = { columns: 100, rows: 34 };
  const store = new MemoryStore<{ scrollSpeed?: string }>();
  // One clock for every desktop in this test: a frame is only composed again when time has moved on.
  let now = 0;
  const open = async (given: MemoryStore<{ scrollSpeed?: string }>) => {
    let client!: Rectangle;
    const app = createDesktopApp({
      initialWindow: "settings",
      onWindows: (windows) => client = windows.find((window) => window.id === "settings")?.clientRect ?? client,
    });
    await app.init!({ size: () => size, store: () => given } as unknown as ShellPresenter);
    const text = () => app.frame(now += 1000, size).map((row) => row.map((cell) => cell.char).join(""));
    // The settings list is longer than its window, so bring the row into view the way a person would.
    const row = () => {
      for (let turns = 0; turns < 40; turns += 1) {
        const lines = text();
        const y = lines.findIndex((line, index) =>
          index >= client.row && index < client.row + client.height && line.includes("scroll speed ◂")
        );
        if (y >= 0) return { y, x: lines[y]!.indexOf("scroll speed ◂"), speed: /speed ◂ (\w+) ▸/.exec(lines[y]!)?.[1] };
        app.wheel!(wheel(client.column + 2, client.row + 2, 1));
      }
      throw new Error("The settings window has no scroll speed row.");
    };
    const click = (x: number, y: number) => {
      app.pointer!(pointer("down", x, y));
      app.pointer!(pointer("up", x, y));
    };
    return { row, click };
  };
  const saved = async () => (await store.get("settings"))?.scrollSpeed;

  const desktop = await open(store);
  const at = desktop.row();
  assertEquals(at.speed, "medium", "medium is the default");
  // Right of the value speeds the wheel up; left of it slows the wheel down. Both clicks land on blank cells of the
  // row, so the drawn pointer never covers the text this test reads.
  const faster = () => desktop.click(at.x + 30, at.y);
  const slower = () => desktop.click(at.x - 1, at.y);
  faster();
  assertEquals(desktop.row().speed, "fast");
  assertEquals(await saved(), "fast");
  faster();
  assertEquals(desktop.row().speed, "slow", "the choices wrap around, as the animation speed does");
  slower();
  assertEquals(desktop.row().speed, "fast");
  slower();
  assertEquals(desktop.row().speed, "medium");
  assertEquals(await saved(), "medium");
  faster();
  // Another desktop on the same store starts from the saved speed, and one with an empty store from the default.
  assertEquals((await open(store)).row().speed, "fast");
  assertEquals((await open(new MemoryStore())).row().speed, "medium");
});

Deno.test("a finger drag keeps content under the finger at every scroll speed", async () => {
  const size = { columns: 42, rows: 30 };
  for (const speed of ["slow", "medium", "fast"]) {
    const counter = { ticks: 0 };
    const id = `ticks-touch-${speed}`;
    let client!: Rectangle;
    const store = new MemoryStore();
    await store.set("settings", { scrollSpeed: speed });
    const app = createDesktopApp({
      initialWindow: id,
      viewportWidth: () => 390,
      reducedMotion: () => true,
      applications: [tickCounter(id, counter)],
      onWindows: (windows) => client = windows.find((window) => window.id === id)!.clientRect,
    });
    await app.init!({ size: () => size, store: () => store } as unknown as ShellPresenter);
    app.frame(0, size);
    const touch = (kind: "down" | "move" | "up", y: number, timestamp: number) =>
      app.pointer!({ ...pointer(kind, client.column + 2, client.row + y), device: "touch", timestamp });
    touch("down", 15, 100);
    touch("move", 9, 400);
    touch("up", 9, 700);
    assertEquals(counter.ticks, 2, `${speed}: six rows of travel are two ticks, whatever the wheel speed`);
  }
});

Deno.test("desktop UX shares focus, selection, menus, alert and exact viewport policies", async () => {
  const hook = () => (globalThis as unknown as { __desktop: Hook }).__desktop;
  let viewportWidth = 1920, level = .02, resets = 0, activations = 0;
  let enabled = ["degauss"];
  const copied: string[] = [], opened: string[] = [];
  let windows: readonly WorkbenchWindowChromeProjection[] = [];
  const size: ShellPresenterSize = { columns: 160, rows: 55 };
  const shader: DesktopShaderService = {
    list: () => [{ id: "degauss", label: "degauss" }],
    enabled: () => enabled,
    setEnabled: (ids) => enabled = [...ids],
    toggle: () => {},
    option: () => .02,
    setOption: () => {},
    magnetism: () => level,
    degauss: () => {
      resets++;
      level = .02;
    },
  };
  const demo = (id: string, threshold: number): DesktopDemo => ({
    id,
    title: id,
    summary: "Native document",
    window: { width: 80, height: 24, minWidth: 25, minHeight: 8, fullscreenBelow: threshold },
    render: (width, height) =>
      Array.from(
        { length: height },
        () => Array.from({ length: width }, (_, x) => ({ char: [..."Copy 🐕 text, not a menu overlay."][x] ?? " " })),
      ),
    onPointerUp: () => {
      assertEquals(windows.find((window) => window.active)?.id, id);
      activations++;
    },
  });
  const app = createDesktopApp({
    initialWindow: "ux-guide",
    viewportWidth: () => viewportWidth,
    shader,
    applications: [demo("ux-guide", 1920), demo("ux-product", 1280)],
    hiddenMenuIds: ["about", "exomonitor", "neon", "viz", "three", "clock", "workbench"],
    menuLinks: Array.from(
      { length: 35 },
      (_, index) => ({
        id: `export-${index}`,
        title: `Export ${index}`,
        summary: "download",
        href: `./export-${index}.md`,
      }),
    ),
    copyText: (text) => {
      copied.push(text);
      return true;
    },
    openExternal: (href) => opened.push(href),
    onWindows: (given) => windows = given,
  });
  const presenter = { size: () => size, store: () => new MemoryStore() } as unknown as ShellPresenter;
  await app.init!(presenter);
  const frame = (now = 1000) => app.frame(now, size);
  frame();
  assertEquals(windows.find((window) => window.id === "ux-guide")!.state, "normal", "1920 is not below 1920");
  viewportWidth = 1919;
  frame();
  assertEquals(windows.find((window) => window.id === "ux-guide")!.state, "maximized");
  viewportWidth = 1280;
  app.openWindow("ux-product");
  frame();
  assertEquals(windows.find((window) => window.id === "ux-product")!.state, "normal", "1280 is not below 1280");
  viewportWidth = 1279;
  app.resize!(size);
  frame();
  assertEquals(windows.find((window) => window.id === "ux-product")!.state, "maximized");
  viewportWidth = 1920;
  app.resize!(size);
  frame();
  const root = windows.find((window) => window.id === "ux-guide")!;
  const front = windows.find((window) => window.id === "ux-product")!;
  let exposed: { x: number; y: number } | undefined;
  for (let y = root.clientRect.row; y < root.clientRect.row + root.clientRect.height; y++) {
    for (let x = root.clientRect.column; x < root.clientRect.column + root.clientRect.width; x++) {
      if (
        x < front.rect.column || x >= front.rect.column + front.rect.width || y < front.rect.row ||
        y >= front.rect.row + front.rect.height
      ) exposed ??= { x, y };
    }
  }
  assert(exposed, "The background document has an exposed client area");
  app.pointer!(pointer("down", exposed.x, exposed.y));
  frame();
  assertEquals(windows.at(-1)!.id, "ux-guide", "Client press raises the background window before release");
  app.pointer!(pointer("up", exposed.x, exposed.y));
  frame();
  assertEquals(activations, 1, "A release activates exactly once, after focus");
  const client = windows.find((window) => window.id === "ux-guide")!.clientRect;
  app.pointer!(pointer("down", client.column, client.row + 3));
  app.pointer!(pointer("move", client.column + 14, client.row + 3));
  frame();
  app.pointer!(pointer("up", client.column + 14, client.row + 3));
  frame();
  assertEquals(activations, 1, "Selection must not activate document links");
  assertEquals(copied, [], "Highlighting does not silently replace the clipboard");
  const selected = hook().selection();
  assert(selected.startsWith("Copy 🐕 text"), "Cell-local selection preserves graphemes");
  app.pointer!(pointer("down", client.column + 5, client.row + 3, 2));
  frame();
  const menu = hook().context()!;
  assertEquals(menu.items[0]!.label, "copy selected text");
  assert(menu.items.some((item) => item.label === "themes"));
  assert(!menu.items.some((item) => item.label.startsWith("next ")));
  app.pointer!(pointer("down", menu.rect.column + 2, menu.rect.row + 1));
  frame();
  assertEquals(copied, [selected], "Copy retains window text, not text from the covering context menu");
  app.pointer!(pointer("down", 2, 0));
  frame();
  for (let index = 0; index < hook().menu().items.length - 1; index++) app.key!(key("down"));
  frame();
  const launcher = hook().menu();
  assert(launcher.itemRects[launcher.selected], "The last launcher item scrolls into view");
  for (const hidden of ["about", "exomonitor", "neon", "viz", "three", "clock", "workbench"]) {
    assert(!launcher.items.some((item) => item.id === hidden));
  }
  app.key!(key("escape"));
  app.pointer!(pointer("down", 2, 0));
  for (let i = 0; i < 36; i++) app.key!(key("down"));
  app.key!(key("return"));
  assertEquals(opened, ["./export-34.md"]);
  frame(1000);
  assertEquals(hook().alert(), undefined);
  level = 1;
  const flashed = frame(1200);
  const alert = hook().alert()!;
  assert(alert);
  assertEquals(alert.rect.column, Math.floor((size.columns - alert.rect.width) / 2));
  assertEquals(alert.rect.row, Math.floor((size.rows - alert.rect.height) / 2));
  const first = flashed[alert.button.row]![alert.button.column]!.background;
  assert(
    JSON.stringify(first) !== JSON.stringify(frame(1800)[alert.button.row]![alert.button.column]!.background),
    "The large button flashes",
  );
  const before = activations;
  app.pointer!(pointer("down", client.column, client.row));
  app.pointer!(pointer("up", client.column, client.row));
  assertEquals(activations, before, "The modal blocks background actions");
  app.pointer!(pointer("down", alert.button.column + 1, alert.button.row + 1));
  frame();
  assertEquals(resets, 1);
  assertEquals(hook().alert(), undefined);
  level = 1;
  frame();
  app.key!(key("return"));
  frame();
  assertEquals(resets, 2, "The alarm can repeat and supports keyboard activation");
});

Deno.test("distortion minimum and default are one tenth of the previous rate", () => {
  const rate = CANVAS_SHADERS.find((shader) => shader.id === "degauss")!.options!.find((option) =>
    option.key === "rate"
  )!;
  assertEquals(rate.min, .02);
  assertEquals(rate.value, .02);
  assertEquals(rate.max, 5);
});

Deno.test("default browser noise is bounded and does not require browser microphone globals", () => {
  const source = browserAudioSource();
  assertEquals(source.source(), "noise");
  assertEquals(source.label(), "noise generator");
  for (const now of [0, 1000, 5000]) {
    const frame = source.frame(now);
    assertEquals(frame.source, "synth");
    assert([...frame.waveform].every((value) => Number.isFinite(value) && Math.abs(value) <= 1));
    assert([...frame.bands].every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  }
  source.useNoise();
  source.close();
});

Deno.test("portable font generator edits text and copies the complete Small output", async () => {
  const copied: string[] = [];
  const demo = fontGeneratorDemo((text) => {
    copied.push(text);
    return true;
  });
  demo.render(90, 23, 0);
  demo.onKey!(key("a", true));
  demo.onKey!(key("Hello world"));
  demo.onKey!(key("c", true));
  await Promise.resolve();
  assertEquals(copied, [renderGlyphText(glyphTextFont("small"), "Hello world", "font").join("\n")]);
});

Deno.test("Small font-default output matches the linked TAAG generator", () => {
  // Independent figlet.js 1.12.0 / full Small.flf oracle, checked 2026-10-04.
  assertEquals(renderGlyphText(glyphTextFont("small"), "Hello", "font").map((row) => row.trimEnd()), [
    "  _  _     _ _",
    " | || |___| | |___",
    " | __ / -_) | / _ \\",
    " |_||_\\___|_|_\\___/",
    "",
  ]);
  assertEquals(renderGlyphText(glyphTextFont("small"), "a b c", "font").map((row) => row.trimEnd()), [
    "         _",
    "  __ _  | |__   __",
    " / _` | | '_ \\ / _|",
    " \\__,_| |_.__/ \\__|",
    "",
  ]);
  assertEquals(glyphTextFont("graffiti").height, 6);
});

Deno.test("saved old default drift migrates once while non-default and versioned choices survive", async () => {
  for (const [savedRate, version, expected] of [[.2, undefined, .02], [.6, undefined, .6], [.2, 2, .2]]) {
    let rate = .02;
    const shader: DesktopShaderService = {
      list: () => [{ id: "degauss", label: "degauss" }],
      enabled: () => ["degauss"],
      setEnabled: () => {},
      toggle: () => {},
      magnetism: () => .02,
      degauss: () => {},
      option: () => rate,
      setOption: (_id, _key, value) => rate = value,
    };
    const store = new MemoryStore();
    await store.set("settings", { shaderTuning: { degauss: { rate: savedRate } }, shaderDefaultsVersion: version });
    const app = createDesktopApp({ shader, initialWindow: "settings" });
    await app.init!({ size: () => ({ columns: 90, rows: 28 }), store: () => store } as unknown as ShellPresenter);
    assertEquals(rate, expected);
  }
});

Deno.test("a document scrollbar seeks without activating the underlying content", async () => {
  let client: Rectangle | undefined;
  let offset = 0, total = 100, activations = 0;
  const size = { columns: 100, rows: 36 };
  const document: DesktopDemo = {
    id: "seek-test",
    title: "Seek test",
    summary: "Scrollable document",
    window: { width: 40, height: 16, minWidth: 20, minHeight: 8 },
    render: () => [],
    vscroll: () => ({ offset, total }),
    scrollTo: (row) => offset = row,
    onPointerUp: () => activations++,
  };
  const app = createDesktopApp({
    initialWindow: document.id,
    applications: [document],
    onWindows: (windows) => client = windows.find((window) => window.id === document.id)?.clientRect,
  });
  await app.init!({ size: () => size, store: () => new MemoryStore() } as unknown as ShellPresenter);
  const frame = () => app.frame(1000, size);
  frame();
  assert(client);
  const right = client.column + client.width - 1;
  const bottom = client.row + client.height - 1;
  const press = (x: number, y: number, device: "mouse" | "touch") => {
    app.pointer!({ ...pointer("down", x, y), device });
    app.pointer!({ ...pointer("up", x, y), device });
    frame();
  };
  press(right, bottom, "mouse");
  assertEquals(offset, total - client.height);
  press(right, client.row, "touch");
  assertEquals(offset, 0);
  assertEquals(activations, 0);
  press(right - 1, client.row, "mouse");
  assertEquals(activations, 1, "the adjacent document cell still handles clicks");
  total = client.height;
  frame();
  press(right, bottom, "mouse");
  assertEquals(activations, 2, "no overflow means no scrollbar hit target");
});
