// The exotui desktop, in a browser tab.
//
// A windowing-system demo as the docs landing page: the library's
// WorkbenchWindowHost — the same engine exomux runs on — drives floating
// windows over a cell canvas, and each window's client area is a demo drawn
// through its own honest seam. The host owns focus, dragging, snapping,
// minimize/maximize and the shelf; this file owns painting and the start menu.

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
import {
  paintShellMenuPanel,
  paintShellSwitcher,
  paintShellTabStrip,
  paintShellWindowChrome,
  type ShellSurface,
  type ShellTabRect,
  solidGround,
} from "../../src/app/workbench_shell.ts";

type Rgb = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Desktop palette. One hand-picked set; windows carry their own themes.

interface DesktopTheme {
  wallpaper: Rgb;
  wallpaperDot: Rgb;
  chromeActive: Rgb;
  chromeIdle: Rgb;
  chromeText: Rgb;
  chromeMuted: Rgb;
  clientGround: Rgb;
  accent: Rgb;
  danger: Rgb;
  shelf: Rgb;
  menu: Rgb;
  menuSelected: Rgb;
}

const DEFAULT_DESKTOP: DesktopTheme = {
  wallpaper: [10, 12, 20],
  wallpaperDot: [22, 26, 42],
  chromeActive: [46, 68, 110],
  chromeIdle: [26, 30, 46],
  chromeText: [226, 232, 244],
  chromeMuted: [130, 138, 158],
  clientGround: [14, 16, 26],
  accent: [127, 214, 255],
  danger: [255, 105, 110],
  shelf: [18, 21, 34],
  menu: [21, 25, 40],
  menuSelected: [40, 58, 96],
};

let DESKTOP: DesktopTheme = DEFAULT_DESKTOP;

/** Applies a GRWizard palette to the desktop chrome — the theme gallery's click. */
function applyDesktopPalette(palette: (typeof grWizardThemePalettes)[number]): void {
  const pick = (hex: string, spare: Rgb): Rgb => hexToRgb(hex) ?? spare;
  DESKTOP = {
    wallpaper: pick(palette.bg, DEFAULT_DESKTOP.wallpaper),
    wallpaperDot: pick(palette.border, DEFAULT_DESKTOP.wallpaperDot),
    chromeActive: pick(palette.accentDeep, DEFAULT_DESKTOP.chromeActive),
    chromeIdle: pick(palette.panel, DEFAULT_DESKTOP.chromeIdle),
    chromeText: pick(palette.text, DEFAULT_DESKTOP.chromeText),
    chromeMuted: pick(palette.textMuted, DEFAULT_DESKTOP.chromeMuted),
    clientGround: pick(palette.bgAlt, DEFAULT_DESKTOP.clientGround),
    accent: pick(palette.accent, DEFAULT_DESKTOP.accent),
    danger: pick(palette.danger, DEFAULT_DESKTOP.danger),
    shelf: pick(palette.panel, DEFAULT_DESKTOP.shelf),
    menu: pick(palette.panelAlt, DEFAULT_DESKTOP.menu),
    menuSelected: pick(palette.accentDeep, DEFAULT_DESKTOP.menuSelected),
  };
}

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
    onPointerDown(_, row) {
      // A click on a row applies that palette to the desktop chrome itself.
      const palette = grWizardThemePalettes[(row + offset) % grWizardThemePalettes.length];
      if (palette) applyDesktopPalette(palette);
    },
  };
}

const WALLPAPER_STYLES: readonly { readonly id: WallpaperStyle; readonly label: string }[] = [
  { id: "dots", label: "dots — a quiet grid of marks" },
  { id: "plain", label: "plain — nothing but the colour" },
  { id: "grid", label: "grid — faint rules every few cells" },
  { id: "drift", label: "drift — the dots, slowly breathing" },
];

