// The exotui desktop, in a browser tab.
//
// A windowing-system demo as the docs landing page: the library's
// WorkbenchWindowHost — the same engine exomux runs on — drives floating
// windows over a cell canvas, and each window's client area is a demo drawn
// through its own honest seam. The host owns focus, dragging, snapping,
// minimize/maximize and the shelf; this file owns painting and the start menu.

import { createTiledWorkspaceController } from "../../src/layout/tiled_workspace.ts";
import type { ShellApp, ShellPresenterSize } from "../../src/app/shell_presenter.ts";
import {
  createWorkbenchWindowHostController,
  type WorkbenchWindowChromeProjection,
  type WorkbenchWindowHostProjectionOptions,
} from "../../src/app/workbench_window_host.ts";
import type { PointerInputEvent } from "../../src/pointer_input.ts";
import type { KeyPressEvent, MouseScrollEvent } from "../../src/input_reader/types.ts";
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
import { neonDemosForSection, type NeonSuiteSection, renderNeonSuiteDemo } from "../../app/neon_suite.ts";
import type { NeonDemo } from "../../app/visualizations.ts";
import { ansiLineToCells } from "./ansi_cells.ts";
import {
  borderBoxOnGround,
  paintShellMenuPanel,
  paintShellSwitcher,
  paintShellTabStrip,
  paintShellWindowChrome,
  type ShellSurface,
  type ShellTabRect,
  solidGround,
} from "../../src/app/workbench_shell.ts";
import {
  SHELL_THEMES,
  shellActiveTitlebarForeground,
  shellThemeById,
  type ShellThemeSpec,
} from "../../src/app/shell_theme.ts";
import { oklchToRgb, rgbToOklch } from "../../src/theme_oklch.ts";
import { animatedBackgroundAcceptsPicks, animatedBackgroundHasOverlay } from "../../src/app/animated_background.ts";
import { softwareCursorRender } from "../../src/app/software_cursor.ts";
import {
  SHELL_BACKGROUND_FIELDS,
  type ShellAnimatedBackground,
  type ShellBackgroundEntry,
  type ShellDisposableBackground,
} from "../../src/app/backgrounds/mod.ts";

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

/**
 * The active theme is one of the shared catalog specs — the same objects
 * exomux paints with — and the flat palette the painters read derives from
 * it. `menuSelectedText`/`titleActiveText` follow exomux's contrast-the-bar
 * rule, so light themes hold up.
 */
let themeSpec: ShellThemeSpec = shellThemeById("section9");

function desktopFromSpec(spec: ShellThemeSpec): DesktopTheme {
  return {
    wallpaper: spec.background,
    wallpaperDot: spec.surfaceStrong,
    chromeActive: spec.accent,
    chromeIdle: spec.surfaceStrong,
    chromeText: spec.text,
    chromeMuted: spec.muted,
    clientGround: spec.surface,
    accent: spec.accent,
    danger: spec.danger,
    shelf: spec.surface,
    menu: spec.surfaceStrong,
    menuSelected: spec.accent,
  };
}

let DESKTOP: DesktopTheme = desktopFromSpec(themeSpec);
/** Text painted on accent-coloured bars (active titlebar, selected menu row). */
let ON_ACCENT: Rgb = shellActiveTitlebarForeground(themeSpec);

function applyShellTheme(spec: ShellThemeSpec): void {
  themeSpec = spec;
  DESKTOP = desktopFromSpec(spec);
  ON_ACCENT = shellActiveTitlebarForeground(spec);
  persistDesktop();
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
  /** Scroll inside the client area; direction 1 is down. */
  onWheel?(direction: 1 | -1, column: number, row: number): boolean;
  /** Vertical scroll state; overflowing windows get a right-edge scrollbar. */
  vscroll?(width: number, height: number): { readonly offset: number; readonly total: number };
  /** Tappable buttons for every key the demo answers to — the mobile hands. */
  readonly controls?: readonly DemoControl[];
}

/** One painted button: a label, and the key its tap synthesizes. */
interface DemoControl {
  readonly label: string;
  readonly key: string;
}

/** Button spans on the control strip, in client columns. */
function demoControlSpans(
  demo: DesktopDemo,
  width: number,
): { readonly control: DemoControl; readonly from: number; readonly to: number }[] {
  const spans: { control: DemoControl; from: number; to: number }[] = [];
  let cursor = 1;
  for (const control of demo.controls ?? []) {
    const length = control.label.length + 2;
    if (cursor + length > width - 1) break;
    spans.push({ control, from: cursor, to: cursor + length });
    cursor += length + 1;
  }
  return spans;
}

/** Feeds one synthesized key press to a demo, as if typed. */
function pressDemoKey(demo: DesktopDemo, key: string): void {
  demo.onKey?.({ key, meta: false, ctrl: false, shift: false, buffer: new Uint8Array() } as unknown as KeyPressEvent);
}

