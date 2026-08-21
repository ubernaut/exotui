// The exotui desktop, in a browser tab.
//
// A windowing-system demo as the docs landing page: the library's
// WorkbenchWindowHost — the same engine exomux runs on — drives floating
// windows over a cell canvas, and each window's client area is a demo drawn
// through its own honest seam. The host owns focus, dragging, snapping,
// minimize/maximize and the shelf; this file owns painting and the launcher.

import { TextObject, type TextRectangle } from "../../src/canvas/text.ts";
import { Computed, Signal } from "../../src/signals/mod.ts";
import { createWebTui } from "../../src/web/host.ts";
import { createTiledWorkspaceController } from "../../src/layout/tiled_workspace.ts";
import {
  createWorkbenchWindowHostController,
  type WorkbenchWindowChromeProjection,
  type WorkbenchWindowHostProjectionOptions,
} from "../../src/app/workbench_window_host.ts";
import type { PointerInputEvent } from "../../src/pointer_input.ts";
import type { KeyPressEvent } from "../../src/input_reader/types.ts";
import type { Rectangle } from "../../src/types.ts";
import {
  type DataStream,
  drawStream,
  matrixStream,
  scalarStream,
  screenFrame,
  vectorStream,
  VISUALIZATIONS,
  type VizCell,
  type VizFrame,
  volumeStream,
  writeText,
} from "../../src/viz/mod.ts";
import { blitFrame } from "../../src/viz/dashboard.ts";
import { resolveVisualizationTheme } from "../../src/viz/mod.ts";
import { grWizardThemePalettes } from "../../src/grwizard_themes.ts";
import { neonDemosForSection, type NeonSuiteSection, renderNeonSuiteDemo } from "../../app/neon_suite.ts";
import type { NeonDemo } from "../../app/visualizations.ts";
import { createBrowserMonitor } from "./browser_monitor.ts";
import type { ThreeWindowOverlay } from "./desktop_three.ts";
import { ansiLineToCells, hexToRgb } from "./ansi_cells.ts";

type Rgb = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Desktop palette. One hand-picked set; windows carry their own themes.

const DESKTOP = {
  wallpaper: [10, 12, 20] as Rgb,
  wallpaperDot: [22, 26, 42] as Rgb,
  chromeActive: [46, 68, 110] as Rgb,
  chromeIdle: [26, 30, 46] as Rgb,
  chromeText: [226, 232, 244] as Rgb,
  chromeMuted: [130, 138, 158] as Rgb,
  clientGround: [14, 16, 26] as Rgb,
  accent: [127, 214, 255] as Rgb,
  danger: [255, 105, 110] as Rgb,
  shelf: [18, 21, 34] as Rgb,
  menu: [21, 25, 40] as Rgb,
  menuSelected: [40, 58, 96] as Rgb,
} as const;

// ---------------------------------------------------------------------------
// Demo adapters. A demo renders its client area and may take input; the
// desktop never knows what is inside a window.

interface DesktopDemo {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly window: { width: number; height: number; minWidth: number; minHeight: number };
  sample?(now: number): void;
  render(width: number, height: number, now: number): VizFrame;
  onKey?(event: KeyPressEvent): boolean;
  onPointerDown?(column: number, row: number): void;
}

function monitorDemo(): DesktopDemo {
  const monitor = createBrowserMonitor({ header: false });
  return {
    id: "exomonitor",
    title: "exomonitor",
    summary: "Live dashboard: your microphone and JS heap through the viz layer.",
    window: { width: 62, height: 18, minWidth: 24, minHeight: 8 },
    sample: (now) => monitor.sample(now),
    render: (width, height) => monitor.render(width, height),
    onKey(event) {
      if (event.key === "t") {
        monitor.cycleTheme();
        return true;
      }
      return false;
    },
    onPointerDown() {
      void monitor.enableMicrophone();
    },
  };
}

