// Themes as token maps, the way exomux does it: a sparse set of named colours
// that the control-token vocabulary resolves everything else from. A theme sets
// the seven core colours and the visualisation palette follows, because every
// viz:* token falls back through the chrome and status tiers.
//
// Eight of them are exotui's own grWizard palettes, converted rather than
// copied: a themeable application should be able to adopt the library's themes
// without transcribing hex codes, and this is the shortest proof of that.

import { grWizardThemePalettes } from "../../../mod.ts";
import type { Rgb } from "../../../mod.theme.ts";

export interface MonitorPalette {
  readonly id: string;
  readonly label: string;
  /** The sparse token map, exactly what a theme document carries. */
  readonly tokens: Readonly<Record<string, Rgb>>;
}

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const HAND_ROLLED: readonly MonitorPalette[] = [
  {
    id: "midnight",
    label: "Midnight",
    tokens: {
      surface: rgb("#0b0f17"),
      panel: rgb("#141b28"),
      border: rgb("#2b3a52"),
      foreground: rgb("#d5e2f5"),
      muted: rgb("#5c6b87"),
      accent: rgb("#7fd6ff"),
      success: rgb("#54d6a0"),
      warning: rgb("#e6c463"),
      danger: rgb("#f2605f"),
    },
  },
  {
    id: "amber",
    label: "Amber CRT",
    tokens: {
      surface: rgb("#140f04"),
      panel: rgb("#20180a"),
      border: rgb("#5c4415"),
      foreground: rgb("#ffb638"),
      muted: rgb("#8a6420"),
      accent: rgb("#ffc45c"),
      success: rgb("#c8891f"),
      warning: rgb("#ffb638"),
      danger: rgb("#ff5f45"),
    },
  },
  {
    id: "paper",
    label: "Paper",
    tokens: {
      surface: rgb("#f4f1ea"),
      panel: rgb("#e7e2d6"),
      border: rgb("#c3bcab"),
      foreground: rgb("#2c2c2c"),
      muted: rgb("#7b7669"),
      accent: rgb("#1b3b6f"),
      success: rgb("#237a52"),
      warning: rgb("#94701a"),
      danger: rgb("#a32222"),
    },
  },
];

const FROM_LIBRARY: readonly MonitorPalette[] = grWizardThemePalettes.map((palette) => ({
  id: palette.name,
  label: palette.label,
  tokens: {
    surface: rgb(palette.bg),
    panel: rgb(palette.panel),
    border: rgb(palette.border),
    foreground: rgb(palette.text),
    muted: rgb(palette.textMuted),
    accent: rgb(palette.accent),
    success: rgb(palette.success),
    warning: rgb(palette.warning),
    danger: rgb(palette.danger),
  },
}));

export const MONITOR_THEMES: readonly MonitorPalette[] = Object.freeze([...HAND_ROLLED, ...FROM_LIBRARY]);

export function themeById(id: string): MonitorPalette {
  return MONITOR_THEMES.find((theme) => theme.id === id) ?? MONITOR_THEMES[0]!;
}

/** The next theme in the ring, for a keypress that cycles them. */
export function nextTheme(id: string): MonitorPalette {
  const index = MONITOR_THEMES.findIndex((theme) => theme.id === id);
  return MONITOR_THEMES[(index + 1 + MONITOR_THEMES.length) % MONITOR_THEMES.length]!;
}

/** A token, or a stated fallback — themes are sparse by design. */
export function token(palette: MonitorPalette, name: string, spare: Rgb): Rgb {
  return palette.tokens[name] ?? spare;
}