function monitorDemo(): DesktopDemo {
  let monitor: DesktopMonitor | undefined;
  const ensure = (): DesktopMonitor | undefined => {
    if (!monitor) monitor = services.createMonitor?.();
    return monitor;
  };
  return {
    id: "exomonitor",
    controls: [
      { label: "theme", key: "t" },
    ],
    title: "exomonitor",
    summary: "Live dashboard: this host's live sources through the viz layer.",
    window: { width: 62, height: 18, minWidth: 24, minHeight: 8 },
    sample: (now) => ensure()?.sample(now),
    render(width, height) {
      const live = ensure();
      if (live) return live.render(width, height);
      // No monitor sources on this host: say so, exactly once, honestly.
      const frame = clientFrame(width, height);
      const message = "no live sources on this host";
      writeCellsText(
        frame[Math.floor(height / 2)]!,
        Math.max(0, Math.floor((width - message.length) / 2)),
        message,
        DESKTOP.chromeMuted,
        DESKTOP.clientGround,
      );
      return frame;
    },
    onKey(event) {
      if (event.key === "t") {
        ensure()?.cycleTheme();
        return true;
      }
      return false;
    },
    onPointerDown() {
      void ensure()?.enableMicrophone();
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
    controls: [
      { label: "◀ demo", key: "left" },
      { label: "demo ▶", key: "right" },
      { label: "▲ sect", key: "up" },
      { label: "sect ▼", key: "down" },
    ],
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
  const clampOffset = (height: number): void => {
    offset = Math.max(0, Math.min(offset, Math.max(0, SHELL_THEMES.length - height)));
  };
  const themeAt = (row: number): ShellThemeSpec | undefined => SHELL_THEMES[row + offset];
  return {
    id: "themes",
    title: "themes",
    summary: `The shared catalog — the same ${SHELL_THEMES.length} themes exomux ships. Click to apply.`,
    window: { width: 46, height: 16, minWidth: 28, minHeight: 7 },
    render(width, height) {
      const frame = clientFrame(width, height);
      clampOffset(height);
      for (let row = 0; row < height; row += 1) {
        const spec = themeAt(row);
        if (!spec) break;
        const active = spec.id === themeSpec.id;
        writeCellsText(
          frame[row]!,
          1,
          `${active ? "●" : " "} ${spec.label}`.slice(0, Math.max(4, width - 16)),
          active ? DESKTOP.accent : DESKTOP.chromeText,
          DESKTOP.clientGround,
        );
        const swatch = [spec.background, spec.surface, spec.accent, spec.success, spec.warning, spec.danger];
        for (let block = 0; block < swatch.length; block += 1) {
          const column = width - 2 - (swatch.length - block) * 2;
          if (column <= 0) continue;
          frame[row]![column] = { char: "█", foreground: swatch[block]!, background: DESKTOP.clientGround };
          frame[row]![column + 1] = { char: "█", foreground: swatch[block]!, background: DESKTOP.clientGround };
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
      const spec = themeAt(row);
      if (spec) applyShellTheme(spec);
    },
    onWheel(direction) {
      offset = Math.max(0, offset + direction * 3);
      return true;
    },
    vscroll() {
      return { offset, total: SHELL_THEMES.length };
    },
    controls: [
      { label: "▲", key: "up" },
      { label: "▼", key: "down" },
    ],
  };
}

function wallpaperStyles(): readonly { readonly id: string; readonly label: string }[] {
  return [
    { id: "plain", label: "plain — nothing but the colour" },
    { id: "dots", label: "dots — a quiet grid of marks" },
    ...SHELL_BACKGROUND_FIELDS.map((entry) => ({ id: entry.id, label: entry.label })),
    ...(services.extraBackgrounds ?? []).map((entry) => ({ id: entry.id, label: entry.label })),
  ];
}

function settingsDemo(): DesktopDemo {
  let scrollTop = 0;
  // Rows are laid out by the same function that hit-tests them.
  interface SettingsRow {
    readonly label: () => string;
    readonly action: (column?: number) => void;
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
    ...wallpaperStyles().map((style) => ({
      label: () => `  ${desktopSettings.wallpaper === style.id ? "●" : "○"} ${style.label}`,
      action: () => {
        desktopSettings.wallpaper = style.id;
        persistDesktop();
      },
    })),
    { label: () => "", action: () => {} },
    { label: () => "BAR", heading: true, action: () => {} },
    {
      label: () => `  ${desktopSettings.barHints ? "●" : "○"} show the key hints`,
      action: () => {
        desktopSettings.barHints = !desktopSettings.barHints;
        persistDesktop();
      },
    },
    ...(services.shader
      ? [
        { label: () => "", action: () => {} },
        { label: () => "SHADERS — stack any of them", heading: true, action: () => {} },
        ...services.shader.list().flatMap((entry): SettingsRow[] => {
          const shader = services.shader!;
          const shownValue = (option: DesktopShaderOption): string => {
            const value = shader.option(entry.id, option.key) ?? 0;
            return option.step < 0.001 ? value.toFixed(4) : option.step < 1 ? value.toFixed(2) : String(value);
          };
          return [
            {
              label: () => `  ${shader.enabled().includes(entry.id) ? "☑" : "☐"} ${entry.label}`,
              action: () => {
                shader.toggle(entry.id);
                persistDesktop();
              },
            },
            // A shader's knobs unfold beneath it while it is on; a click on
            // the left of the value steps down, on the right steps up.
            ...(shader.enabled().includes(entry.id)
              ? (entry.options ?? []).map((option): SettingsRow => ({
                label: () => `      ${option.label.padEnd(14)} ◂ ${shownValue(option)} ▸`,
                action: (column?: number) => {
                  const value = shader.option(entry.id, option.key) ?? 0;
                  const middle = 24 + shownValue(option).length / 2;
                  const direction = (column ?? middle + 1) < middle ? -1 : 1;
                  shader.setOption(entry.id, option.key, value + direction * option.step);
                  persistDesktop();
                },
              }))
              : []),
          ];
        }),
      ]
      : []),
    { label: () => "", action: () => {} },
    { label: () => "WINDOWS", heading: true, action: () => {} },
    ...[1, 0.9, 0.8, 0.65].map((opacity) => ({
      label: () =>
        `  ${desktopSettings.windowOpacity === opacity ? "●" : "○"} ${
          opacity === 1 ? "solid windows" : `glass — ${Math.round(opacity * 100)}% opacity`
        }`,
      action: () => {
        desktopSettings.windowOpacity = opacity;
        persistDesktop();
      },
    })),
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
    window: { width: 50, height: 22, minWidth: 26, minHeight: 8 },
    render(width, height) {
      const frame = clientFrame(width, height);
      const rows = rowsOf();
      scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, rows.length - height)));
      for (let row = 0; row < height; row += 1) {
        const entry = rows[row + scrollTop];
        if (!entry) break;
        writeCellsText(
          frame[row]!,
          1,
          entry.label().slice(0, Math.max(0, width - 2)),
          entry.heading ? DESKTOP.accent : DESKTOP.chromeText,
          DESKTOP.clientGround,
        );
      }
      if (scrollTop + height < rows.length && height > 1) {
        writeCellsText(frame[height - 1]!, width - 4, " ▼ ", DESKTOP.chromeMuted, DESKTOP.clientGround);
      }
      return frame;
    },
    onPointerDown(column, row) {
      rowsOf()[row + scrollTop]?.action(column);
    },
    onKey(event) {
      if (event.key === "down") scrollTop += 1;
      else if (event.key === "up") scrollTop = Math.max(0, scrollTop - 1);
      else return false;
      return true;
    },
    onWheel(direction) {
      scrollTop = Math.max(0, scrollTop + direction * 3);
      return true;
    },
    vscroll() {
      return { offset: scrollTop, total: rowsOf().length };
    },
    controls: [
      { label: "▲", key: "up" },
      { label: "▼", key: "down" },
    ],
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

const BUILDER_SLOTS = [
  "background",
  "surface",
  "surfaceStrong",
  "border",
  "text",
  "muted",
  "accent",
  "success",
  "warning",
  "danger",
] as const;
type BuilderSlot = (typeof BUILDER_SLOTS)[number];

function themeBuilderDemo(): DesktopDemo {
  let selected: number = BUILDER_SLOTS.indexOf("accent");
  const nudge = (turnHue: number, stepLightness: number): void => {
    const slot: BuilderSlot = BUILDER_SLOTS[selected]!;
    const current = themeSpec[slot];
    const oklch = rgbToOklch([current[0], current[1], current[2]]);
    const adjusted = oklchToRgb({
      l: Math.min(1, Math.max(0, oklch.l + stepLightness)),
      c: oklch.c,
      h: (oklch.h + turnHue + 360) % 360,
    });
    applyShellTheme({
      ...themeSpec,
      id: themeSpec.id.endsWith("*") ? themeSpec.id : `${themeSpec.id}*`,
      label: themeSpec.label.endsWith(" *") ? themeSpec.label : `${themeSpec.label} *`,
      [slot]: [adjusted[0], adjusted[1], adjusted[2]] as Rgb,
    });
  };
  return {
    id: "builder",
    controls: [
      { label: "▲ slot", key: "up" },
      { label: "slot ▼", key: "down" },
      { label: "◀ hue", key: "left" },
      { label: "hue ▶", key: "right" },
      { label: "− light", key: "[" },
      { label: "light +", key: "]" },
    ],
    title: "theme builder",
    summary: "Edit the live theme slot by slot, in OKLCH.",
    window: { width: 46, height: 15, minWidth: 30, minHeight: 8 },
    render(width, height) {
      const frame = clientFrame(width, height);
      writeCellsText(frame[0]!, 1, `editing ${themeSpec.label}`, DESKTOP.accent, DESKTOP.clientGround);
      for (let index = 0; index < BUILDER_SLOTS.length; index += 1) {
        const row = index + 1;
        if (row >= height - 1) break;
        const slot = BUILDER_SLOTS[index]!;
        const color = themeSpec[slot];
        const oklch = rgbToOklch([color[0], color[1], color[2]]);
        const marker = index === selected ? ">" : " ";
        writeCellsText(
          frame[row]!,
          1,
          `${marker} ${slot.padEnd(13)} L${oklch.l.toFixed(2)} H${Math.round(oklch.h).toString().padStart(3)}`,
          index === selected ? DESKTOP.accent : DESKTOP.chromeText,
          DESKTOP.clientGround,
        );
        for (let column = width - 8; column < width - 2; column += 1) {
          if (column > 0) frame[row]![column] = { char: " ", background: color };
        }
      }
      const hint = "←→ hue · [ ] light · click row";
      const hintRow = Math.min(height - 1, BUILDER_SLOTS.length + 1);
      writeCellsText(frame[hintRow]!, 1, hint.slice(0, width - 2), DESKTOP.chromeMuted, DESKTOP.clientGround);
      return frame;
    },
    onKey(event) {
      if (event.key === "left") nudge(-12, 0);
      else if (event.key === "right") nudge(12, 0);
      else if (event.key === "[") nudge(0, -0.03);
      else if (event.key === "]") nudge(0, 0.03);
      else if (event.key === "down") selected = (selected + 1) % BUILDER_SLOTS.length;
      else if (event.key === "up") selected = (selected + BUILDER_SLOTS.length - 1) % BUILDER_SLOTS.length;
      else return false;
      return true;
    },
    onPointerDown(_, row) {
      const index = row - 1;
      if (index >= 0 && index < BUILDER_SLOTS.length) selected = index;
    },
  };
}

const ABOUT_ART = [
  "                                 ___.    __        .__ ",
  "  ____ ___  _________  _  __ ____\\_ |___/  |_ __ __|__|",
  "_/ __ \\\\  \\/  /  _ \\ \\/ \\/ // __ \\| __ \\   __\\  |  \\  |",
  "\\  ___/ >    <  <_> )     /\\  ___/| \\_\\ \\  | |  |  /  |",
  " \\___  >__/\\_ \\____/ \\/\\_/  \\___  >___  /__| |____/|__|",
  "     \\/      \\/                 \\/    \\/              ",
];

const ABOUT_BODY = [
  "",
  "a desktop of cells, upright amid the ruins",
  "══════════════════════════════════════════",
  "",
  "Regard what stands before you: exotui, a TUI library",
  "for Deno, made manifest in your browser. This is no",
  "imitation raised in the image of the modern web — no",
  "port, no likeness. It is the form itself, transmitted",
  "without dilution: the same application object that",
  "draws this desktop rules equally in a true terminal",
  "(`deno task desktop`), through one seam and two",
  "presenters — console and web. Zero additional code",
  "paths. Concessions to the spirit of the age: none.",
  "",
  "A tradition survives not by nostalgia but by",
  "transmission. All that you see is shared library",
  "machinery, held in common between the two worlds:",
  "",
  "  ▪ the window host — the engine on which the exomux",
  "    terminal multiplexer rides: drag, snap, tile (g),",
  "    minimize, the Tab switcher, double-click to",
  "    maximize",
  "  ▪ the shell painters — thin borders, title bars,",
  "    menus, tabs — one painter for terminal cells and",
  "    for this canvas alike, as a rite is one across",
  "    all of its temples",
  "  ▪ seventeen themes, an aristocracy of palettes,",
  "    editable live in the theme builder (OKLCH, slot",
  "    by slot), persisted per host",
  "  ▪ eleven animated backgrounds — metaballs, matrix,",
  "    the skull, circuit and their kin — simulations",
  "    that flow around your windows and answer your",
  "    pointer",
  "  ▪ the viz layer: twenty-three data visualizations,",
  "    a live monitor fed by your microphone, Three.js",
  "    through a WebGPU ASCII pipeline",
  "",
  "the discipline of the hand",
  "──────────────────────────",
  "",
  "  ⏻ exowebtui    every window; begin at the origin",
  "  drag titlebar  move · edge-drag snaps · dbl-click max",
  "  g              float ⇄ tile the focused window",
  "  tab            window switcher",
  "  right-click    context menu, desktop or window —",
  "                 degauss when the tube grows impure",
  "  wheel          scrolls this window; the themes too",
  "",
  "of the work itself",
  "──────────────────",
  "",
  "Ride the tiger of the modern browser: one does not",
  "flee the machine, one masters it. exotui is a",
  "fork-grown terminal UI library — signals, layout,",
  "components, a markup layer, theme engines, input",
  "pipelines, remote rendering — crowned by the exomux",
  "terminal multiplexer, its flagship. The web build you",
  "now inhabit is the same package, with a browser",
  "presenter in place of a terminal one. What is",
  "essential does not negotiate with its medium.",
  "",
  "  jsr.io/@ubernaut/exotui",
  "  github.com/ubernaut/exotui",
  "",
];

function aboutDemo(): DesktopDemo {
  let scrollTop = 0;
  let scrollLeft = 0;
  const artWidth = ABOUT_ART.reduce((max, line) => Math.max(max, line.length), 0);
  const contentWidth = Math.max(artWidth, ABOUT_BODY.reduce((max, line) => Math.max(max, line.length), 0));
  /** Body lines wrapped to the viewport, computed per width. */
  const wrapped = (width: number): string[] => {
    const lines: string[] = [];
    for (const line of ABOUT_BODY) {
      if (line.length <= width || width < 12) {
        lines.push(line);
        continue;
      }
      // Wrap on spaces; indented bullets keep their gutter.
      const gutter = line.match(/^\s*/)?.[0] ?? "";
      let rest = line.trimEnd();
      while (rest.length > width) {
        let cut = rest.lastIndexOf(" ", width);
        if (cut <= gutter.length) cut = width;
        lines.push(rest.slice(0, cut));
        rest = gutter + "  " + rest.slice(cut).trimStart();
      }
      lines.push(rest);
    }
    return lines;
  };
  return {
    id: "about",
    title: "welcome",
    summary: "What this whole thing is. Scroll it.",
    window: { width: 64, height: 20, minWidth: 30, minHeight: 8 },
    render(width, height) {
      const frame = clientFrame(width, height);
      const body = wrapped(width - 2);
      const artRows = ABOUT_ART.length;
      const total = artRows + body.length;
      scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, total - height)));
      const maxLeft = Math.max(0, contentWidth - (width - 2));
      scrollLeft = Math.max(0, Math.min(scrollLeft, maxLeft));
      for (let row = 0; row < height; row += 1) {
        const index = row + scrollTop;
        if (index < artRows) {
          const art = ABOUT_ART[index]!.slice(scrollLeft);
          writeCellsText(frame[row]!, 1, art.slice(0, width - 2), DESKTOP.accent, DESKTOP.clientGround);
          continue;
        }
        const line = body[index - artRows];
        if (line === undefined) break;
        const visible = line.slice(scrollLeft, scrollLeft + width - 2);
        const accent = line.trimStart().startsWith("jsr.io") || line.trimStart().startsWith("github.com");
        const heading = /^[═─]+$/.test(line.trim()) || line === "a desktop of cells, upright amid the ruins" ||
          line === "the discipline of the hand" || line === "of the work itself";
        writeCellsText(
          frame[row]!,
          1,
          visible,
          accent || heading ? DESKTOP.accent : DESKTOP.chromeText,
          DESKTOP.clientGround,
        );
      }
      // A quiet scroll hint when there is more below.
      if (scrollTop + height < total && height > 1) {
        writeCellsText(frame[height - 1]!, width - 4, " ▼ ", DESKTOP.chromeMuted, DESKTOP.clientGround);
      }
      return frame;
    },
    onKey(event) {
      if (event.key === "down") scrollTop += 1;
      else if (event.key === "up") scrollTop = Math.max(0, scrollTop - 1);
      else if (event.key === "pagedown" || event.key === "space") scrollTop += 8;
      else if (event.key === "pageup") scrollTop = Math.max(0, scrollTop - 8);
      else if (event.key === "right") scrollLeft += 4;
      else if (event.key === "left") scrollLeft = Math.max(0, scrollLeft - 4);
      else if (event.key === "home") {
        scrollTop = 0;
        scrollLeft = 0;
      } else return false;
      return true;
    },
    onWheel(direction) {
      scrollTop = Math.max(0, scrollTop + direction * 3);
      return true;
    },
    vscroll(width) {
      return { offset: scrollTop, total: ABOUT_ART.length + wrapped(width - 2).length };
    },
    controls: [
      { label: "▲", key: "up" },
      { label: "▼", key: "down" },
      { label: "◀", key: "left" },
      { label: "▶", key: "right" },
    ],
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
    controls: [
      { label: "◀ prev", key: "left" },
      { label: "next ▶", key: "right" },
    ],
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

function threeDemo(): DesktopDemo {
  return {
    id: "three",
    controls: [
      { label: "◀ scene", key: "left" },
      { label: "scene ▶", key: "right" },
    ],
    title: "three ascii",
    summary: "Three.js through the WebGPU ASCII pipeline. Loads on launch.",
    window: { width: 58, height: 18, minWidth: 28, minHeight: 8 },
    render(width, height) {
      const frame = clientFrame(width, height);
      const overlayState = services.threeOverlay?.state() ?? "unavailable";
      const message = overlayState === "loading"
        ? "loading three + webgpu…"
        : overlayState === "unavailable"
        ? "webgpu unavailable in this browser"
        : "focus this window to render";
      writeCellsText(
        frame[Math.floor(height / 2)]!,
        Math.max(0, Math.floor((width - message.length) / 2)),
        message,
        DESKTOP.chromeMuted,
        DESKTOP.clientGround,
      );
      if (overlayState === "ready" && height >= 2) {
        const footer = frame[height - 1]!;
        for (let column = 0; column < width; column += 1) footer[column] = { char: " ", background: DESKTOP.shelf };
        writeCellsText(footer, 0, ` ${services.threeOverlay?.sceneName() ?? ""} `, DESKTOP.chromeText, DESKTOP.shelf);
        const hint = "←→ scene";
        writeCellsText(footer, Math.max(0, width - hint.length - 1), hint, DESKTOP.chromeMuted, DESKTOP.shelf);
      }
      return frame;
    },
    onKey(event) {
      const overlay = services.threeOverlay;
      if (!overlay || overlay.state() !== "ready") return false;
      if (event.key === "right") overlay.cycleScene(1);
      else if (event.key === "left") overlay.cycleScene(-1);
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
  themeBuilderDemo(),
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
  builder: "✎",
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

/**
 * Host services the desktop consumes when a host can provide them. Every
 * field is optional, and an absent service renders as an honest "unavailable"
 * rather than a crash — the exomonitor contract, applied to the whole app.
 */
export interface DesktopServices {
  /** Opens an outward link (a browser tab; a terminal might print it). */
  readonly openExternal?: (url: string) => void;
  /** A live monitor with host-probed sources (microphone, heap). */
  readonly createMonitor?: () => DesktopMonitor;
  /** The WebGPU three-ascii overlay host, where a canvas exists. */
  readonly threeOverlay?: DesktopThreeOverlayService;
  /** Host-provided backgrounds joining the shared catalog (butterchurn). */
  readonly extraBackgrounds?: readonly ShellBackgroundEntry[];
  /** Copies selected text to the host clipboard. */
  readonly copyText?: (text: string) => void;
  /** Ghostty-style post shaders, where the host renders through a canvas. */
  readonly shader?: DesktopShaderService;
}

/** One knob a post shader exposes; values live in the layer. */
export interface DesktopShaderOption {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Stacked post shaders: any subset runs as a chain, each with its knobs. */
export interface DesktopShaderService {
  list(): readonly { readonly id: string; readonly label: string; readonly options?: readonly DesktopShaderOption[] }[];
  enabled(): readonly string[];
  toggle(id: string): void;
  setEnabled(ids: readonly string[]): void;
  option(id: string, key: string): number | undefined;
  setOption(id: string, key: string, value: number): void;
  /** A one-shot Trinitron degauss thump over whatever is on. */
  degauss(): void;
  /** The live magnetization level, 0..1. */
  magnetism(): number;
}

/** The monitor surface the exomonitor window draws through. */
export interface DesktopMonitor {
  sample(now: number): void;
  render(width: number, height: number): VizFrame;
  enableMicrophone(): Promise<void>;
  cycleTheme(): void;
}

/** The three-ascii overlay, loaded and controlled by the host. */
export interface DesktopThreeOverlayService {
  ensure(): Promise<"ready" | "unavailable">;
  state(): "idle" | "loading" | "ready" | "unavailable";
  setRect(rect: Rectangle | null): void;
  cycleScene(direction: -1 | 1): void;
  sceneName(): string;
}

let services: DesktopServices = {};
let presentedSize: ShellPresenterSize = { columns: 100, rows: 32 };

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

const columns = () => presentedSize.columns;
const rows = () => presentedSize.rows;
// The bar is at the top, where exomux keeps its; windows live below it.
const bodyBounds = (): Rectangle => ({ column: 0, row: 1, width: columns(), height: Math.max(1, rows() - 1) });
const barBounds = (): Rectangle => ({ column: 0, row: 0, width: columns(), height: 1 });
const projectionOptions = (): WorkbenchWindowHostProjectionOptions => ({
  shelfBounds: barBounds(),
  doubleClickMaximizeMs: 400,
});

/** Desktop-wide settings the settings window edits and the painter honors. */
const desktopSettings = {
  /** "plain", "dots", or any id from the shared background catalog. */
  wallpaper: "circuit",
  barHints: true,
  /** Window body opacity over the backdrop; 1 is solid. */
  windowOpacity: 0.9,
};

/**
 * The animated-background host: the same fields exomux runs, advancing at
 * exomux's cadence with the windows as obstacles and the pointer attracting.
 */
let backgroundField: ShellAnimatedBackground | undefined;
let backgroundFieldId = "";
let lastBackgroundAdvance = 0;
const BACKGROUND_FRAME_MS = 125;
let backgroundFrameMs = BACKGROUND_FRAME_MS;
let backgroundAdvanceCount = 0;
/** The last rasterized field, reused between advances: a simulation that has
 * not moved must not be re-rendered sixty times a second (butterchurn's CPU
 * presets made that lesson vivid). */
let backgroundCells: ReturnType<ShellAnimatedBackground["rasterizeCells"]> | undefined;
let backgroundCellsKey = "";

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

/** What the wallpaper shows at a cell — what a translucent window blends with. */
function backdropAt(x: number, y: number): Rgb {
  const body = bodyBounds();
  const cell = backgroundCells?.[y - body.row]?.[x - body.column];
  if (!cell) return DESKTOP.wallpaper;
  return cell.char === "█" ? cell.foreground as Rgb : mixRgb(DESKTOP.wallpaper, cell.foreground as Rgb, 0.45);
}

function currentBackgroundField(): ShellAnimatedBackground | undefined {
  const id = desktopSettings.wallpaper;
  if (backgroundFieldId === id) return backgroundField;
  const disposable = backgroundField as ShellDisposableBackground | undefined;
  if (disposable && typeof (disposable as { dispose?: () => void }).dispose === "function") {
    (disposable as { dispose: () => void }).dispose();
  }
  const entry = SHELL_BACKGROUND_FIELDS.find((candidate) => candidate.id === id) ??
    services.extraBackgrounds?.find((candidate) => candidate.id === id);
  backgroundField = entry?.create();
  // A field that asks for 60 gets every frame; the calm catalog keeps its 8.
  backgroundFrameMs = entry?.fps ? 1000 / entry.fps - 1 : BACKGROUND_FRAME_MS;
  backgroundFieldId = id;
  lastBackgroundAdvance = 0;
  return backgroundField;
}

/**
 * The phone question, answered the way exomux answers it: below this there is
 * no room for floating windows, so one maximized window owns the body and the
 * rest wait in the shelf. The threshold is exomux's, kept for the same reason.
 */
const mobileLayout = (): boolean => columns() < 72 || rows() < 20;

let startMenuOpen = false;
let startMenuSelected = 0;

/** Magnetization level past which the picture is annoying to read. */
const MAGNET_BLINK_THRESHOLD = 0.55;
const DEGAUSS_CHIP = " ∪ degauss ";

/** The magnet button, bottom-right, floating above everything. */
function degaussChipRect(): Rectangle | undefined {
  if (!services.shader) return undefined;
  const width = DEGAUSS_CHIP.length;
  if (columns() < width + 2 || rows() < 4) return undefined;
  return { column: columns() - width - 1, row: rows() - 2, width, height: 1 };
}
/** The drawn pointer: tracked for mouse and pen, never for a finger. */
let cursorPoint: { column: number; row: number } | undefined;
let cursorVisible = false;

/** The right-click menu: desktop-owned, one geometry for paint and hits. */
interface ContextMenuItem {
  readonly label: string;
  readonly danger?: boolean;
  readonly action: () => void;
}
let contextMenu: { rect: Rectangle; items: ContextMenuItem[] } | undefined;

/**
 * Terminal-style text selection: drag across any window's client area,
 * release, and the visible characters land on the host clipboard. Linear
 * ranges, the way a terminal selects — full rows between the endpoints.
 */
interface SelectionPoint {
  readonly x: number;
  readonly y: number;
}
/** A selection lives inside ONE window's client area, in local cells. */
let selectionAnchor: { readonly windowId: string; readonly local: SelectionPoint } | undefined;
/** A finger inside a client scrolls the content; selection is for the mouse. */
let touchScroll: { windowId: string; startY: number; applied: number; active: boolean } | undefined;
let selection:
  | { readonly windowId: string; readonly from: SelectionPoint; readonly to: SelectionPoint }
  | undefined;
let selecting = false;

function orderedSelection(): { windowId: string; from: SelectionPoint; to: SelectionPoint } | undefined {
  if (!selection) return undefined;
  const { windowId, from, to } = selection;
  if (to.y < from.y || (to.y === from.y && to.x < from.x)) return { windowId, from: to, to: from };
  return { windowId, from, to };
}

/** The selected window's live client rect, or undefined once it is gone. */
function selectionClientRect(): Rectangle | undefined {
  const range = orderedSelection();
  if (!range) return undefined;
  const window = windowHost.project(bodyBounds(), projectionOptions()).windows
    .find((candidate) => candidate.id === range.windowId);
  return window?.clientRect;
}

/** True when a client-local cell falls inside the linear range. */
function selectionCoversLocal(x: number, y: number): boolean {
  const range = orderedSelection();
  if (!range) return false;
  if (y < range.from.y || y > range.to.y) return false;
  if (y === range.from.y && x < range.from.x) return false;
  if (y === range.to.y && x > range.to.x) return false;
  return true;
}

function selectedText(): string {
  const range = orderedSelection();
  const client = selectionClientRect();
  if (!range || !client) return "";
  const lines: string[] = [];
  for (let y = range.from.y; y <= range.to.y; y += 1) {
    const row = lastFrame[client.row + y] ?? [];
    const startX = y === range.from.y ? range.from.x : 0;
    const endX = y === range.to.y ? range.to.x : client.width - 1;
    let line = "";
    for (let x = startX; x <= endX && client.column + x < row.length; x += 1) {
      line += row[client.column + x]?.char ?? " ";
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

/** Minimize/restore fly ghosts, the exomux taskbar gesture in miniature. */
interface FlyGhost {
  readonly from: Rectangle;
  readonly to: Rectangle;
  readonly start: number;
  readonly duration: number;
}
let flyGhosts: FlyGhost[] = [];
/** Window rects as last painted, for ghosts that start where the eye was. */
const lastWindowRects = new Map<string, Rectangle>();

function pushFlyGhost(from: Rectangle | undefined, to: Rectangle | undefined, now: number): void {
  if (!from || !to || from.width <= 0 || to.width <= 0) return;
  flyGhosts.push({ from, to, start: now, duration: 170 });
}

function paintFlyGhosts(frame: VizCell[][], now: number): void {
  flyGhosts = flyGhosts.filter((ghost) => now - ghost.start < ghost.duration);
  for (const ghost of flyGhosts) {
    const t = Math.min(1, (now - ghost.start) / ghost.duration);
    const ease = 1 - Math.pow(1 - t, 3);
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * ease);
    const rect: Rectangle = {
      column: lerp(ghost.from.column, ghost.to.column),
      row: lerp(ghost.from.row, ghost.to.row),
      width: Math.max(2, lerp(ghost.from.width, ghost.to.width)),
      height: Math.max(1, lerp(ghost.from.height, ghost.to.height)),
    };
    borderBoxOnGround(
      frameSurface(frame),
      rect,
      THIN_GLYPHS,
      DESKTOP.accent,
      (x: number, y: number) => frame[y]?.[x]?.background ?? DESKTOP.wallpaper,
      true,
    );
  }
}

function openContextMenu(column: number, row: number, items: ContextMenuItem[]): void {
  const width = Math.min(
    Math.max(18, items.reduce((max, item) => Math.max(max, item.label.length), 0) + 4),
    Math.max(10, columns() - column - 1),
  );
  const height = items.length + 2;
  contextMenu = {
    rect: {
      column: Math.min(column, Math.max(0, columns() - width)),
      row: Math.min(row, Math.max(1, rows() - height)),
      width,
      height,
    },
    items,
  };
}

function contextMenuItemsFor(column: number, row: number): ContextMenuItem[] {
  const projection = windowHost.project(bodyBounds(), projectionOptions());
  const over = [...projection.windows].reverse().find((window) => contains(window.rect, column, row));
  if (over) {
    const id = over.id;
    const maximized = over.state === "maximized";
    return [
      {
        label: maximized ? "restore" : "maximize",
        action: () => windowHost.execute({ kind: "toggle-maximize", id }, bodyBounds(), projectionOptions()),
      },
      {
        label: "minimize",
        action: () => windowHost.execute({ kind: "minimize", id }, bodyBounds(), projectionOptions()),
      },
      {
        label: over.placement === "floating" ? "tile" : "float",
        action: () => windowHost.execute({ kind: "toggle-placement", id }, bodyBounds(), projectionOptions()),
      },
      {
        label: "close",
        danger: true,
        action: () => windowHost.execute({ kind: "close", id }, bodyBounds(), projectionOptions()),
      },
    ];
  }
  const wallpapers = wallpaperStyles();
  const at = wallpapers.findIndex((style) => style.id === desktopSettings.wallpaper);
  return [
    {
      label: "next background",
      action: () => {
        desktopSettings.wallpaper = wallpapers[(at + 1) % wallpapers.length]!.id;
        persistDesktop();
      },
    },
    {
      label: "next theme",
      action: () => {
        const index = SHELL_THEMES.findIndex((theme) => theme.id === themeSpec.id);
        applyShellTheme(SHELL_THEMES[(index + 1) % SHELL_THEMES.length]!);
      },
    },
    ...(services.shader ? [{ label: "degauss", action: () => services.shader!.degauss() }] : []),
    { label: "settings", action: () => presentDemoWindow("settings") },
    { label: "help", action: () => presentDemoWindow("help") },
  ];
}

function paintContextMenu(frame: VizCell[][]): void {
  if (!contextMenu) return;
  const { rect, items } = contextMenu;
  paintShellMenuPanel(
    frameSurface(frame),
    rect,
    items.map((item, index) => ({
      rect: { column: rect.column + 1, row: rect.row + 1 + index, width: rect.width - 2, height: 1 },
      label: ` ${item.label}`,
      danger: item.danger,
    })),
    {
      panelFill: { foreground: DESKTOP.chromeText, background: DESKTOP.menu },
      borderGlyphs: THIN_GLYPHS,
      borderStyle: { foreground: DESKTOP.accent, background: DESKTOP.menu, bold: true },
      rowStyle: { foreground: DESKTOP.chromeText, background: DESKTOP.menu },
      dangerForeground: DESKTOP.danger,
    },
  );
}

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

const START_BUTTON = " ⏻ exowebtui ";

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
  const fromTab = paintedTabRects.find((candidate) => candidate.id === id)?.rect;
  const wasHidden = (() => {
    const state = windowHost.controller.inspect().windows.find((window) => window.id === id)?.state;
    return state === "minimized" || state === "closed";
  })();
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
  if (wasHidden) {
    const landed = windowHost.project(bodyBounds(), projectionOptions()).windows.find((window) => window.id === id);
    pushFlyGhost(fromTab ?? { column: 1, row: 0, width: 8, height: 1 }, landed?.rect, performance.now());
  }
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
    services.openExternal?.(item.href);
    return;
  }
  if (item.id === "three") void services.threeOverlay?.ensure();
  presentDemoWindow(item.id);
}

/**
 * The renderer draws on the shared canvas above the desktop text, so it is
 * only handed a rectangle while nothing could legitimately cover it: its
 * window topmost, not minimized, the start menu closed. Everything else shows
 * the adapter's placeholder instead of a wrong stacking order.
 */
function syncThreeOverlay(): void {
  const threeOverlay = services.threeOverlay;
  if (!threeOverlay || threeOverlay.state() !== "ready") return;
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
    titleForeground: window.active ? ON_ACCENT : DESKTOP.chromeMuted,
    titleBold: window.active,
    controlBold: (control) => control.tone === "danger" || window.active,
    controlForeground: window.active ? ON_ACCENT : DESKTOP.chromeMuted,
  });
  const client = window.clientRect;
  if (client.width <= 0 || client.height <= 0) return;
  if (demo) {
    blitFrame(frame, { column: client.column, row: client.row }, demo.render(client.width, client.height, now));
    // A right-edge scrollbar wherever the content overflows the viewport —
    // the render above has already clamped the demo's own offset.
    const scroll = demo.vscroll?.(client.width, client.height);
    if (scroll && scroll.total > client.height && client.height >= 2 && client.width >= 2) {
      const track = client.height;
      const thumb = Math.max(1, Math.floor(track * client.height / scroll.total));
      const maxOffset = Math.max(1, scroll.total - client.height);
      const position = Math.min(track - thumb, Math.round(scroll.offset / maxOffset * (track - thumb)));
      const x = client.column + client.width - 1;
      for (let row = 0; row < track; row += 1) {
        const line = frame[client.row + row];
        if (!line || x < 0 || x >= line.length) continue;
        const inThumb = row >= position && row < position + thumb;
        line[x] = {
          char: inThumb ? "█" : "░",
          foreground: inThumb ? DESKTOP.accent : DESKTOP.chromeMuted,
          background: DESKTOP.clientGround,
        };
      }
    }
    // The control strip: every key the demo answers to, as a tappable button
    // row along the bottom of the client — the demo works without a keyboard.
    if (demo.controls && demo.controls.length > 0 && client.height >= 3) {
      const stripY = client.row + client.height - 1;
      const line = frame[stripY];
      if (line) {
        for (let column = 0; column < client.width; column += 1) {
          const frameX = client.column + column;
          if (frameX < 0 || frameX >= line.length) continue;
          line[frameX] = { char: " ", foreground: DESKTOP.chromeMuted, background: DESKTOP.chromeIdle };
        }
        for (const span of demoControlSpans(demo, client.width)) {
          // Accent ground with the theme's computed on-accent ink — the same
          // pair the active title bar reads by, in every theme.
          const text = ` ${span.control.label} `;
          for (let offset = 0; offset < text.length; offset += 1) {
            const frameX = client.column + span.from + offset;
            if (frameX < 0 || frameX >= line.length) continue;
            line[frameX] = { char: text[offset]!, foreground: ON_ACCENT, background: DESKTOP.accent };
          }
        }
      }
    }
  } else {
    fillRect(frame, client, DESKTOP.clientGround);
  }
  // The selection inverts inside this window's client area, and nowhere else.
  const range = orderedSelection();
  if (range && range.windowId === window.id) {
    for (let localY = range.from.y; localY <= range.to.y; localY += 1) {
      const y = client.row + localY;
      const row = frame[y];
      if (!row || localY < 0 || localY >= client.height) continue;
      for (let localX = 0; localX < client.width; localX += 1) {
        if (!selectionCoversLocal(localX, localY)) continue;
        const x = client.column + localX;
        if (x < 0 || x >= row.length) continue;
        const cell = row[x]!;
        row[x] = {
          char: cell.char,
          foreground: cell.background ?? DESKTOP.clientGround,
          background: cell.foreground ?? DESKTOP.chromeText,
        };
      }
    }
  }
  // The glass: exomux's translucency, blended against the live backdrop. The
  // chrome keeps half the transparency so borders and titles stay legible.
  const opacity = desktopSettings.windowOpacity;
  if (opacity < 1) {
    const chromeOpacity = Math.min(1, opacity + (1 - opacity) / 2);
    for (let y = window.rect.row; y < window.rect.row + window.rect.height; y += 1) {
      const line = frame[y];
      if (!line) continue;
      const inClientRow = y >= client.row && y < client.row + client.height;
      for (let x = window.rect.column; x < window.rect.column + window.rect.width; x += 1) {
        if (x < 0 || x >= line.length) continue;
        const cell = line[x]!;
        if (!cell.background) continue;
        const inClient = inClientRow && x >= client.column && x < client.column + client.width;
        line[x] = {
          char: cell.char,
          foreground: cell.foreground,
          background: mixRgb(backdropAt(x, y), cell.background as Rgb, inClient ? opacity : chromeOpacity),
        };
      }
    }
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
    activeTab: { foreground: ON_ACCENT, background: DESKTOP.chromeActive },
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
  writeText(frame, rect.column + 2, rect.row, " exowebtui ", {
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
      foreground: selected ? ON_ACCENT : DESKTOP.accent,
      background: ground,
    });
    writeText(frame, rect.column + 6, itemRect.row, item.title.slice(0, Math.max(0, rect.width - 7)), {
      foreground: selected ? ON_ACCENT : DESKTOP.chromeText,
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
  if (style === "dots") {
    for (let row = 1; row < height; row += 3) {
      for (let column = row % 2 === 0 ? 2 : 4; column < width; column += 6) {
        frame[row]![column] = { char: "·", foreground: DESKTOP.wallpaperDot, background: DESKTOP.wallpaper };
      }
    }
    return;
  }
  // A live field from the shared catalog: exomux's simulation, this canvas.
  const field = currentBackgroundField();
  if (!field) return;
  const body = bodyBounds();
  let advanced = false;
  if (now - lastBackgroundAdvance >= backgroundFrameMs) {
    lastBackgroundAdvance = now;
    backgroundAdvanceCount += 1;
    const projection = windowHost.project(body, projectionOptions());
    advanced = field.advance({
      bounds: body,
      obstacles: projection.windows.map((window) => window.rect),
      now,
    });
  }
  const key = `${backgroundFieldId}|${themeSpec.id}|${body.width}x${body.height}`;
  if (advanced || !backgroundCells || backgroundCellsKey !== key) {
    backgroundCells = field.rasterizeCells(body, themeSpec);
    backgroundCellsKey = key;
  }
  const cells = backgroundCells;
  for (let row = 0; row < cells.length; row += 1) {
    const line = cells[row];
    if (!line) continue;
    for (let column = 0; column < line.length; column += 1) {
      const cell = line[column];
      if (!cell) continue;
      const target = frame[body.row + row];
      if (!target || body.column + column >= target.length) continue;
      // A full block is a fill: paint it as background so the glyph's font
      // metrics can never leave seams between cells.
      target[body.column + column] = cell.char === "█"
        ? { char: " ", background: cell.foreground }
        : { char: cell.char, foreground: cell.foreground, background: DESKTOP.wallpaper };
    }
  }
}

let lastFrame: VizCell[][] = [];
let lastPointerCell: { x: number; y: number; kind: string } | undefined;
let pointerKindCounts: Record<string, number> = {};

function paintDesktop(now: number): VizCell[][] {
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
  lastWindowRects.clear();
  for (const window of projection.windows) lastWindowRects.set(window.id, window.rect);
  if (projection.switcher) {
    paintShellSwitcher(frameSurface(frame), projection.switcher, bodyBounds(), {
      colors: {
        panelFill: { foreground: DESKTOP.chromeText, background: DESKTOP.menu },
        frame: { foreground: DESKTOP.accent, background: DESKTOP.menu, bold: true },
        item: { foreground: DESKTOP.chromeText, background: DESKTOP.menu },
        selectedItem: { foreground: ON_ACCENT, background: DESKTOP.menuSelected, bold: true },
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
  if (backgroundField && animatedBackgroundHasOverlay(backgroundField)) {
    const body = bodyBounds();
    for (const cell of backgroundField.rasterizeOverlayCells(body, themeSpec)) {
      const target = frame[body.row + cell.row];
      if (!target || body.column + cell.column >= target.length) continue;
      const under = target[body.column + cell.column]!;
      target[body.column + cell.column] = {
        char: cell.cell.char,
        foreground: cell.cell.foreground,
        background: under.background ?? DESKTOP.wallpaper,
      };
    }
  }
  paintBar(frame);
  if (startMenuOpen) paintStartMenu(frame);
  paintContextMenu(frame);
  paintFlyGhosts(frame, now);
  const chip = degaussChipRect();
  if (chip && services.shader) {
    const level = services.shader.magnetism();
    const alarmed = level >= MAGNET_BLINK_THRESHOLD;
    const blinkOn = alarmed && Math.floor(now / 380) % 2 === 0;
    const chipGround = blinkOn ? DESKTOP.danger : alarmed ? DESKTOP.accent : DESKTOP.chromeIdle;
    const chipInk = blinkOn || alarmed ? ON_ACCENT : DESKTOP.chromeText;
    const line = frame[chip.row];
    if (line) {
      for (let offset = 0; offset < DEGAUSS_CHIP.length; offset += 1) {
        const x = chip.column + offset;
        if (x < 0 || x >= line.length) continue;
        line[x] = { char: DEGAUSS_CHIP[offset]!, foreground: chipInk, background: chipGround };
      }
    }
  }
  // The drawn pointer: the OS cursor is hidden on this page, so the cell
  // cursor IS the pointer — and it rides the shader warp with the picture.
  const cursor = softwareCursorRender(
    cursorVisible,
    cursorPoint,
    windowHost.project(bodyBounds(), projectionOptions()),
    contextMenu === undefined && !startMenuOpen,
  );
  if (cursor) {
    const line = frame[cursor.row];
    if (line && cursor.column >= 0 && cursor.column < line.length) {
      const under = line[cursor.column]!;
      line[cursor.column] = { char: cursor.glyph, foreground: DESKTOP.accent, background: under.background };
    }
  }
  lastFrame = frame;
  return frame;
}

/** One frame of the desktop: sample the demos, compose, sync the overlay. */
function composeDesktopFrame(now: number): VizCell[][] {
  for (const demo of DEMOS) demo.sample?.(now);
  const frame = paintDesktop(now);
  syncThreeOverlay();
  return frame;
}

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

function handleDesktopPointer(event: PointerInputEvent): void {
  const cell = event.coordinates.cell;
  if (!cell) return;
  const { x, y } = cell;
  lastPointerCell = { x, y, kind: `${event.kind}:${event.device}` };
  if (event.device === "touch" || event.kind === "leave") {
    cursorVisible = false;
    cursorPoint = undefined;
  } else {
    cursorVisible = true;
    cursorPoint = { column: x, row: y };
  }
  pointerKindCounts[`${event.kind}:${event.device}`] = (pointerKindCounts[`${event.kind}:${event.device}`] ?? 0) + 1;
  if (event.kind === "move" && backgroundField) backgroundField.setPointer({ column: x, row: y });
  if (contextMenu) {
    if (event.kind !== "down") return;
    const { rect, items } = contextMenu;
    const index = y - rect.row - 1;
    contextMenu = undefined;
    if (contains(rect, x, y) && index >= 0 && index < items.length) items[index]!.action();
    return;
  }
  if (event.kind === "down" && event.button === 2) {
    startMenuOpen = false;
    openContextMenu(x, y, contextMenuItemsFor(x, y));
    return;
  }
  if (event.kind === "down" && event.button !== 2) {
    const chip = degaussChipRect();
    if (chip && contains(chip, x, y)) {
      services.shader!.degauss();
      return;
    }
  }
  // Text selection: a primary drag across ONE window's client area, in that
  // window's own cells. The anchor arms on down; real movement starts the
  // selection — at which point the host's in-flight gesture is cancelled so
  // its press/drag state machine resolves and nothing wanders.
  if (event.kind === "down" && event.button !== 2) {
    const projection = windowHost.project(bodyBounds(), projectionOptions());
    // The TOPMOST window under the pointer owns the down. Only when the point
    // is inside that window's CLIENT does a gesture arm — its title bar,
    // borders, and any window beneath it belong to the host's gestures.
    const top = [...projection.windows].reverse().find((candidate) => contains(candidate.rect, x, y));
    const inClient = top !== undefined && contains(top.clientRect, x, y);
    if (inClient && event.device === "touch") {
      // Touch convention: a drag moves the CONTENT. Selection stays with the
      // mouse and the pen, where a drag has always meant selecting.
      touchScroll = { windowId: top.id, startY: y, applied: 0, active: false };
      selectionAnchor = undefined;
    } else {
      touchScroll = undefined;
      selectionAnchor = inClient
        ? { windowId: top.id, local: { x: x - top.clientRect.column, y: y - top.clientRect.row } }
        : undefined;
    }
    if (selection) selection = undefined;
  } else if (event.kind === "move" && touchScroll) {
    const delta = touchScroll.startY - y;
    if (touchScroll.active || Math.abs(delta) >= 2) {
      if (!touchScroll.active) {
        // Resolve whatever the host began on the down before taking over.
        windowHost.handlePointer({ ...event, kind: "cancel" }, bodyBounds(), projectionOptions());
        touchScroll.active = true;
      }
      // One wheel tick (three lines) per three rows of travel keeps the
      // content pinned under the finger.
      const ticks = Math.trunc(delta / 3);
      const demo = demoById.get(touchScroll.windowId);
      while (touchScroll.applied < ticks) {
        demo?.onWheel?.(1, x, y);
        touchScroll.applied += 1;
      }
      while (touchScroll.applied > ticks) {
        demo?.onWheel?.(-1, x, y);
        touchScroll.applied -= 1;
      }
      return;
    }
  } else if (event.kind === "move" && selectionAnchor) {
    const projection = windowHost.project(bodyBounds(), projectionOptions());
    const owner = projection.windows.find((candidate) => candidate.id === selectionAnchor!.windowId);
    if (!owner) {
      selectionAnchor = undefined;
      selecting = false;
    } else {
      const local = {
        x: Math.max(0, Math.min(owner.clientRect.width - 1, x - owner.clientRect.column)),
        y: Math.max(0, Math.min(owner.clientRect.height - 1, y - owner.clientRect.row)),
      };
      const drift = Math.abs(local.x - selectionAnchor.local.x) + Math.abs(local.y - selectionAnchor.local.y);
      if (selecting || drift >= 2) {
        if (!selecting) {
          // Resolve whatever the host began on the down before taking over.
          windowHost.handlePointer({ ...event, kind: "cancel" }, bodyBounds(), projectionOptions());
        }
        selecting = true;
        selection = { windowId: selectionAnchor.windowId, from: selectionAnchor.local, to: local };
        return;
      }
    }
  } else if (event.kind === "up" || event.kind === "cancel") {
    if (touchScroll?.active) {
      touchScroll = undefined;
      return;
    }
    touchScroll = undefined;
    if (selecting && selection) {
      const text = selectedText();
      if (text.trim().length > 0) services.copyText?.(text);
      selecting = false;
      selectionAnchor = undefined;
      return;
    }
    selecting = false;
    selectionAnchor = undefined;
  }
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
            pushFlyGhost(lastWindowRects.get(tab.id), tab.rect, performance.now());
            windowHost.execute({ kind: "minimize", id: tab.id }, bodyBounds(), projectionOptions());
          } else presentDemoWindow(tab.id);
          return;
        }
      }
      return;
    }
  }
  const before = new Map(lastWindowRects);
  const result = windowHost.handlePointer(event, bodyBounds(), projectionOptions());
  if (
    event.kind === "down" && (result.interaction !== undefined || (result.command && result.command.kind !== "focus"))
  ) {
    // The host began a drag, resize, or chrome action on this down; the
    // selection must never fight it.
    selectionAnchor = undefined;
  }
  if (result.command?.kind === "minimize") {
    const id = result.command.id;
    const tab = paintedTabRects.find((candidate) => candidate.id === id);
    if (id) pushFlyGhost(before.get(id), tab?.rect, performance.now());
  }
  if (event.kind === "down") {
    const window = activeDemoWindow();
    // A down inside the client belongs to the demo unless chrome claimed it —
    // and focusing the window it landed in is not a claim, it is a side effect
    // of every client click.
    const chromeClaimed = result.command !== undefined && result.command.kind !== "focus";
    if (window && contains(window.clientRect, x, y) && !chromeClaimed) {
      const demo = demoById.get(window.id);
      const localX = x - window.clientRect.column;
      const localY = y - window.clientRect.row;
      if (
        demo?.controls && demo.controls.length > 0 && window.clientRect.height >= 3 &&
        localY === window.clientRect.height - 1
      ) {
        const span = demoControlSpans(demo, window.clientRect.width)
          .find((candidate) => localX >= candidate.from && localX < candidate.to);
        if (span) pressDemoKey(demo, span.control.key);
        return;
      }
      demo?.onPointerDown?.(localX, localY);
      return;
    }
    // Nothing claimed the down: it landed on the wallpaper, and an interactive
    // field (the circuit's nodes light their wires) takes the pick.
    if (!result.handled) {
      const projection = windowHost.project(bodyBounds(), projectionOptions());
      const overWindow = projection.windows.some((candidate) => contains(candidate.rect, x, y));
      const onDesktop = !overWindow && y !== barBounds().row;
      if (onDesktop && mobileLayout()) {
        // A phone has no right-click and its windows fill the screen; bare
        // wallpaper is the one tap target left, so it opens the start menu.
        startMenuOpen = true;
        startMenuSelected = 0;
        return;
      }
      if (onDesktop && backgroundField && animatedBackgroundAcceptsPicks(backgroundField)) {
        backgroundField.pick(x, y);
      }
    }
  }
}

function handleDesktopWheel(event: MouseScrollEvent): void {
  const direction: 1 | -1 = event.scroll >= 0 ? 1 : -1;
  const { x, y } = event;
  if (startMenuOpen) {
    startMenuSelected = (startMenuSelected + direction + START_MENU_ITEMS.length) % START_MENU_ITEMS.length;
    return;
  }
  const projection = windowHost.project(bodyBounds(), projectionOptions());
  const over = [...projection.windows].reverse().find((window) => contains(window.clientRect, x, y));
  if (over) {
    demoById.get(over.id)?.onWheel?.(direction, x - over.clientRect.column, y - over.clientRect.row);
  }
}

function handleDesktopKey(event: KeyPressEvent): void {
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
  if (contextMenu && event.key === "escape") {
    contextMenu = undefined;
    return;
  }
  if (selection && event.key === "escape") {
    selection = undefined;
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
}

// Debug hook for driving the page from CDP during development; carries no UI.
(globalThis as unknown as Record<string, unknown>).__desktop = {
  order: () =>
    windowHost.project(bodyBounds(), projectionOptions()).windows.map((window) =>
      `${window.id}:${window.placement}:${window.state}${
        window.active ? "*" : ""
      }@r${window.rect.row}+${window.rect.height}c${window.rect.column}+${window.rect.width} client r${window.clientRect.row}+${window.clientRect.height}`
    ),
  row: (index: number) => (lastFrame[index] ?? []).map((cell) => cell.char).join(""),
  pointer: () => lastPointerCell,
  kinds: () => pointerKindCounts,
  preset: () => (backgroundField as { presetIndex?: number } | undefined)?.presetIndex,
  advances: () => backgroundAdvanceCount,
  magnet: () => services.shader?.magnetism(),
  field: () => backgroundField?.constructor?.name,
  stats: () => ({
    rows: lastFrame.length,
    columns: lastFrame[0]?.length ?? -1,
    size: presentedSize,
    presented: presentedCount,
  }),
  separators: () =>
    windowHost.project(bodyBounds(), projectionOptions()).separators.map((separator) =>
      `${separator.axis}@r${separator.rect.row}+${separator.rect.height}c${separator.rect.column}+${separator.rect.width}`
    ),
};

/** Persisted desktop settings; absent fields keep their defaults. */
interface DesktopPersisted {
  readonly themeId?: string;
  readonly wallpaper?: string;
  readonly barHints?: boolean;
  /** Legacy single-shader field, still honoured when `shaders` is absent. */
  readonly shader?: string;
  readonly shaders?: readonly string[];
  readonly shaderTuning?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly windowOpacity?: number;
}

function shaderTuningSnapshot(shader: DesktopShaderService): Record<string, Record<string, number>> {
  const snapshot: Record<string, Record<string, number>> = {};
  for (const entry of shader.list()) {
    for (const option of entry.options ?? []) {
      const value = shader.option(entry.id, option.key);
      if (value === undefined) continue;
      (snapshot[entry.id] ??= {})[option.key] = value;
    }
  }
  return snapshot;
}

let persist: (() => void) | undefined;

/** Saves the current theme and settings through the presenter's store. */
function persistDesktop(): void {
  persist?.();
}

/**
 * The desktop as a portable application: everything above this line is
 * host-neutral, and this is the only object a host needs. Both entries —
 * the web page and the console — run exactly this.
 */
export function createDesktopApp(givenServices: DesktopServices = {}): ShellApp {
  services = givenServices;
  return {
    async init(presenter) {
      presentedSize = presenter.size();
      const store = presenter.store<DesktopPersisted>("desktop");
      try {
        const saved = await store.get("settings");
        if (saved?.themeId) {
          const spec = SHELL_THEMES.find((theme) => theme.id === saved.themeId);
          if (spec) applyShellTheme(spec);
        }
        if (saved?.wallpaper) desktopSettings.wallpaper = saved.wallpaper;
        if (saved?.barHints !== undefined) desktopSettings.barHints = saved.barHints;
        if (services.shader) {
          if (saved?.shaders) services.shader.setEnabled(saved.shaders);
          else if (saved?.shader && saved.shader !== "none") services.shader.setEnabled([saved.shader]);
          else services.shader.setEnabled(services.shader.list().map((entry) => entry.id));
          for (const [id, tuning] of Object.entries(saved?.shaderTuning ?? {})) {
            for (const [key, value] of Object.entries(tuning)) {
              if (typeof value === "number") services.shader.setOption(id, key, value);
            }
          }
        }
        if (typeof saved?.windowOpacity === "number") desktopSettings.windowOpacity = saved.windowOpacity;
      } catch {
        // A broken store never blocks boot; defaults stand.
      }
      persist = () => {
        void store.set("settings", {
          themeId: themeSpec.id,
          wallpaper: desktopSettings.wallpaper,
          barHints: desktopSettings.barHints,
          ...(services.shader
            ? { shaders: [...services.shader.enabled()], shaderTuning: shaderTuningSnapshot(services.shader) }
            : {}),
          windowOpacity: desktopSettings.windowOpacity,
        }).catch(() => {});
      };
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
    },
    frame(now, size) {
      presentedSize = size;
      return composeDesktopFrame(now);
    },
    key: handleDesktopKey,
    pointer: handleDesktopPointer,
    wheel: handleDesktopWheel,
    resize(size) {
      presentedSize = size;
      fitWindowsToViewport();
    },
  };
}