function neonDemo(): DesktopDemo {
  const sections: NeonSuiteSection[] = ["overview", "signals", "control"];
  let sectionIndex = 0;
  let demoIndex = 0;
  let phase = 0;
  const demos = (): NeonDemo[] => neonDemosForSection(sections[sectionIndex]!);
  return {
    id: "neon",
    title: "neon exodus",
    summary: "The neon component suite, one demo at a time.",
    window: { width: 56, height: 17, minWidth: 30, minHeight: 9 },
    sample() {
      phase += 0.05;
    },
    render(width, height) {
      const list = demos();
      const demo = list[demoIndex % list.length]!;
      const body = renderNeonSuiteDemo({ demo, phase, width, height: Math.max(1, height - 1) });
      const frame: VizCell[][] = [];
      const lines = body.body.split("\n");
      for (let row = 0; row < height - 1; row += 1) {
        frame.push(ansiLineToCells(lines[row] ?? "", width, DESKTOP.clientGround));
      }
      const footer: VizCell[] = ansiLineToCells("", width, DESKTOP.shelf);
      frame.push(footer);
      const label = ` ${demo.badge} · ${sections[sectionIndex]} ${demoIndex % list.length + 1}/${list.length} `;
      const hint = "←→ demo · ↑↓ section";
      const labeled = frame[height - 1]!;
      writeCellsText(labeled, 0, label, DESKTOP.chromeText, DESKTOP.shelf);
      writeCellsText(
        labeled,
        Math.max(label.length + 1, width - hint.length - 1),
        hint,
        DESKTOP.chromeMuted,
        DESKTOP.shelf,
      );
      return frame;
    },
    onKey(event) {
      if (event.key === "right") demoIndex += 1;
      else if (event.key === "left") demoIndex = Math.max(0, demoIndex - 1);
      else if (event.key === "down") {
        sectionIndex = (sectionIndex + 1) % sections.length;
        demoIndex = 0;
      } else if (event.key === "up") {
        sectionIndex = (sectionIndex + sections.length - 1) % sections.length;
        demoIndex = 0;
      } else return false;
      return true;
    },
    onPointerDown() {
      demoIndex += 1;
    },
  };
}

function themesDemo(): DesktopDemo {
  let offset = 0;
  return {
    id: "themes",
    title: "theme gallery",
    summary: "The GRWizard theme palettes, resolved through the viz theme layer.",
    window: { width: 46, height: 16, minWidth: 28, minHeight: 7 },
    render(width, height) {
      const frame = clientFrame(width, height);
      const palettes = grWizardThemePalettes;
      for (let row = 0; row < height; row += 1) {
        const palette = palettes[(row + offset) % palettes.length]!;
        const swatch = [palette.bg, palette.surface, palette.accent, palette.warm, palette.success, palette.danger]
          .map(hexToRgb);
        writeCellsText(
          frame[row]!,
          1,
          palette.label.slice(0, Math.max(4, width - 16)),
          DESKTOP.chromeText,
          DESKTOP.clientGround,
        );
        for (let block = 0; block < swatch.length; block += 1) {
          const color = swatch[block];
          if (!color) continue;
          const column = width - 2 - (swatch.length - block) * 2;
          if (column <= 0) continue;
          frame[row]![column] = { char: "█", foreground: color, background: DESKTOP.clientGround };
          frame[row]![column + 1] = { char: "█", foreground: color, background: DESKTOP.clientGround };
        }
      }
      return frame;
    },
    onKey(event) {
      if (event.key === "down") offset += 1;
      else if (event.key === "up") offset = Math.max(0, offset - 1);
      else return false;
      return true;
    },
    onPointerDown() {
      offset += 1;
    },
  };
}

