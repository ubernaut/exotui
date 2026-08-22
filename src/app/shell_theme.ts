// Copyright 2023 Im-Beast. MIT license.

// The desktop theme catalog, promoted from exomux so one set of themes drives
// every host — the terminal multiplexer and the web desktop alike. A theme is
// ten resolved colours plus an optional control-token map; the catalog is the
// native set, every Workbench palette, and the specials. exomux re-exports all
// of this under its historical names, so persisted workspaces keep their ids.

import { grWizardThemePalettes } from "../grwizard_themes.ts";
import type { ShellRgb } from "./workbench_shell.ts";

/** Re-exported so theme consumers need only this module. */
export type { ShellRgb } from "./workbench_shell.ts";

/** Seven named T2 color families used to keep the theme deliberate and testable. */
export const SHELL_T2_SWATCHES = {
  black: [3, 4, 8],
  charcoal: [24, 26, 34],
  darkBlue: [30, 58, 112],
  lightBlue: [205, 234, 255],
  darkPurple: [155, 115, 220],
  lightPurple: [220, 168, 255],
  /** Highlight accent: cool steel everywhere, one hot filament where focus lands. */
  hotPink: [255, 105, 180],
} as const satisfies Readonly<Record<string, ShellRgb>>;

/** One complete desktop chrome/default-terminal theme. */
export interface ShellThemeSpec {
  readonly id: string;
  readonly label: string;
  readonly background: ShellRgb;
  readonly surface: ShellRgb;
  readonly surfaceStrong: ShellRgb;
  readonly border: ShellRgb;
  readonly text: ShellRgb;
  readonly muted: ShellRgb;
  readonly accent: ShellRgb;
  readonly success: ShellRgb;
  readonly warning: ShellRgb;
  readonly danger: ShellRgb;
  /**
   * Every control token this theme resolves to, present on themes that came
   * from a document. The ten fields above are what most painting needs; this
   * is how a painter reaches the finer ones — an active title bar, a
   * scrollbar thumb — without another ten fields.
   */
  readonly controls?: Readonly<Record<string, ShellRgb>>;
}

const SHELL_WORKBENCH_THEME_IDS = [
  "unit01",
  "arcane",
  "forge",
  "grove",
  "velvet",
  "section9",
  "parchment",
  "seaglass",
] as const;

/** Stable Workbench identities accepted by persisted workspaces. */
export type ShellWorkbenchThemeId = (typeof SHELL_WORKBENCH_THEME_IDS)[number];

const SHELL_NATIVE_THEMES = [
  {
    id: "midnight",
    label: "Midnight Ops",
    background: [8, 12, 20],
    surface: [14, 21, 34],
    surfaceStrong: [24, 35, 54],
    border: [73, 101, 134],
    text: [224, 235, 246],
    muted: [132, 154, 178],
    accent: [76, 201, 240],
    success: [73, 209, 125],
    warning: [244, 190, 72],
    danger: [244, 104, 110],
  },
  {
    id: "amber",
    label: "Amber Glass",
    background: [20, 12, 2],
    surface: [37, 24, 7],
    surfaceStrong: [58, 39, 10],
    border: [145, 92, 21],
    text: [255, 220, 145],
    muted: [188, 137, 67],
    accent: [255, 174, 45],
    success: [182, 219, 82],
    warning: [255, 199, 80],
    danger: [255, 99, 71],
  },
  {
    id: "matrix",
    label: "Matrix Phosphor",
    background: [1, 13, 6],
    surface: [3, 25, 12],
    surfaceStrong: [6, 43, 20],
    border: [28, 112, 55],
    text: [156, 255, 173],
    muted: [72, 154, 91],
    accent: [45, 255, 96],
    success: [113, 255, 132],
    warning: [224, 241, 95],
    danger: [255, 91, 91],
  },
  {
    id: "paper",
    label: "Paper Terminal",
    background: [234, 229, 215],
    surface: [248, 245, 235],
    surfaceStrong: [218, 211, 194],
    border: [104, 98, 87],
    text: [35, 38, 42],
    muted: [101, 100, 96],
    accent: [33, 92, 145],
    success: [42, 116, 65],
    warning: [157, 101, 11],
    danger: [165, 48, 48],
  },
] as const satisfies readonly ShellThemeSpec[];

