import { assert, assertEquals } from "./deps.ts";
import { createDesktopApp, type DesktopDemo, type DesktopShaderService } from "../examples/web/desktop_app.ts";
import { fontGeneratorDemo } from "../examples/web/desktop_font_generator.ts";
import { browserAudioSource } from "../examples/web/browser_audio_source.ts";
import type { ShellPresenter, ShellPresenterSize } from "../src/app/shell_presenter.ts";
import type { WorkbenchWindowChromeProjection } from "../src/app/workbench_window_host.ts";
import type { PointerInputEvent } from "../src/pointer_input.ts";
import type { KeyPressEvent } from "../src/input_reader/types.ts";
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
interface Hook {
  menu(): { items: { id: string; href?: string }[]; itemRects: (Rectangle | undefined)[]; selected: number };
  context(): { rect: Rectangle; items: { label: string }[] } | undefined;
  alert(): { rect: Rectangle; button: Rectangle } | undefined;
  selection(): string;
}

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