function aboutDemo(): DesktopDemo {
  const lines = [
    "",
    "  exotui — a terminal UI library for Deno,",
    "  and this page is it running in your browser.",
    "",
    "  Every window here is the library's own",
    "  window host, the engine the exomux terminal",
    "  multiplexer runs on. Drag the title bars,",
    "  double-click to maximize, minimize to the",
    "  shelf below.",
    "",
    "  ⏻ demos, bottom left, launches the rest.",
    "",
    "  jsr.io/@ubernaut/exotui",
    "  github.com/ubernaut/exotui",
  ];
  return {
    id: "about",
    title: "welcome",
    summary: "What this page is, and where the library lives.",
    window: { width: 50, height: 16, minWidth: 30, minHeight: 6 },
    render(width, height) {
      const frame = clientFrame(width, height);
      for (let row = 0; row < Math.min(lines.length, height); row += 1) {
        const text = lines[row]!;
        const accent = text.trimStart().startsWith("jsr.io") || text.trimStart().startsWith("github.com");
        writeCellsText(frame[row]!, 0, text, accent ? DESKTOP.accent : DESKTOP.chromeText, DESKTOP.clientGround);
      }
      return frame;
    },
  };
}

function vizCatalogDemo(): DesktopDemo {
  // One stream per data kind, refreshed every tick so temporal renderers have
  // a moving history. The data is a labelled sample — harmonics, not a claim
  // about the machine — the same stance the terminal preview takes.
  const scalar = scalarStream({ capacity: 240 });
  const vector = vectorStream({ capacity: 240 });
  const matrix = matrixStream({ capacity: 60 });
  const volume = volumeStream({ capacity: 8 });
  let step = 0;
  let index = 0;
  const theme = resolveVisualizationTheme({});
  const streamFor = (kind: string): DataStream | undefined => {
    if (kind.startsWith("0d")) return scalar;
    if (kind.startsWith("1d")) return vector;
    if (kind.startsWith("2d")) return matrix;
    if (kind.startsWith("3d")) return volume;
    return undefined;
  };
  return {
    id: "viz",
    title: "visualization catalog",
    summary: `All ${VISUALIZATIONS.length} visualizations, one at a time, on sample data.`,
    window: { width: 52, height: 16, minWidth: 20, minHeight: 6 },
    sample(now) {
      step += 1;
      const wave = 0.5 + 0.45 * Math.sin(step / 19);
      scalar.push(wave as never, now);
      vector.push(
        Array.from({ length: 12 }, (_, band) => 0.5 + 0.5 * Math.sin(step / 13 + band / 1.7)) as never,
        now,
      );
      if (step % 4 === 0) {
        matrix.push(
          Array.from(
            { length: 14 },
            (_, row) =>
              Array.from({ length: 14 }, (_, col) => 0.5 + 0.5 * Math.sin(row / 2.2 + step / 17) * Math.cos(col / 2.6)),
          ) as never,
          now,
        );
        volume.push(
          Array.from({ length: 8 }, (_, plane) =>
            Array.from({ length: 8 }, (_, row) =>
              Array.from(
                { length: 8 },
                (_, col) => Math.max(0, Math.sin(plane / 1.8 + step / 23) * Math.cos(row / 2 - col / 2.4)),
              ))) as never,
          now,
        );
      }
    },
    render(width, height) {
      const list = VISUALIZATIONS;
      const visualization = list[(index % list.length + list.length) % list.length]!;
      const kind = typeof visualization.accepts === "string" ? visualization.accepts : visualization.accepts[0]!;
      const stream = streamFor(kind);
      const frame = clientFrame(width, height);
      const chartHeight = Math.max(1, height - 1);
      if (stream) {
        const chart = drawStream(visualization, stream, { size: { width, height: chartHeight }, theme });
        blitFrame(frame, { column: 0, row: 0 }, chart);
      }
      const footer = frame[height - 1];
      if (footer && height >= 2) {
        for (let column = 0; column < width; column += 1) footer[column] = { char: " ", background: DESKTOP.shelf };
        const at = (index % list.length + list.length) % list.length;
        writeCellsText(
          footer,
          0,
          ` ${visualization.id} · ${kind} · ${at + 1}/${list.length} `,
          DESKTOP.chromeText,
          DESKTOP.shelf,
        );
        const hint = "←→ · sample data";
        writeCellsText(footer, Math.max(0, width - hint.length - 1), hint, DESKTOP.chromeMuted, DESKTOP.shelf);
      }
      return frame;
    },
    onKey(event) {
      if (event.key === "right") index += 1;
      else if (event.key === "left") index -= 1;
      else return false;
      return true;
    },
    onPointerDown() {
      index += 1;
    },
  };
}