/** Complete catalog: native themes, every Workbench theme, then the specials. */
export const SHELL_THEMES: readonly ShellThemeSpec[] = [
  ...SHELL_NATIVE_THEMES,
  ...grWizardThemePalettes.map(shellWorkbenchTheme),
  {
    id: "t2",
    label: "T2 Neural Steel",
    background: SHELL_T2_SWATCHES.black,
    surface: SHELL_T2_SWATCHES.charcoal,
    surfaceStrong: SHELL_T2_SWATCHES.darkBlue,
    border: SHELL_T2_SWATCHES.darkPurple,
    text: SHELL_T2_SWATCHES.lightBlue,
    muted: SHELL_T2_SWATCHES.lightPurple,
    accent: SHELL_T2_SWATCHES.hotPink,
    success: SHELL_T2_SWATCHES.lightBlue,
    warning: SHELL_T2_SWATCHES.darkPurple,
    danger: SHELL_T2_SWATCHES.lightPurple,
  },
  {
    // TempleOS: 640x480, 16 colors, white ground — windows are ink on
    // paper delimited by VGA-blue borders, red for what matters.
    id: "templeos",
    label: "TempleOS",
    background: [255, 255, 255],
    surface: [255, 255, 255],
    surfaceStrong: [170, 170, 170],
    border: [0, 0, 170],
    text: [0, 0, 0],
    muted: [85, 85, 85],
    accent: [0, 0, 170],
    success: [0, 170, 0],
    warning: [170, 85, 0],
    danger: [170, 0, 0],
  },
  {
    // Miami by day. The palette is neon, and neon only works on a dark ground
    // when it is TEXT: at full strength on white, the hot pink measures 2.7:1
    // and cannot be read. So the light ground takes the palette as washes —
    // cyan paper, blue panels — and every role that has to be read is the same
    // hue carried down until it can be: mint for secondary text and success,
    // hot pink for focus, the blue for structure. Warning is the one colour
    // from outside the palette: it has no warm end, and a warning that reads
    // as pink or teal is a warning nobody sees.
    id: "miami",
    label: "Miami Neon",
    background: [214, 250, 249],
    surface: [240, 255, 254],
    surfaceStrong: [176, 222, 255],
    border: [10, 132, 224],
    text: [10, 45, 70],
    muted: [23, 122, 84],
    accent: [198, 24, 118],
    success: [8, 124, 76],
    warning: [163, 96, 0],
    danger: [186, 16, 44],
  },
  {
    // Nosferatu: the castle, not the popular palette of a similar name — blacks,
    // dark greys, and red as the single voice. Success stays a desaturated
    // moss and warning an old gold, quiet enough not to compete: in this room
    // red is the only thing allowed to bleed.
    id: "nosferatu",
    label: "Nosferatu",
    background: [9, 7, 8],
    surface: [19, 16, 17],
    surfaceStrong: [35, 29, 31],
    border: [122, 52, 56],
    text: [232, 224, 222],
    // Dark enough to carry the white on-accent text the red accent demands —
    // the unfocused selection paints this as its row.
    muted: [110, 97, 97],
    accent: [225, 58, 64],
    success: [130, 176, 130],
    warning: [214, 164, 84],
    danger: [255, 92, 92],
  },
  {
    // Black Sabbath: blacks, dark greys, and purple — the stage lights of the
    // album covers. The same discipline as Dracula with the hue swapped:
    // purple carries focus and identity, everything else keeps to the greys.
    id: "sabbath",
    label: "Sabbath",
    background: [8, 7, 12],
    surface: [17, 15, 24],
    surfaceStrong: [31, 27, 44],
    border: [104, 78, 148],
    text: [228, 223, 238],
    // As in Nosferatu: the purple accent picks white on-accent text, so the
    // muted row has to hold white at AA.
    muted: [104, 96, 122],
    accent: [178, 110, 255],
    success: [132, 182, 142],
    warning: [216, 168, 88],
    danger: [236, 92, 100],
  },
] as const satisfies readonly ShellThemeSpec[];

function shellWorkbenchTheme(
  palette: (typeof grWizardThemePalettes)[number],
): ShellThemeSpec {
  return {
    id: shellWorkbenchThemeId(palette.name),
    label: palette.label,
    background: shellHexRgb(palette.bg),
    surface: shellHexRgb(palette.surface),
    surfaceStrong: shellHexRgb(palette.panelAlt),
    border: shellHexRgb(palette.borderStrong),
    text: shellHexRgb(palette.text),
    muted: shellHexRgb(palette.textMuted),
    accent: shellHexRgb(palette.accent),
    success: shellHexRgb(palette.success),
    warning: shellHexRgb(palette.warning),
    danger: shellHexRgb(palette.danger),
  };
}

/** Fails loudly if the shared Workbench catalog changes without an ID migration. */
function shellWorkbenchThemeId(id: string): ShellWorkbenchThemeId {
  const match = SHELL_WORKBENCH_THEME_IDS.find((candidate) => candidate === id);
  if (!match) throw new TypeError(`Unsupported Workbench theme id: ${id}`);
  return match;
}

/** Converts the Workbench's canonical six-digit hex colors to renderer RGB. */
function shellHexRgb(hex: string): ShellRgb {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) throw new TypeError(`Invalid Workbench theme color: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return [(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** A control-token colour from the theme, or the caller's fallback. */
export function shellControlColor(
  theme: ShellThemeSpec,
  token: string,
  fallback: ShellRgb,
): ShellRgb {
  return theme.controls?.[token] ?? fallback;
}

/** The catalog theme with this id, or the first theme when the id is unknown. */
export function shellThemeById(id: string): ShellThemeSpec {
  return SHELL_THEMES.find((theme) => theme.id === id) ?? SHELL_THEMES[0]!;
}

/** WCAG relative luminance of a theme colour. */
export function shellRelativeLuminance(color: ShellRgb): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]);
}

/**
 * Text colour for a bar painted on the theme's accent. Judged from the accent
 * itself rather than a list of light theme ids: the rule is "contrast the
 * bar", and the threshold reproduces the hand-kept list exactly.
 */
export function shellActiveTitlebarForeground(theme: ShellThemeSpec): ShellRgb {
  return shellRelativeLuminance(theme.accent) < 0.3 ? [255, 255, 255] : [0, 0, 0];
}