function settingsDemo(): DesktopDemo {
  // Rows are laid out by the same function that hit-tests them.
  interface SettingsRow {
    readonly label: () => string;
    readonly action: () => void;
    readonly heading?: boolean;
  }
  const rowsOf = (): SettingsRow[] => [
    { label: () => "THEME", heading: true, action: () => {} },
    {
      label: () => `  open the theme gallery — click a palette to apply`,
      action: () => presentDemoWindow("themes"),
    },
    { label: () => "", action: () => {} },
    { label: () => "BACKGROUND", heading: true, action: () => {} },
    ...WALLPAPER_STYLES.map((style) => ({
      label: () => `  ${desktopSettings.wallpaper === style.id ? "●" : "○"} ${style.label}`,
      action: () => {
        desktopSettings.wallpaper = style.id;
      },
    })),
    { label: () => "", action: () => {} },
    { label: () => "BAR", heading: true, action: () => {} },
    {
      label: () => `  ${desktopSettings.barHints ? "●" : "○"} show the key hints`,
      action: () => {
        desktopSettings.barHints = !desktopSettings.barHints;
      },
    },
    { label: () => "", action: () => {} },
    { label: () => "WINDOWS", heading: true, action: () => {} },
    {
      label: () => "  recover off-screen windows",
      action: () => {
        windowHost.execute({ kind: "recover-all" }, bodyBounds(), projectionOptions());
      },
    },
  ];
  return {
    id: "settings",
    title: "settings",
    summary: "Desktop settings: theme, background, the bar.",
    window: { width: 48, height: 17, minWidth: 26, minHeight: 8 },
    render(width, height) {
      const frame = clientFrame(width, height);
      const rows = rowsOf();
      for (let row = 0; row < Math.min(rows.length, height); row += 1) {
        const entry = rows[row]!;
        writeCellsText(
          frame[row]!,
          1,
          entry.label().slice(0, Math.max(0, width - 2)),
          entry.heading ? DESKTOP.accent : DESKTOP.chromeText,
          DESKTOP.clientGround,
        );
      }
      return frame;
    },
    onPointerDown(_, row) {
      rowsOf()[row]?.action();
    },
  };
}