function clockDemo(): DesktopDemo {
  const seconds = scalarStream({ capacity: 120 });
  const theme = resolveVisualizationTheme({});
  const dial = VISUALIZATIONS.find((candidate) => candidate.id === "dial");
  return {
    id: "clock",
    title: "clock",
    summary: "The real time of day, through dial and readout.",
    window: { width: 30, height: 10, minWidth: 14, minHeight: 5 },
    sample(now) {
      seconds.push((new Date().getSeconds() / 60) as never, now);
    },
    render(width, height) {
      const frame = clientFrame(width, height);
      if (dial && height >= 3) {
        const chart = drawStream(dial, seconds, {
          size: { width, height: Math.max(1, height - 2) },
          theme,
        });
        blitFrame(frame, { column: 0, row: 0 }, chart);
      }
      const stamp = new Date().toLocaleTimeString();
      const row = Math.max(0, height - 1);
      writeCellsText(
        frame[row]!,
        Math.max(0, Math.floor((width - stamp.length) / 2)),
        stamp,
        DESKTOP.accent,
        DESKTOP.clientGround,
      );
      return frame;
    },
  };
}

// The three-ascii window: the client area is drawn by the lazily loaded
// WebGPU renderer while the window is topmost; this adapter only paints the
// states the renderer cannot ("loading", "unavailable", "focus to render").
type ThreeOverlayState = "idle" | "loading" | "ready" | "unavailable";
let threeOverlay: ThreeWindowOverlay | undefined;
let threeOverlayState: ThreeOverlayState = "idle";

function threeDemo(): DesktopDemo {
  return {
    id: "three",
    title: "three ascii",
    summary: "Three.js through the WebGPU ASCII pipeline. Loads on launch.",
    window: { width: 58, height: 18, minWidth: 28, minHeight: 8 },
    render(width, height) {
      const frame = clientFrame(width, height);
      const message = threeOverlayState === "loading"
        ? "loading three + webgpu…"
        : threeOverlayState === "unavailable"
        ? "webgpu unavailable in this browser"
        : "focus this window to render";
      writeCellsText(
        frame[Math.floor(height / 2)]!,
        Math.max(0, Math.floor((width - message.length) / 2)),
        message,
        DESKTOP.chromeMuted,
        DESKTOP.clientGround,
      );
      if (threeOverlayState === "ready" && height >= 2) {
        const footer = frame[height - 1]!;
        for (let column = 0; column < width; column += 1) footer[column] = { char: " ", background: DESKTOP.shelf };
        writeCellsText(footer, 0, ` ${threeOverlay?.sceneName() ?? ""} `, DESKTOP.chromeText, DESKTOP.shelf);
        const hint = "←→ scene";
        writeCellsText(footer, Math.max(0, width - hint.length - 1), hint, DESKTOP.chromeMuted, DESKTOP.shelf);
      }
      return frame;
    },
    onKey(event) {
      if (!threeOverlay) return false;
      if (event.key === "right") threeOverlay.cycleScene(1);
      else if (event.key === "left") threeOverlay.cycleScene(-1);
      else return false;
      return true;
    },
  };
}

function clientFrame(width: number, height: number): VizCell[][] {
  const frame: VizCell[][] = [];
  for (let row = 0; row < height; row += 1) {
    const cells: VizCell[] = [];
    for (let column = 0; column < width; column += 1) cells.push({ char: " ", background: DESKTOP.clientGround });
    frame.push(cells);
  }
  return frame;
}

function writeCellsText(cells: VizCell[], column: number, text: string, foreground: Rgb, background: Rgb): void {
  for (let at = 0; at < text.length; at += 1) {
    if (column + at < 0 || column + at >= cells.length) continue;
    cells[column + at] = { char: text[at]!, foreground, background };
  }
}

// ---------------------------------------------------------------------------
// Launcher items: the in-window demos plus outward links.

interface LauncherItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly href?: string;
}

const DEMOS: DesktopDemo[] = [
  aboutDemo(),
  monitorDemo(),
  neonDemo(),
  vizCatalogDemo(),
  threeDemo(),
  clockDemo(),
  themesDemo(),
];
const demoById = new Map(DEMOS.map((demo) => [demo.id, demo]));
const LAUNCHER_ITEMS: LauncherItem[] = [
  ...DEMOS.map((demo) => ({ id: demo.id, title: demo.title, summary: demo.summary })),
  {
    id: "workbench",
    title: "api workbench ↗",
    summary: "The interactive API reference, on its own page.",
    href: "./workbench.html",
  },
];

// ---------------------------------------------------------------------------
// Host, window host, and the paint loop.

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app mount element.");

const host = createWebTui({ root, sinkOptions: { cellWidth: 9, cellHeight: 18 } });

const workspace = createTiledWorkspaceController({});
const windowHost = createWorkbenchWindowHostController({
  workspace,
  ownerId: "web-desktop",
  snapDistance: 2,
  snapOnRelease: true,
  historyCapacity: 80,
  compactMode: "auto",
  windows: DEMOS.map((demo, index) => ({
    id: demo.id,
    title: demo.title,
    minWidth: demo.window.minWidth,
    minHeight: demo.window.minHeight,
    state: demo.id === "about" ? "normal" as const : "closed" as const,
    placement: "floating" as const,
    floatingRect: {
      column: 4 + index * 3,
      row: 2 + index * 2,
      width: demo.window.width,
      height: demo.window.height,
    },
  })),
});

const columns = () => host.platform.size.peek().columns;
const rows = () => host.platform.size.peek().rows;
const bodyBounds = (): Rectangle => ({ column: 0, row: 0, width: columns(), height: Math.max(1, rows() - 1) });
const shelfBounds = (): Rectangle => ({ column: 0, row: Math.max(0, rows() - 1), width: columns(), height: 1 });
const projectionOptions = (): WorkbenchWindowHostProjectionOptions => ({
  shelfBounds: shelfBounds(),
  doubleClickMaximizeMs: 400,
});

let launcherOpen = false;
let launcherSelected = 0;

const lineSignals: Signal<string>[] = [];
function ensureLineSignals(): void {
  for (let row = lineSignals.length; row < rows(); row += 1) {
    const signal = new Signal("");
    const rowIndex = row;
    lineSignals.push(signal);
    new TextObject({
      canvas: host.canvas,
      rectangle: new Computed<TextRectangle>(() => ({ column: 0, row: rowIndex, width: columns() })),
      value: signal,
      overwriteRectangle: true,
      multiCodePointSupport: true,
      style: (text) => text,
      zIndex: 1,
    }).draw();
  }
}
ensureLineSignals();

const LAUNCHER_BUTTON = " ⏻ demos ";

function launcherPanelRect(): Rectangle {
  const width = Math.min(46, Math.max(24, columns() - 4));
  const height = Math.min(LAUNCHER_ITEMS.length * 2 + 1, rows() - 3);
  return { column: 1, row: Math.max(0, rows() - 1 - height), width, height };
}