function helpDemo(): DesktopDemo {
  const lines = [
    "",
    "  DESKTOP",
    "    drag a title bar        move a window",
    "    drag to an edge         snap it there",
    "    double-click the title  maximize / restore",
    "    g                       float <-> tile",
    "    tab                     window switcher",
    "    esc                     close menu / switcher",
    "",
    "  IN A WINDOW",
    "    exomonitor   click for mic · t theme",
    "    neon         arrows change demo and section",
    "    catalog      arrows walk the renderers",
    "    gallery      click a palette to retheme",
    "    three        arrows change the scene",
  ];
  return {
    id: "help",
    title: "help",
    summary: "Every key and click the desktop answers to.",
    window: { width: 52, height: 17, minWidth: 30, minHeight: 8 },
    render(width, height) {
      const frame = clientFrame(width, height);
      for (let row = 0; row < Math.min(lines.length, height); row += 1) {
        const text = lines[row]!;
        const heading = text.trim() === text.trim().toUpperCase() && text.trim().length > 0;
        writeCellsText(frame[row]!, 0, text, heading ? DESKTOP.accent : DESKTOP.chromeText, DESKTOP.clientGround);
      }
      return frame;
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
    "  ⏻ start, bottom left, launches the rest.",
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
        groundCells(frame, DESKTOP.clientGround);
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
        groundCells(frame, DESKTOP.clientGround);
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

/**
 * Gives every groundless cell an explicit background. The viz layer leaves
 * unpainted cells transparent so terminal compositors can blend behind them;
 * a browser canvas repaints in place, and a transparent cell there means the
 * previous frame survives — the smear the psychograph made obvious.
 */
function groundCells(frame: VizCell[][], ground: Rgb): void {
  for (const row of frame) {
    for (let column = 0; column < row.length; column += 1) {
      const cell = row[column]!;
      if (cell.background === undefined) {
        row[column] = { char: cell.char, foreground: cell.foreground, background: ground };
      }
    }
  }
}

const THIN_GLYPHS = {
  topLeft: "┌",
  top: "─",
  topRight: "┐",
  left: "│",
  right: "│",
  bottomLeft: "└",
  bottom: "─",
  bottomRight: "┘",
} as const;

/** The shell paints through this into the composed cell grid, clipped. */
function frameSurface(frame: VizCell[][]): ShellSurface {
  const put = (column: number, row: number, char: string, style: { foreground?: Rgb; background?: Rgb }) => {
    const line = frame[row];
    if (!line || column < 0 || column >= line.length) return;
    line[column] = { char, foreground: style.foreground, background: style.background };
  };
  return {
    cell: put,
    write(column, row, text, style) {
      const glyphs = [...text];
      for (let index = 0; index < glyphs.length; index += 1) put(column + index, row, glyphs[index]!, style);
    },
    fill(rect, char, style) {
      for (let row = rect.row; row < rect.row + rect.height; row += 1) {
        for (let column = rect.column; column < rect.column + rect.width; column += 1) put(column, row, char, style);
      }
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
// Start-menu items: the in-window demos plus outward links.

interface StartMenuItem {
  readonly id: string;
  readonly glyph: string;
  readonly title: string;
  readonly summary: string;
  readonly href?: string;
  readonly separatorBefore?: boolean;
}

const DEMOS: DesktopDemo[] = [
  aboutDemo(),
  monitorDemo(),
  neonDemo(),
  vizCatalogDemo(),
  threeDemo(),
  clockDemo(),
  themesDemo(),
  settingsDemo(),
  helpDemo(),
];
const demoById = new Map(DEMOS.map((demo) => [demo.id, demo]));
const DEMO_GLYPHS: Record<string, string> = {
  about: "◆",
  exomonitor: "▁▄▂▇",
  neon: "░▒▓",
  viz: "◫",
  three: "◱",
  clock: "◔",
  themes: "▤",
  settings: "⚙",
  help: "?",
};
/** Settings and Help sit below the apps with a rule above, exomux's order. */
const START_MENU_SEPARATED = new Set(["settings", "workbench"]);
const START_MENU_ITEMS: StartMenuItem[] = [
  ...DEMOS.map((demo) => ({
    id: demo.id,
    glyph: DEMO_GLYPHS[demo.id] ?? "·",
    title: demo.title,
    summary: demo.summary,
    separatorBefore: START_MENU_SEPARATED.has(demo.id),
  })),
  {
    id: "workbench",
    glyph: "↗",
    title: "api workbench",
    summary: "The interactive API reference, on its own page.",
    href: "./workbench.html",
    separatorBefore: true,
  },
  {
    id: "jsr",
    glyph: "↗",
    title: "jsr.io/@ubernaut/exotui",
    summary: "The package this desktop is built from.",
    href: "https://jsr.io/@ubernaut/exotui",
  },
  {
    id: "github",
    glyph: "↗",
    title: "github.com/ubernaut/exotui",
    summary: "Source, issues, and the plan directory.",
    href: "https://github.com/ubernaut/exotui",
  },
];

// ---------------------------------------------------------------------------
// Host, window host, and the paint loop.

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app mount element.");

const host = createWebTui({
  root,
  sinkOptions: { cellWidth: 9, cellHeight: 18, font: "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
});

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
// The bar is at the top, where exomux keeps its; windows live below it.
const bodyBounds = (): Rectangle => ({ column: 0, row: 1, width: columns(), height: Math.max(1, rows() - 1) });
const barBounds = (): Rectangle => ({ column: 0, row: 0, width: columns(), height: 1 });
const projectionOptions = (): WorkbenchWindowHostProjectionOptions => ({
  shelfBounds: barBounds(),
  doubleClickMaximizeMs: 400,
});

/** Desktop-wide settings the settings window edits and the painter honors. */
type WallpaperStyle = "dots" | "plain" | "grid" | "drift";
const desktopSettings = {
  wallpaper: "dots" as WallpaperStyle,
  barHints: true,
};

/**
 * The phone question, answered the way exomux answers it: below this there is
 * no room for floating windows, so one maximized window owns the body and the
 * rest wait in the shelf. The threshold is exomux's, kept for the same reason.
 */
const mobileLayout = (): boolean => columns() < 72 || rows() < 20;

let startMenuOpen = false;
let startMenuSelected = 0;

interface StartMenuLayout {
  readonly rect: Rectangle;
  /** Row rects by item index; a hidden item (no room) has none. */
  readonly itemRects: (Rectangle | undefined)[];
  /** Rows per item: 2 with a summary line, 1 without. */
  readonly dense: boolean;
}

function startMenuLayout(): StartMenuLayout {
  const mobile = mobileLayout();
  const width = mobile ? columns() : Math.min(46, Math.max(24, columns() - 4));
  const rowsPerItem = mobile || rows() < START_MENU_ITEMS.length * 2 + 6 ? 1 : 2;
  let needed = 2; // header + footer hint
  for (const item of START_MENU_ITEMS) needed += rowsPerItem + (item.separatorBefore ? 1 : 0);
  const height = Math.min(needed, rows() - 2);
  const rect: Rectangle = { column: mobile ? 0 : 1, row: 1, width, height };
  const itemRects: (Rectangle | undefined)[] = [];
  let row = rect.row + 1;
  const limit = rect.row + rect.height - 1;
  for (const item of START_MENU_ITEMS) {
    if (item.separatorBefore) row += 1;
    itemRects.push(
      row + rowsPerItem <= limit
        ? { column: rect.column + 1, row, width: Math.max(0, rect.width - 2), height: rowsPerItem }
        : undefined,
    );
    row += rowsPerItem;
  }
  return { rect, itemRects, dense: rowsPerItem === 1 };
}

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

const START_BUTTON = " ⏻ start ";

let presentedCount = 0;

/**
 * A rectangle for this demo at this viewport: roughly half the body, clamped
 * to the demo's declared range, cascaded so successive windows never pile on
 * one another. Declared sizes were written for one screen; the screen it is
 * actually on wins.
 */
function autoRectFor(id: string): Rectangle {
  const demo = demoById.get(id);
  const body = bodyBounds();
  const width = Math.max(
    demo?.window.minWidth ?? 20,
    Math.min(Math.round(body.width * 0.52), Math.max(demo?.window.width ?? 48, Math.round(body.width * 0.4))),
  );
  const height = Math.max(
    demo?.window.minHeight ?? 6,
    Math.min(Math.round(body.height * 0.62), Math.max(demo?.window.height ?? 14, Math.round(body.height * 0.45))),
  );
  const stepColumn = Math.max(2, Math.round(body.width * 0.06));
  const stepRow = 2;
  const cascade = presentedCount % 5;
  const column = Math.min(2 + cascade * stepColumn, Math.max(0, body.width - width - 1));
  const row = Math.min(1 + cascade * stepRow, Math.max(0, body.height - height - 1));
  return { column, row, width: Math.min(width, body.width), height: Math.min(height, body.height) };
}

function presentDemoWindow(id: string): void {
  // The host blocks focusing a window another maximized window hides, so a
  // maximized peer steps down first — the same order exomux presents in.
  const maximizedId = windowHost.controller.inspect().maximizedWindowId;
  if (maximizedId && maximizedId !== id) {
    windowHost.execute({ kind: "restore", id: maximizedId }, bodyBounds(), projectionOptions());
  }
  const wasClosed = windowHost.controller.inspect().windows.find((window) => window.id === id)?.state === "closed";
  windowHost.execute({ kind: "restore", id }, bodyBounds(), projectionOptions());
  if (mobileLayout()) {
    windowHost.execute({ kind: "maximize", id }, bodyBounds(), projectionOptions());
  } else if (wasClosed) {
    // A window opens sized for the screen it is on, not the one it was
    // declared for.
    windowHost.execute(
      { kind: "set-placement", id, placement: "floating", rect: autoRectFor(id) },
      bodyBounds(),
      projectionOptions(),
    );
    presentedCount += 1;
  }
  windowHost.execute({ kind: "focus", id }, bodyBounds(), projectionOptions());
}

/**
 * Fits the open windows to a new viewport. On a phone the active window takes
 * the whole body; on a desktop, floating windows that ended up off-screen are
 * recovered by the host rather than left where nobody can reach them.
 */
function fitWindowsToViewport(): void {
  if (mobileLayout()) {
    const active = windowHost.controller.inspect().activeWindowId;
    if (active) windowHost.execute({ kind: "maximize", id: active }, bodyBounds(), projectionOptions());
    return;
  }
  const maximizedId = windowHost.controller.inspect().maximizedWindowId;
  if (maximizedId) windowHost.execute({ kind: "restore", id: maximizedId }, bodyBounds(), projectionOptions());
  windowHost.execute({ kind: "recover-all" }, bodyBounds(), projectionOptions());
}

function activateStartMenuItem(item: StartMenuItem): void {
  startMenuOpen = false;
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
 * window topmost, not minimized, the start menu closed. Everything else shows
 * the adapter's placeholder instead of a wrong stacking order.
 */
function syncThreeOverlay(): void {
  if (!threeOverlay) return;
  const projection = windowHost.project(bodyBounds(), projectionOptions());
  const top = projection.windows[projection.windows.length - 1];
  const eligible = !startMenuOpen && top?.id === "three" && top.state !== "minimized" &&
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
  const chromeBase = window.active ? DESKTOP.chromeIdle : DESKTOP.wallpaperDot;
  // The library shell paints the chrome — the same painter exomux draws with —
  // and this desktop only resolves the colours from its palette.
  paintShellWindowChrome(frameSurface(frame), window, {
    surfaceFill: { foreground: DESKTOP.chromeText, background: chromeBase },
    borderGlyphs: THIN_GLYPHS,
    borderForeground: window.active ? DESKTOP.accent : DESKTOP.chromeMuted,
    chromeGround: solidGround(chromeBase),
    titleBarGround: solidGround(window.active ? DESKTOP.chromeActive : DESKTOP.chromeIdle),
    titleBarFillForeground: DESKTOP.chromeText,
    titleText: window.title,
    titleForeground: window.active ? DESKTOP.chromeText : DESKTOP.chromeMuted,
    titleBold: window.active,
    controlBold: (control) => control.tone === "danger" || window.active,
    controlForeground: window.active ? DESKTOP.chromeText : DESKTOP.chromeMuted,
  });
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

/** The rects the shell painted tabs into last frame; the router hit-tests these. */
let paintedTabRects: ShellTabRect[] = [];
/** Which windows the painted tabs stand for, aligned with paintedTabRects. */
let paintedTabMinimized = new Map<string, boolean>();

function barTabItems(): { id: string; label: string; active: boolean; dimmed: boolean }[] {
  const inspection = windowHost.controller.inspect();
  return inspection.windows
    .filter((window) => window.state !== "closed" && window.declaredVisible)
    .map((window) => ({
      id: window.id,
      label: window.title ?? window.id,
      active: window.id === inspection.activeWindowId,
      dimmed: window.state === "minimized",
    }));
}

function paintBar(frame: VizCell[][]): void {
  const bar = barBounds();
  fillRect(frame, bar, DESKTOP.shelf);
  writeText(frame, 0, bar.row, START_BUTTON, {
    foreground: startMenuOpen ? DESKTOP.wallpaper : DESKTOP.accent,
    background: startMenuOpen ? DESKTOP.accent : DESKTOP.shelf,
  });
  const clock = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const tabs = barTabItems();
  const strip: Rectangle = {
    column: START_BUTTON.length + 1,
    row: bar.row,
    width: Math.max(0, columns() - START_BUTTON.length - 1),
    height: 1,
  };
  paintedTabRects = paintShellTabStrip(frameSurface(frame), strip, tabs, {
    activeTab: { foreground: DESKTOP.chromeText, background: DESKTOP.chromeActive },
    tab: { foreground: DESKTOP.chromeMuted, background: DESKTOP.wallpaperDot },
    dimmedTab: { foreground: DESKTOP.chromeMuted, background: DESKTOP.wallpaperDot },
  }, clock.length + 2);
  paintedTabMinimized = new Map(tabs.map((tab) => [tab.id, tab.dimmed]));
  writeText(frame, Math.max(0, columns() - clock.length - 1), bar.row, clock, {
    foreground: DESKTOP.chromeMuted,
    background: DESKTOP.shelf,
  });
  const hint = mobileLayout() || !desktopSettings.barHints ? "" : "drag · dbl-click max · tab switch · g tile";
  if (hint.length > 0) {
    const column = columns() - clock.length - hint.length - 4;
    const lastTab = paintedTabRects.at(-1);
    if (column > (lastTab ? lastTab.rect.column + lastTab.rect.width + 2 : START_BUTTON.length + 2)) {
      writeText(frame, column, bar.row, hint, { foreground: DESKTOP.chromeMuted, background: DESKTOP.shelf });
    }
  }
}

function paintStartMenu(frame: VizCell[][]): void {
  const layout = startMenuLayout();
  const rect = layout.rect;
  paintShellMenuPanel(frameSurface(frame), rect, [], {
    panelFill: { foreground: DESKTOP.chromeText, background: DESKTOP.menu },
    borderGlyphs: THIN_GLYPHS,
    borderStyle: { foreground: DESKTOP.accent, background: DESKTOP.menu, bold: true },
    rowStyle: { foreground: DESKTOP.chromeText, background: DESKTOP.menu },
    dangerForeground: DESKTOP.danger,
  });
  // The title rides the top border, the way exomux titles its boxes.
  writeText(frame, rect.column + 2, rect.row, " exotui desktop ", {
    foreground: DESKTOP.accent,
    background: DESKTOP.menu,
  });
  for (let index = 0; index < START_MENU_ITEMS.length; index += 1) {
    const item = START_MENU_ITEMS[index]!;
    const itemRect = layout.itemRects[index];
    if (!itemRect) continue;
    if (item.separatorBefore) {
      writeText(frame, rect.column + 1, itemRect.row - 1, "─".repeat(Math.max(0, rect.width - 2)), {
        foreground: DESKTOP.wallpaperDot,
        background: DESKTOP.menu,
      });
    }
    const selected = index === startMenuSelected;
    const ground = selected ? DESKTOP.menuSelected : DESKTOP.menu;
    if (selected) fillRect(frame, itemRect, DESKTOP.menuSelected);
    writeText(frame, rect.column + 1, itemRect.row, item.glyph.slice(0, 4), {
      foreground: DESKTOP.accent,
      background: ground,
    });
    writeText(frame, rect.column + 6, itemRect.row, item.title.slice(0, Math.max(0, rect.width - 7)), {
      foreground: DESKTOP.chromeText,
      background: ground,
    });
    if (itemRect.height > 1) {
      writeText(frame, rect.column + 6, itemRect.row + 1, item.summary.slice(0, Math.max(0, rect.width - 7)), {
        foreground: DESKTOP.chromeMuted,
        background: ground,
      });
    }
  }
  const hint = mobileLayout() ? "tap to open" : "↑↓ · enter · esc";
  writeText(frame, rect.column + Math.max(1, rect.width - hint.length - 1), rect.row + rect.height - 1, hint, {
    foreground: DESKTOP.chromeMuted,
    background: DESKTOP.menu,
  });
}

const WALLPAPER_THEME = resolveVisualizationTheme({});

function paintWallpaper(frame: VizCell[][], width: number, height: number, now: number): void {
  const style = desktopSettings.wallpaper;
  if (style === "plain") return;
  if (style === "grid") {
    for (let row = 4; row < height; row += 4) {
      for (let column = 0; column < width; column += 1) {
        frame[row]![column] = { char: "─", foreground: DESKTOP.wallpaperDot, background: DESKTOP.wallpaper };
      }
    }
    for (let column = 8; column < width; column += 8) {
      for (let row = 1; row < height; row += 1) {
        const char = frame[row]![column]!.char === "─" ? "┼" : "│";
        frame[row]![column] = { char, foreground: DESKTOP.wallpaperDot, background: DESKTOP.wallpaper };
      }
    }
    return;
  }
  // dots, and drift: the same field, drift phases each mark's brightness.
  const phase = now / 1600;
  for (let row = 1; row < height; row += 3) {
    for (let column = row % 2 === 0 ? 2 : 4; column < width; column += 6) {
      let color = DESKTOP.wallpaperDot;
      if (style === "drift") {
        const wave = 0.5 + 0.5 * Math.sin(phase + row * 0.7 + column * 0.13);
        color = [
          Math.round(DESKTOP.wallpaper[0] + (DESKTOP.wallpaperDot[0] - DESKTOP.wallpaper[0]) * (0.4 + wave)),
          Math.round(DESKTOP.wallpaper[1] + (DESKTOP.wallpaperDot[1] - DESKTOP.wallpaper[1]) * (0.4 + wave)),
          Math.round(DESKTOP.wallpaper[2] + (DESKTOP.wallpaperDot[2] - DESKTOP.wallpaper[2]) * (0.4 + wave)),
        ];
      }
      frame[row]![column] = { char: "·", foreground: color, background: DESKTOP.wallpaper };
    }
  }
}

function paintDesktop(now: number): void {
  const width = columns();
  const height = rows();
  const frame = screenFrame({ width, height }, WALLPAPER_THEME) as VizCell[][];
  fillRect(frame, { column: 0, row: 0, width, height }, DESKTOP.wallpaper);
  paintWallpaper(frame, width, height, now);
  const projection = windowHost.project(bodyBounds(), projectionOptions());
  // Tiled windows, their separators, then floating windows: a separator is
  // part of the tiled layer and must never cut through a window above it.
  for (const window of projection.tiledWindows) paintWindow(frame, window, now);
  for (const separator of projection.separators) {
    const glyph = separator.axis === "column" ? "│" : "─";
    for (let row = separator.rect.row; row < separator.rect.row + separator.rect.height; row += 1) {
      for (let column = separator.rect.column; column < separator.rect.column + separator.rect.width; column += 1) {
        if (frame[row]?.[column] !== undefined) {
          frame[row]![column] = { char: glyph, foreground: DESKTOP.chromeMuted, background: DESKTOP.wallpaper };
        }
      }
    }
  }
  for (const window of projection.floatingWindows) paintWindow(frame, window, now);
  if (projection.switcher) {
    paintShellSwitcher(frameSurface(frame), projection.switcher, bodyBounds(), {
      colors: {
        panelFill: { foreground: DESKTOP.chromeText, background: DESKTOP.menu },
        frame: { foreground: DESKTOP.accent, background: DESKTOP.menu, bold: true },
        item: { foreground: DESKTOP.chromeText, background: DESKTOP.menu },
        selectedItem: { foreground: DESKTOP.chromeText, background: DESKTOP.menuSelected, bold: true },
      },
    });
  }
  if (projection.snapPreview) {
    const preview = projection.snapPreview.rect;
    writeText(frame, preview.column, preview.row, "┌".padEnd(Math.max(1, preview.width - 1), "─") + "┐", {
      foreground: DESKTOP.accent,
      background: DESKTOP.wallpaper,
    });
  }
  paintBar(frame);
  if (startMenuOpen) paintStartMenu(frame);
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
  if (startMenuOpen && event.kind === "move") {
    // Mouse hover follows the pointer; touch sends no hover and loses nothing,
    // because activation only ever happens on a down.
    const layout = startMenuLayout();
    const under = layout.itemRects.findIndex((rect) => rect && contains(rect, x, y));
    if (under >= 0) startMenuSelected = under;
    return;
  }
  if (event.kind === "down") {
    if (startMenuOpen) {
      const layout = startMenuLayout();
      if (contains(layout.rect, x, y)) {
        const index = layout.itemRects.findIndex((rect) => rect && contains(rect, x, y));
        const item = index >= 0 ? START_MENU_ITEMS[index] : undefined;
        if (item) activateStartMenuItem(item);
      } else startMenuOpen = false;
      return;
    }
    const bar = barBounds();
    if (y === bar.row) {
      if (x < START_BUTTON.length) {
        startMenuOpen = true;
        startMenuSelected = 0;
        return;
      }
      // The rects the shell painted are the rects the router trusts.
      for (const tab of paintedTabRects) {
        if (contains(tab.rect, x, y)) {
          const active = windowHost.controller.inspect().activeWindowId === tab.id;
          if (active && paintedTabMinimized.get(tab.id) !== true) {
            windowHost.execute({ kind: "minimize", id: tab.id }, bodyBounds(), projectionOptions());
          } else presentDemoWindow(tab.id);
          return;
        }
      }
      return;
    }
  }
  const result = windowHost.handlePointer(event, bodyBounds(), projectionOptions());
  if (event.kind === "down") {
    const window = activeDemoWindow();
    // A down inside the client belongs to the demo unless chrome claimed it —
    // and focusing the window it landed in is not a claim, it is a side effect
    // of every client click.
    const chromeClaimed = result.command !== undefined && result.command.kind !== "focus";
    if (window && contains(window.clientRect, x, y) && !chromeClaimed) {
      demoById.get(window.id)?.onPointerDown?.(x - window.clientRect.column, y - window.clientRect.row);
    }
  }
});

host.on("keyPress", (event: KeyPressEvent) => {
  if (startMenuOpen) {
    if (event.key === "escape") startMenuOpen = false;
    else if (event.key === "down") startMenuSelected = (startMenuSelected + 1) % START_MENU_ITEMS.length;
    else if (event.key === "up") {
      startMenuSelected = (startMenuSelected + START_MENU_ITEMS.length - 1) % START_MENU_ITEMS.length;
    } else if (event.key === "return") {
      const item = START_MENU_ITEMS[startMenuSelected];
      if (item) activateStartMenuItem(item);
    }
    return;
  }
  const switcherOpen = windowHost.project(bodyBounds(), projectionOptions()).switcher !== undefined;
  if (switcherOpen) {
    if (event.key === "tab") {
      windowHost.execute({ kind: "switcher-step", direction: event.shift ? -1 : 1 }, bodyBounds(), projectionOptions());
    } else if (event.key === "return") {
      windowHost.execute({ kind: "switcher-accept" }, bodyBounds(), projectionOptions());
    } else if (event.key === "escape") {
      windowHost.execute({ kind: "switcher-cancel" }, bodyBounds(), projectionOptions());
    }
    return;
  }
  const window = activeDemoWindow();
  if (window && demoById.get(window.id)?.onKey?.(event)) return;
  if (event.key === "tab") {
    windowHost.execute({ kind: "switcher-open", direction: event.shift ? -1 : 1 }, bodyBounds(), projectionOptions());
  } else if (event.key === "g" && window && !mobileLayout()) {
    // Toggle the focused window between floating and the tiled workspace —
    // the host owns the layout; this is one command, like everything else.
    windowHost.execute({ kind: "toggle-placement", id: window.id }, bodyBounds(), projectionOptions());
  }
});

host.platform.size.subscribe(() => {
  ensureLineSignals();
  fitWindowsToViewport();
});

// The first window sizes for the actual screen at boot — phone or desktop.
if (mobileLayout()) fitWindowsToViewport();
else {
  windowHost.execute(
    { kind: "set-placement", id: "about", placement: "floating", rect: autoRectFor("about") },
    bodyBounds(),
    projectionOptions(),
  );
  presentedCount += 1;
}

// Debug hook for driving the page from CDP during development; carries no UI.
(globalThis as unknown as Record<string, unknown>).__desktop = {
  order: () =>
    windowHost.project(bodyBounds(), projectionOptions()).windows.map((window) =>
      `${window.id}:${window.placement}:${window.state}${
        window.active ? "*" : ""
      }@r${window.rect.row}+${window.rect.height}c${window.rect.column}+${window.rect.width} client r${window.clientRect.row}+${window.clientRect.height}`
    ),
  row: (index: number) => (lineSignals[index]?.peek() ?? "").replace(/\x1b\[[0-9;]*m/g, ""),
  separators: () =>
    windowHost.project(bodyBounds(), projectionOptions()).separators.map((separator) =>
      `${separator.axis}@r${separator.rect.row}+${separator.rect.height}c${separator.rect.column}+${separator.rect.width}`
    ),
};

host.start();