function presentDemoWindow(id: string): void {
  // The host blocks focusing a window another maximized window hides, so a
  // maximized peer steps down first — the same order exomux presents in.
  const maximizedId = windowHost.controller.inspect().maximizedWindowId;
  if (maximizedId && maximizedId !== id) {
    windowHost.execute({ kind: "restore", id: maximizedId }, bodyBounds(), projectionOptions());
  }
  windowHost.execute({ kind: "restore", id }, bodyBounds(), projectionOptions());
  windowHost.execute({ kind: "focus", id }, bodyBounds(), projectionOptions());
}

function activateLauncherItem(item: LauncherItem): void {
  launcherOpen = false;
  if (item.href) {
    globalThis.open(item.href, "_blank", "noopener");
    return;
  }
  if (item.id === "three") void ensureThreeOverlay();
  presentDemoWindow(item.id);
}

/**
 * Loads the WebGPU renderer the first time the three window opens. The
 * specifier is a variable on purpose: esbuild must leave the import for the
 * browser so `three` never enters the landing bundle.
 */
async function ensureThreeOverlay(): Promise<void> {
  if (threeOverlayState !== "idle") return;
  threeOverlayState = "loading";
  try {
    const specifier = "./desktop-three.js";
    const module: typeof import("./desktop_three.ts") = await import(specifier);
    threeOverlay = await module.createThreeWindowOverlay(host.canvas);
    threeOverlayState = threeOverlay ? "ready" : "unavailable";
  } catch {
    threeOverlayState = "unavailable";
  }
}

/**
 * The renderer draws on the shared canvas above the desktop text, so it is
 * only handed a rectangle while nothing could legitimately cover it: its
 * window topmost, not minimized, the launcher closed. Everything else shows
 * the adapter's placeholder instead of a wrong stacking order.
 */
function syncThreeOverlay(): void {
  if (!threeOverlay) return;
  const projection = windowHost.project(bodyBounds(), projectionOptions());
  const top = projection.windows[projection.windows.length - 1];
  const eligible = !launcherOpen && top?.id === "three" && top.state !== "minimized" &&
    top.clientRect.width > 0 && top.clientRect.height > 1;
  if (!eligible) {
    threeOverlay.setRect(null);
    return;
  }
  // The bottom client row stays with the adapter: it is the scene/hint footer.
  const client = top.clientRect;
  threeOverlay.setRect({ column: client.column, row: client.row, width: client.width, height: client.height - 1 });
}

function paintWindow(frame: VizCell[][], window: WorkbenchWindowChromeProjection, now: number): void {
  const demo = demoById.get(window.id);
  // Chrome ground first, so borders the projection reserves are never stale.
  fillRect(frame, window.rect, window.active ? DESKTOP.chromeIdle : DESKTOP.wallpaperDot);
  const bar = window.titleBarRect;
  fillRect(frame, bar, window.active ? DESKTOP.chromeActive : DESKTOP.chromeIdle);
  writeText(frame, bar.column + 1, bar.row, window.title.slice(0, Math.max(0, bar.width - 2)), {
    foreground: window.active ? DESKTOP.chromeText : DESKTOP.chromeMuted,
    background: window.active ? DESKTOP.chromeActive : DESKTOP.chromeIdle,
  });
  for (const control of window.controls) {
    const tone = control.kind === "close" ? DESKTOP.danger : DESKTOP.chromeText;
    writeText(frame, control.rect.column, control.rect.row, control.text, {
      foreground: window.active ? tone : DESKTOP.chromeMuted,
      background: window.active ? DESKTOP.chromeActive : DESKTOP.chromeIdle,
    });
  }
  const client = window.clientRect;
  if (client.width <= 0 || client.height <= 0) return;
  if (demo) {
    blitFrame(frame, { column: client.column, row: client.row }, demo.render(client.width, client.height, now));
  } else {
    fillRect(frame, client, DESKTOP.clientGround);
  }
}

function fillRect(frame: VizCell[][], rect: Rectangle, background: Rgb): void {
  for (let row = rect.row; row < rect.row + rect.height; row += 1) {
    const line = frame[row];
    if (!line) continue;
    for (let column = rect.column; column < rect.column + rect.width; column += 1) {
      if (column < 0 || column >= line.length) continue;
      line[column] = { char: " ", background };
    }
  }
}

function paintShelf(frame: VizCell[][]): void {
  const shelf = shelfBounds();
  fillRect(frame, shelf, DESKTOP.shelf);
  writeText(frame, 0, shelf.row, LAUNCHER_BUTTON, {
    foreground: launcherOpen ? DESKTOP.wallpaper : DESKTOP.accent,
    background: launcherOpen ? DESKTOP.accent : DESKTOP.shelf,
  });
  let column = LAUNCHER_BUTTON.length + 1;
  const projection = windowHost.project(bodyBounds(), projectionOptions());
  for (const item of projection.shelf) {
    const label = ` ${item.title} `;
    if (column + label.length >= columns()) break;
    writeText(frame, column, shelf.row, label, {
      foreground: item.active ? DESKTOP.chromeText : DESKTOP.chromeMuted,
      background: DESKTOP.wallpaperDot,
    });
    column += label.length + 1;
  }
  const hint = "drag titlebars · double-click maximizes";
  if (column + hint.length + 1 < columns()) {
    writeText(frame, columns() - hint.length - 1, shelf.row, hint, {
      foreground: DESKTOP.chromeMuted,
      background: DESKTOP.shelf,
    });
  }
}

function paintLauncher(frame: VizCell[][]): void {
  const rect = launcherPanelRect();
  fillRect(frame, rect, DESKTOP.menu);
  for (let index = 0; index < LAUNCHER_ITEMS.length; index += 1) {
    const item = LAUNCHER_ITEMS[index]!;
    const row = rect.row + 1 + index * 2;
    if (row >= rect.row + rect.height) break;
    const selected = index === launcherSelected;
    if (selected) {
      fillRect(frame, { column: rect.column, row, width: rect.width, height: 1 }, DESKTOP.menuSelected);
      if (row + 1 < rect.row + rect.height) {
        fillRect(frame, { column: rect.column, row: row + 1, width: rect.width, height: 1 }, DESKTOP.menuSelected);
      }
    }
    const ground = selected ? DESKTOP.menuSelected : DESKTOP.menu;
    writeText(frame, rect.column + 1, row, item.title.slice(0, rect.width - 2), {
      foreground: DESKTOP.chromeText,
      background: ground,
    });
    if (row + 1 < rect.row + rect.height) {
      writeText(frame, rect.column + 3, row + 1, item.summary.slice(0, Math.max(0, rect.width - 4)), {
        foreground: DESKTOP.chromeMuted,
        background: ground,
      });
    }
  }
}

const WALLPAPER_THEME = resolveVisualizationTheme({});

function paintDesktop(now: number): void {
  const width = columns();
  const height = rows();
  const frame = screenFrame({ width, height }, WALLPAPER_THEME) as VizCell[][];
  fillRect(frame, { column: 0, row: 0, width, height }, DESKTOP.wallpaper);
  for (let row = 1; row < height; row += 3) {
    for (let column = row % 2 === 0 ? 2 : 4; column < width; column += 6) {
      frame[row]![column] = { char: "·", foreground: DESKTOP.wallpaperDot, background: DESKTOP.wallpaper };
    }
  }
  const projection = windowHost.project(bodyBounds(), projectionOptions());
  for (const window of projection.windows) paintWindow(frame, window, now);
  if (projection.snapPreview) {
    const preview = projection.snapPreview.rect;
    writeText(frame, preview.column, preview.row, "┌".padEnd(Math.max(1, preview.width - 1), "─") + "┐", {
      foreground: DESKTOP.accent,
      background: DESKTOP.wallpaper,
    });
  }
  paintShelf(frame);
  if (launcherOpen) paintLauncher(frame);
  for (let row = 0; row < height; row += 1) {
    let line = "";
    let current = "";
    for (const cell of frame[row] ?? []) {
      const style = `${cell.foreground?.join(",") ?? ""}|${cell.background?.join(",") ?? ""}`;
      if (style !== current) {
        current = style;
        line += "\x1b[0m";
        if (cell.foreground) line += `\x1b[38;2;${cell.foreground.join(";")}m`;
        if (cell.background) line += `\x1b[48;2;${cell.background.join(";")}m`;
      }
      line += cell.char;
    }
    if (lineSignals[row]) lineSignals[row]!.value = `${line}\x1b[0m`;
  }
  for (let row = height; row < lineSignals.length; row += 1) lineSignals[row]!.value = "";
}

function tick(now: number): void {
  for (const demo of DEMOS) demo.sample?.(now);
  paintDesktop(now);
  syncThreeOverlay();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Input.

function contains(rect: Rectangle, column: number, row: number): boolean {
  return column >= rect.column && column < rect.column + rect.width &&
    row >= rect.row && row < rect.row + rect.height;
}

function activeDemoWindow(): WorkbenchWindowChromeProjection | undefined {
  const projection = windowHost.project(bodyBounds(), projectionOptions());
  return projection.windows.find((window) => window.active);
}

host.on("pointerInput", (event: PointerInputEvent) => {
  const cell = event.coordinates.cell;
  if (!cell) return;
  const { x, y } = cell;
  if (event.kind === "down") {
    if (launcherOpen) {
      const rect = launcherPanelRect();
      if (contains(rect, x, y)) {
        const index = Math.floor((y - rect.row - 1) / 2);
        const item = LAUNCHER_ITEMS[index];
        if (item) activateLauncherItem(item);
      } else launcherOpen = false;
      return;
    }
    const shelf = shelfBounds();
    if (y === shelf.row) {
      if (x < LAUNCHER_BUTTON.length) {
        launcherOpen = true;
        launcherSelected = 0;
        return;
      }
      // Shelf item labels are laid out left to right in paint order; recompute
      // the same layout to hit-test them.
      let column = LAUNCHER_BUTTON.length + 1;
      const projection = windowHost.project(bodyBounds(), projectionOptions());
      for (const item of projection.shelf) {
        const label = ` ${item.title} `;
        if (x >= column && x < column + label.length) {
          windowHost.execute(item.command, bodyBounds(), projectionOptions());
          windowHost.execute({ kind: "focus", id: item.id }, bodyBounds(), projectionOptions());
          return;
        }
        column += label.length + 1;
      }
      return;
    }
  }
  const result = windowHost.handlePointer(event, bodyBounds(), projectionOptions());
  if (event.kind === "down") {
    const window = activeDemoWindow();
    if (window && contains(window.clientRect, x, y) && !result.command) {
      demoById.get(window.id)?.onPointerDown?.(x - window.clientRect.column, y - window.clientRect.row);
    }
  }
});

host.on("keyPress", (event: KeyPressEvent) => {
  if (launcherOpen) {
    if (event.key === "escape") launcherOpen = false;
    else if (event.key === "down") launcherSelected = (launcherSelected + 1) % LAUNCHER_ITEMS.length;
    else if (event.key === "up") {
      launcherSelected = (launcherSelected + LAUNCHER_ITEMS.length - 1) % LAUNCHER_ITEMS.length;
    } else if (event.key === "return") {
      const item = LAUNCHER_ITEMS[launcherSelected];
      if (item) activateLauncherItem(item);
    }
    return;
  }
  const window = activeDemoWindow();
  if (window && demoById.get(window.id)?.onKey?.(event)) return;
  if (event.key === "tab") {
    windowHost.execute({ kind: "focus-next", direction: event.shift ? -1 : 1 }, bodyBounds(), projectionOptions());
  }
});

host.platform.size.subscribe(() => {
  ensureLineSignals();
});

host.start();
