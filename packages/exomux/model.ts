// Copyright 2023 Im-Beast. MIT license.

import { defineShowcaseManifest } from "@showcase/kit";
import { grWizardThemePalettes } from "@ubernaut/deno-tui";

/** Current Exomux workspace metadata schema. Live PTYs remain daemon-owned. */
export const EXOMUX_SESSION_SCHEMA_VERSION = 1 as const;

/** Upper bounds shared by the demo controller and its local host client. */
export const EXOMUX_MAX_SESSIONS = 32;
export const EXOMUX_MAX_COLUMNS = 512;
export const EXOMUX_MAX_ROWS = 256;

const EXOMUX_WORKBENCH_THEME_IDS = [
  "unit01",
  "arcane",
  "forge",
  "grove",
  "velvet",
  "section9",
  "parchment",
  "seaglass",
] as const;

/** Stable Workbench identities accepted by persisted Exomux workspaces. */
export type ExomuxWorkbenchThemeId = (typeof EXOMUX_WORKBENCH_THEME_IDS)[number];

/** Stable theme identities persisted with the window layout. */
export type ExomuxThemeId = "midnight" | "amber" | "matrix" | "paper" | ExomuxWorkbenchThemeId | "t2";

/** RGB tuple used by the renderer without depending on terminal palette state. */
export type ExomuxRgb = readonly [red: number, green: number, blue: number];

/** Seven named T2 color families used to keep the theme deliberate and testable. */
export const EXOMUX_T2_SWATCHES = {
  black: [3, 4, 8],
  charcoal: [24, 26, 34],
  darkBlue: [30, 58, 112],
  lightBlue: [205, 234, 255],
  darkPurple: [155, 115, 220],
  lightPurple: [220, 168, 255],
  /** Highlight accent: cool steel everywhere, one hot filament where focus lands. */
  hotPink: [255, 105, 180],
} as const satisfies Readonly<Record<string, ExomuxRgb>>;

/** One complete Exomux chrome/default-terminal theme. */
export interface ExomuxThemeSpec {
  readonly id: ExomuxThemeId;
  readonly label: string;
  readonly background: ExomuxRgb;
  readonly surface: ExomuxRgb;
  readonly surfaceStrong: ExomuxRgb;
  readonly border: ExomuxRgb;
  readonly text: ExomuxRgb;
  readonly muted: ExomuxRgb;
  readonly accent: ExomuxRgb;
  readonly success: ExomuxRgb;
  readonly warning: ExomuxRgb;
  readonly danger: ExomuxRgb;
}

/** Original Exomux themes retained in stable order for persisted workspaces. */
const EXOMUX_NATIVE_THEMES = [
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
] as const satisfies readonly ExomuxThemeSpec[];

/** Complete catalog: native themes, every Workbench theme, then T2. */
export const EXOMUX_THEMES = [
  ...EXOMUX_NATIVE_THEMES,
  ...grWizardThemePalettes.map(exomuxWorkbenchTheme),
  {
    id: "t2",
    label: "T2 Neural Steel",
    background: EXOMUX_T2_SWATCHES.black,
    surface: EXOMUX_T2_SWATCHES.charcoal,
    surfaceStrong: EXOMUX_T2_SWATCHES.darkBlue,
    border: EXOMUX_T2_SWATCHES.darkPurple,
    text: EXOMUX_T2_SWATCHES.lightBlue,
    muted: EXOMUX_T2_SWATCHES.lightPurple,
    accent: EXOMUX_T2_SWATCHES.hotPink,
    success: EXOMUX_T2_SWATCHES.lightBlue,
    warning: EXOMUX_T2_SWATCHES.darkPurple,
    danger: EXOMUX_T2_SWATCHES.lightPurple,
  },
] as const satisfies readonly ExomuxThemeSpec[];

/** Adapts one Workbench semantic palette without duplicating its hex source. */
function exomuxWorkbenchTheme(
  palette: (typeof grWizardThemePalettes)[number],
): ExomuxThemeSpec {
  return {
    id: exomuxWorkbenchThemeId(palette.name),
    label: palette.label,
    background: exomuxHexRgb(palette.bg),
    surface: exomuxHexRgb(palette.surface),
    surfaceStrong: exomuxHexRgb(palette.panelAlt),
    border: exomuxHexRgb(palette.borderStrong),
    text: exomuxHexRgb(palette.text),
    muted: exomuxHexRgb(palette.textMuted),
    accent: exomuxHexRgb(palette.accent),
    success: exomuxHexRgb(palette.success),
    warning: exomuxHexRgb(palette.warning),
    danger: exomuxHexRgb(palette.danger),
  };
}

/** Fails loudly if the shared Workbench catalog changes without an ID migration. */
function exomuxWorkbenchThemeId(id: string): ExomuxWorkbenchThemeId {
  const match = EXOMUX_WORKBENCH_THEME_IDS.find((candidate) => candidate === id);
  if (!match) throw new TypeError(`Unsupported Workbench theme id: ${id}`);
  return match;
}

/** Converts the Workbench's canonical six-digit hex colors to renderer RGB. */
function exomuxHexRgb(hex: string): ExomuxRgb {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) throw new TypeError(`Invalid Workbench theme color: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return [(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** Clone-safe session metadata returned by the detached host. */
export interface ExomuxSessionSummary {
  readonly id: string;
  readonly title: string;
  readonly commandLine: string;
  readonly status: "running" | "exited" | "failed";
  readonly running: boolean;
  readonly columns: number;
  readonly rows: number;
  readonly sequence: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly exitCode?: number;
}

/** One ordered terminal payload retained by the host for reattachment. */
export interface ExomuxOutputFrame {
  readonly sessionId: string;
  readonly sequence: number;
  readonly data: string | Uint8Array;
}

/** Result of attaching a client view to a host-owned terminal. */
export interface ExomuxAttachResult {
  readonly session: ExomuxSessionSummary;
  readonly replay: readonly ExomuxOutputFrame[];
  readonly truncated: boolean;
}

/** Options accepted when a new real shell is launched. */
export interface ExomuxSpawnOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly title?: string;
  readonly columns?: number;
  readonly rows?: number;
}

/** Narrow client port used by the renderer-neutral controller and fakes. */
export interface ExomuxClientPort {
  readonly connected: boolean;
  list(): Promise<readonly ExomuxSessionSummary[]>;
  spawn(options: ExomuxSpawnOptions): Promise<ExomuxSessionSummary>;
  attach(
    sessionId: string,
    options: {
      readonly sinceSequence?: number;
      readonly onOutput: (frame: ExomuxOutputFrame) => void;
      readonly onSession?: (session: ExomuxSessionSummary) => void;
    },
  ): Promise<ExomuxAttachResult>;
  detach(sessionId: string): Promise<boolean>;
  input(sessionId: string, data: string | Uint8Array): Promise<boolean>;
  resize(sessionId: string, columns: number, rows: number): Promise<boolean>;
  kill(sessionId: string): Promise<boolean>;
  shutdownHost(): Promise<boolean>;
  dispose(): Promise<void>;
}

/** JSON-safe metadata stored alongside the exact window-host snapshot. */
/** Selectable animated desktop backgrounds in stable cycle order. */
export const EXOMUX_BACKGROUND_IDS = [
  "metaballs",
  "matrix",
  "rainy windows",
  "circuit",
  "biomech",
  "jungle",
  "vaporwave",
  "skull",
  "ivy",
  "fire",
  "turbulence",
  "butterchurn",
  "image",
] as const;
export type ExomuxBackgroundId = (typeof EXOMUX_BACKGROUND_IDS)[number];

/** Normalizes any persisted value to a known background id. */
export function exomuxBackgroundId(value: unknown): ExomuxBackgroundId {
  return EXOMUX_BACKGROUND_IDS.includes(value as ExomuxBackgroundId) ? value as ExomuxBackgroundId : "metaballs";
}

export interface ExomuxWorkspaceState {
  readonly schemaVersion: typeof EXOMUX_SESSION_SCHEMA_VERSION;
  readonly themeId: ExomuxThemeId;
  readonly activeSessionId?: string;
  readonly terminalOrdinal: number;
  readonly savedHosts: readonly string[];
  readonly backgroundId: ExomuxBackgroundId;
  /** Session id → SSH target for shells opened from the network panel. */
  readonly sessionHosts: Readonly<Record<string, string>>;
  /** Session id → per-window shell settings edited from the titlebar config button. */
  readonly windowSettings: Readonly<Record<string, ExomuxWindowSettings>>;
  /** Desktop-wide settings edited from the global config modal. */
  readonly globalSettings: ExomuxGlobalSettings;
  /** Per-background settings edited from the background config modal. */
  readonly backgroundSettings: ExomuxBackgroundSettingsMap;
}

/** Per-window shell settings owned by one terminal window. */
export interface ExomuxWindowSettings {
  /** Recolor child output through the active theme (off shows the app's true ANSI colors). */
  readonly themed: boolean;
  /** Retained scrollback lines for the main screen buffer. */
  readonly scrollbackLimit: number;
  /** Forward mouse events to the child program instead of handling them locally. */
  readonly mouseReporting: boolean;
  /** Rows moved per wheel notch. */
  readonly wheelLines: number;
  /** Dim the window's output while it is not focused. */
  readonly dimInactive: boolean;
  /** Ask before killing this terminal. */
  readonly confirmClose: boolean;
  /**
   * How opaque this window's terminal background is, or
   * `EXOMUX_OPACITY_INHERIT` to follow the desktop-wide setting.
   *
   * At 1 the window paints its own surface colour, as it always has. Below
   * that, cells the program has not given a background of its own show the
   * desktop background behind the window, darkened toward the surface colour.
   */
  readonly opacity: number;
}

/** Per-window opacity value meaning "use the desktop-wide setting". */
export const EXOMUX_OPACITY_INHERIT = -1;

/** Per-window `wheelLines` value meaning "use the desktop-wide scroll speed". */
export const EXOMUX_SCROLL_INHERIT = 0;
/** The selectable scroll speeds, shared by the global and per-window settings. */
export const EXOMUX_SCROLL_VALUES: readonly number[] = Object.freeze([1, 2, 3, 5, 10]);

/** Formats a scroll speed for a config row. */
export function formatScrollLines(value: ExomuxSettingValue): string {
  const lines = Number(value);
  if (lines === EXOMUX_SCROLL_INHERIT) return "Desktop";
  return `${lines} ${lines === 1 ? "line" : "lines"}`;
}

/** Opacity steps offered by both config modals, most opaque first. */
export const EXOMUX_OPACITY_VALUES: readonly number[] = Object.freeze([1, 0.85, 0.7, 0.55, 0.4, 0.25]);

/** Formats an opacity for a config modal row. */
function formatOpacity(value: ExomuxSettingValue): string {
  const opacity = Number(value);
  if (opacity === EXOMUX_OPACITY_INHERIT) return "Desktop";
  return opacity >= 1 ? "Opaque" : `${Math.round(opacity * 100)}%`;
}

/**
 * Resolves the opacity one window renders at.
 *
 * A window may override the desktop-wide value or defer to it, so this is the
 * single place the two are combined; anything reading `settings.opacity`
 * directly would render an unresolved sentinel.
 */
export function exomuxResolvedOpacity(global: ExomuxGlobalSettings, window?: ExomuxWindowSettings): number {
  const own = window?.opacity ?? EXOMUX_OPACITY_INHERIT;
  const resolved = own === EXOMUX_OPACITY_INHERIT ? global.opacity : own;
  return Number.isFinite(resolved) ? Math.min(1, Math.max(0, resolved)) : 1;
}

/** Identity of one configurable per-window setting. */
export type ExomuxWindowSettingId = keyof ExomuxWindowSettings;

/** One cycleable setting, shared by the config modals and their tests. */
export interface ExomuxSettingSpec<TId extends string> {
  readonly id: TId;
  readonly label: string;
  readonly detail: string;
  readonly values: readonly ExomuxSettingValue[];
  readonly format: (value: ExomuxSettingValue) => string;
}

/** Every value a cycleable setting may hold. */
export type ExomuxSettingValue = boolean | number | string;

/** One cycleable per-window setting. */
export type ExomuxWindowSettingSpec = ExomuxSettingSpec<ExomuxWindowSettingId>;

const onOff = (value: ExomuxSettingValue): string => (value ? "On" : "Off");

/** Ordered per-window settings presented by the titlebar config modal. */
export const EXOMUX_WINDOW_SETTING_SPECS: readonly ExomuxWindowSettingSpec[] = Object.freeze([
  Object.freeze({
    id: "themed" as const,
    label: "Theme colors",
    detail: "Off renders the program's true ANSI colors, unmapped.",
    values: Object.freeze([true, false]),
    format: onOff,
  }),
  Object.freeze({
    id: "scrollbackLimit" as const,
    label: "Scrollback",
    detail: "Lines retained above the live screen.",
    values: Object.freeze([1_000, 2_000, 5_000, 10_000, 50_000]),
    format: (value: ExomuxSettingValue) => `${Number(value).toLocaleString("en-US")} lines`,
  }),
  Object.freeze({
    id: "mouseReporting" as const,
    label: "Mouse reporting",
    detail: "Off keeps the mouse local so you can scroll and select instead.",
    values: Object.freeze([true, false]),
    format: onOff,
  }),
  Object.freeze({
    id: "wheelLines" as const,
    label: "Scroll speed",
    detail: "Rows moved per wheel notch; Desktop follows the global scroll speed.",
    values: Object.freeze([EXOMUX_SCROLL_INHERIT, ...EXOMUX_SCROLL_VALUES]),
    format: formatScrollLines,
  }),
  Object.freeze({
    id: "dimInactive" as const,
    label: "Dim when inactive",
    detail: "Fades this window's output while another window has focus.",
    values: Object.freeze([false, true]),
    format: onOff,
  }),
  Object.freeze({
    id: "confirmClose" as const,
    label: "Confirm on close",
    detail: "Off kills this terminal immediately, with no prompt.",
    values: Object.freeze([true, false]),
    format: onOff,
  }),
  Object.freeze({
    id: "opacity" as const,
    label: "Opacity",
    detail: "Desktop follows the global setting; lower shows the background through this window.",
    values: Object.freeze([EXOMUX_OPACITY_INHERIT, ...EXOMUX_OPACITY_VALUES]),
    format: formatOpacity,
  }),
]) as readonly ExomuxWindowSettingSpec[];

/** Factory defaults applied to every terminal window. */
export function defaultExomuxWindowSettings(): ExomuxWindowSettings {
  return Object.freeze({
    themed: true,
    scrollbackLimit: 2_000,
    mouseReporting: true,
    wheelLines: EXOMUX_SCROLL_INHERIT,
    dimInactive: false,
    confirmClose: true,
    opacity: EXOMUX_OPACITY_INHERIT,
  });
}

/** Strictly normalizes one persisted per-window settings record. */
export function normalizeExomuxWindowSettings(value: unknown): ExomuxWindowSettings {
  return normalizeSettings(value, EXOMUX_WINDOW_SETTING_SPECS, defaultExomuxWindowSettings());
}

/** Returns the next value for one setting, wrapping in the declared order. */
function cycleSetting<TId extends string, TSettings extends Readonly<Record<TId, ExomuxSettingValue>>>(
  settings: TSettings,
  specs: readonly ExomuxSettingSpec<TId>[],
  id: TId,
  direction: number,
): TSettings {
  const spec = specs.find((candidate) => candidate.id === id);
  if (!spec) return settings;
  const current = spec.values.indexOf(settings[id]);
  const step = Math.sign(direction) || 1;
  const next = spec.values[(current + step + spec.values.length) % spec.values.length]!;
  return Object.freeze({ ...settings, [id]: next }) as TSettings;
}

/** Normalizes one persisted settings record against its spec table. */
function normalizeSettings<TId extends string, TSettings extends Readonly<Record<TId, ExomuxSettingValue>>>(
  value: unknown,
  specs: readonly ExomuxSettingSpec<TId>[],
  defaults: TSettings,
): TSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const record = value as Record<string, unknown>;
  const resolved: Record<string, ExomuxSettingValue> = { ...defaults };
  for (const spec of specs) {
    const candidate = record[spec.id];
    if (spec.values.includes(candidate as ExomuxSettingValue)) {
      resolved[spec.id] = candidate as ExomuxSettingValue;
    }
  }
  return Object.freeze(resolved) as TSettings;
}

/** Returns the next value for one per-window setting. */
export function cycleExomuxWindowSetting(
  settings: ExomuxWindowSettings,
  id: ExomuxWindowSettingId,
  direction = 1,
): ExomuxWindowSettings {
  return cycleSetting(settings, EXOMUX_WINDOW_SETTING_SPECS, id, direction);
}

/** Frame glyphs for one window border style. All must be single-width. */
export interface ExomuxBorderGlyphs {
  readonly topLeft: string;
  readonly top: string;
  readonly topRight: string;
  readonly left: string;
  readonly right: string;
  readonly bottomLeft: string;
  readonly bottom: string;
  readonly bottomRight: string;
  /** Divider drawn between side-by-side tiled windows. */
  readonly verticalSeparator: string;
  /** Divider drawn between stacked tiled windows. */
  readonly horizontalSeparator: string;
}

/** Stable border style identities persisted with the workspace. */
export const EXOMUX_BORDER_STYLE_IDS = ["thin", "square", "ascii"] as const;

/** One selectable window border style. */
export type ExomuxBorderStyleId = (typeof EXOMUX_BORDER_STYLE_IDS)[number];

/**
 * Window frame vocabularies. `thin` matches Zellij's default chrome — single
 * line box drawing with rounded corners — and is the default. `square` is the
 * same weight with hard corners, and `ascii` keeps the original blocky frame
 * for terminals or fonts without box-drawing coverage.
 */
export const EXOMUX_BORDER_STYLES: Readonly<Record<ExomuxBorderStyleId, ExomuxBorderGlyphs>> = Object.freeze({
  thin: Object.freeze({
    topLeft: "\u256d",
    top: "\u2500",
    topRight: "\u256e",
    left: "\u2502",
    right: "\u2502",
    bottomLeft: "\u2570",
    bottom: "\u2500",
    bottomRight: "\u256f",
    verticalSeparator: "\u2502",
    horizontalSeparator: "\u2500",
  }),
  square: Object.freeze({
    topLeft: "\u250c",
    top: "\u2500",
    topRight: "\u2510",
    left: "\u2502",
    right: "\u2502",
    bottomLeft: "\u2514",
    bottom: "\u2500",
    bottomRight: "\u2518",
    verticalSeparator: "\u2502",
    horizontalSeparator: "\u2500",
  }),
  ascii: Object.freeze({
    topLeft: "+",
    top: "-",
    topRight: "+",
    left: "|",
    right: "|",
    bottomLeft: "+",
    bottom: "-",
    bottomRight: "+",
    verticalSeparator: "|",
    horizontalSeparator: "-",
  }),
});

/** Resolves a persisted border style id, falling back to the Zellij-style thin frame. */
export function exomuxBorderStyleId(value: unknown): ExomuxBorderStyleId {
  return EXOMUX_BORDER_STYLE_IDS.includes(value as ExomuxBorderStyleId) ? value as ExomuxBorderStyleId : "thin";
}

/** Returns the frame glyphs for one border style. */
export function exomuxBorderGlyphs(id: unknown): ExomuxBorderGlyphs {
  return EXOMUX_BORDER_STYLES[exomuxBorderStyleId(id)];
}

/** Desktop-wide settings edited from the global config modal. */
export interface ExomuxGlobalSettings {
  /** Let the animated background reclaim windows that have lost focus. */
  readonly overgrowInactive: boolean;
  /** Milliseconds of idling before a window is as overgrown as it will get. */
  readonly overgrowFullMs: number;
  /** Window frame vocabulary. */
  readonly borderStyle: ExomuxBorderStyleId;
  /**
   * How opaque terminal windows are by default.
   *
   * At 1 windows paint their own surface colour. Below that, cells the program
   * has not given a background of its own show the desktop background behind
   * the window, darkened toward the surface colour. Individual windows may
   * override this.
   */
  readonly opacity: number;
  /** Default rows moved per wheel notch; a window may override it. */
  readonly scrollLines: number;
  /**
   * Draw a themed block cursor at the mouse position. It follows the mouse via
   * any-motion tracking and coexists with the terminal's own pointer, so it pairs
   * with a terminal that can hide that pointer (e.g. Ghostty's mouse-hide-while-typing).
   */
  readonly blockCursor: boolean;
}

/**
 * Resolves how many rows one wheel notch moves for a window: its own
 * `wheelLines`, or the desktop-wide `scrollLines` when set to inherit.
 */
export function exomuxResolvedScrollLines(global: ExomuxGlobalSettings, window?: ExomuxWindowSettings): number {
  const own = window?.wheelLines ?? EXOMUX_SCROLL_INHERIT;
  const resolved = own === EXOMUX_SCROLL_INHERIT ? global.scrollLines : own;
  return Number.isFinite(resolved) && resolved >= 1 ? Math.min(20, Math.floor(resolved)) : 1;
}

/** Identity of one configurable desktop-wide setting. */
export type ExomuxGlobalSettingId = keyof ExomuxGlobalSettings;

/** One cycleable desktop-wide setting. */
export type ExomuxGlobalSettingSpec = ExomuxSettingSpec<ExomuxGlobalSettingId>;

/** Ordered desktop-wide settings presented by the global config modal. */
export const EXOMUX_GLOBAL_SETTING_SPECS: readonly ExomuxGlobalSettingSpec[] = Object.freeze([
  Object.freeze({
    id: "overgrowInactive" as const,
    label: "Overgrow inactive windows",
    detail: "Jungle, matrix and circuit creep over windows that lose focus.",
    values: Object.freeze([true, false]),
    format: onOff,
  }),
  Object.freeze({
    id: "overgrowFullMs" as const,
    label: "Overgrow time",
    detail: "How long a window idles before it is as overgrown as it gets.",
    values: Object.freeze([240_000, 120_000, 60_000, 30_000]),
    format: (value: ExomuxSettingValue) => `${Math.round(Number(value) / 1000)}s`,
  }),
  Object.freeze({
    id: "borderStyle" as const,
    label: "Window borders",
    detail: "Thin is Zellij-style rounded box drawing; ASCII suits sparse fonts.",
    values: Object.freeze([...EXOMUX_BORDER_STYLE_IDS]),
    format: (value: ExomuxSettingValue) => String(value),
  }),
  Object.freeze({
    id: "opacity" as const,
    label: "Window opacity",
    detail: "Below opaque, terminal windows show the desktop background through their text.",
    values: Object.freeze([...EXOMUX_OPACITY_VALUES]),
    format: formatOpacity,
  }),
  Object.freeze({
    id: "scrollLines" as const,
    label: "Scroll speed",
    detail: "Rows moved per wheel notch; a window can override it.",
    values: Object.freeze([...EXOMUX_SCROLL_VALUES]),
    format: formatScrollLines,
  }),
  Object.freeze({
    id: "blockCursor" as const,
    label: "Block mouse cursor",
    detail: "Draw a block at the mouse; pairs with a terminal that hides its own pointer.",
    values: Object.freeze([true, false]),
    format: onOff,
  }),
]) as readonly ExomuxGlobalSettingSpec[];

/** Factory defaults for desktop-wide settings. */
export function defaultExomuxGlobalSettings(): ExomuxGlobalSettings {
  return Object.freeze({
    overgrowInactive: true,
    overgrowFullMs: 120_000,
    borderStyle: "thin" as const,
    // Slightly translucent out of the box: the live desktop showing through
    // terminal text is the look Exomux leads with.
    opacity: 0.85,
    // One row per wheel notch by default; a precise, unhurried scroll.
    scrollLines: 1,
    // Off by default: it coexists with the terminal's own pointer.
    blockCursor: false,
  });
}

/** Strictly normalizes persisted desktop-wide settings. */
export function normalizeExomuxGlobalSettings(value: unknown): ExomuxGlobalSettings {
  return normalizeSettings(value, EXOMUX_GLOBAL_SETTING_SPECS, defaultExomuxGlobalSettings());
}

/** Returns the next value for one desktop-wide setting. */
export function cycleExomuxGlobalSetting(
  settings: ExomuxGlobalSettings,
  id: ExomuxGlobalSettingId,
  direction = 1,
): ExomuxGlobalSettings {
  return cycleSetting(settings, EXOMUX_GLOBAL_SETTING_SPECS, id, direction);
}

// ── per-background settings ─────────────────────────────────────────────────

/** Values for one background's settings, keyed by setting id. */
export type ExomuxBackgroundSettingValues = Readonly<Record<string, ExomuxSettingValue>>;

/** Per-background settings, keyed by background id; absent means defaults. */
export type ExomuxBackgroundSettingsMap = Readonly<Partial<Record<ExomuxBackgroundId, ExomuxBackgroundSettingValues>>>;

/** Audio sources the butterchurn background can visualize. */
export const EXOMUX_AUDIO_MODES = ["mic", "system", "synth"] as const;
export type ExomuxAudioMode = (typeof EXOMUX_AUDIO_MODES)[number];

const formatAudioMode = (value: ExomuxSettingValue): string =>
  value === "mic" ? "Microphone" : value === "system" ? "System audio" : "Noise generator";

/** One relative-density spec, shared by the fields whose option is a multiplier. */
const densitySpec = (detail: string): ExomuxSettingSpec<string> =>
  Object.freeze({
    id: "density",
    label: "Density",
    detail,
    values: Object.freeze([1, 1.5, 2, 0.5, 0.75]),
    format: (value: ExomuxSettingValue) => `${Math.round(Number(value) * 100)}%`,
  });

/**
 * Cycleable settings per background, presented by the background config modal.
 *
 * Only backgrounds with genuinely tunable behaviour appear: every id listed
 * here is wired to a real constructor option or field method, and a background
 * absent from this table simply has nothing worth a knob. The butterchurn
 * preset picker and the image file browser are modal panes of their own, not
 * cycleable rows, so they are not listed either.
 */
export const EXOMUX_BACKGROUND_SETTING_SPECS: Readonly<
  Partial<Record<ExomuxBackgroundId, readonly ExomuxSettingSpec<string>[]>>
> = Object.freeze({
  matrix: Object.freeze([densitySpec("How many rain columns fall at once.")]),
  "rainy windows": Object.freeze([densitySpec("How many drops run down the glass.")]),
  circuit: Object.freeze([densitySpec("How many traces the board grows.")]),
  biomech: Object.freeze([densitySpec("How much of the lattice is alive.")]),
  ivy: Object.freeze([densitySpec("How many vines climb the desktop.")]),
  jungle: Object.freeze([densitySpec("How much undergrowth fills the desktop.")]),
  fire: Object.freeze([
    Object.freeze({
      id: "intensity",
      label: "Intensity",
      detail: "How hard the fire burns.",
      values: Object.freeze([1, 1.4, 1.8, 0.6, 0.8]),
      format: (value: ExomuxSettingValue) => `${Math.round(Number(value) * 100)}%`,
    }),
  ]),
  butterchurn: Object.freeze([
    Object.freeze({
      id: "cycleSeconds",
      label: "Cycle time",
      detail: "Seconds each preset holds the desktop; Hold stays on one.",
      values: Object.freeze([15, 30, 60, 120, 0, 5, 10]),
      format: (value: ExomuxSettingValue) => (Number(value) === 0 ? "Hold" : `${value}s`),
    }),
    Object.freeze({
      id: "updateHz",
      label: "Update rate",
      detail: "Frames per second the field advances at.",
      values: Object.freeze([60, 120, 5, 10, 15, 30]),
      format: (value: ExomuxSettingValue) => `${value} Hz`,
    }),
    Object.freeze({
      id: "audioMode",
      label: "Sound source",
      detail: "Microphone, the system output, or a generated signal.",
      values: Object.freeze([...EXOMUX_AUDIO_MODES]),
      format: formatAudioMode,
    }),
    Object.freeze({
      id: "debug",
      label: "Debug overlay",
      detail: "Shows CPU/WebGPU mode and the live preset name, and logs GPU messages to logs/.",
      values: Object.freeze([false, true]),
      format: onOff,
    }),
  ]),
}) as Readonly<Partial<Record<ExomuxBackgroundId, readonly ExomuxSettingSpec<string>[]>>>;

/** Defaults for one background: the first value of each of its specs. */
export function defaultExomuxBackgroundSettings(id: ExomuxBackgroundId): ExomuxBackgroundSettingValues {
  const specs = EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? [];
  const values: Record<string, ExomuxSettingValue> = {};
  for (const spec of specs) values[spec.id] = spec.values[0]!;
  return Object.freeze(values);
}

/** Resolves one background's settings against its defaults. */
export function exomuxBackgroundSettingsFor(
  map: ExomuxBackgroundSettingsMap,
  id: ExomuxBackgroundId,
): ExomuxBackgroundSettingValues {
  return Object.freeze({ ...defaultExomuxBackgroundSettings(id), ...(map[id] ?? {}) });
}

/** Free-form string settings a background may carry beyond its cycleable specs. */
const BACKGROUND_STRING_SETTINGS: Readonly<Partial<Record<ExomuxBackgroundId, readonly string[]>>> = Object.freeze({
  image: Object.freeze(["path"]),
});

/** Strictly normalizes a persisted background settings map. */
export function normalizeExomuxBackgroundSettings(value: unknown): ExomuxBackgroundSettingsMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const out: Partial<Record<ExomuxBackgroundId, ExomuxBackgroundSettingValues>> = {};
  for (const id of EXOMUX_BACKGROUND_IDS) {
    const raw = (value as Record<string, unknown>)[id];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const values: Record<string, ExomuxSettingValue> = {};
    for (const spec of EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? []) {
      const candidate = record[spec.id];
      if (spec.values.includes(candidate as ExomuxSettingValue)) values[spec.id] = candidate as ExomuxSettingValue;
    }
    for (const key of BACKGROUND_STRING_SETTINGS[id] ?? []) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.length > 0 && candidate.length <= 1024) values[key] = candidate;
    }
    if (Object.keys(values).length > 0) out[id] = Object.freeze(values);
  }
  return Object.freeze(out);
}

/** Returns the map with one background's setting cycled to its next value. */
export function cycleExomuxBackgroundSetting(
  map: ExomuxBackgroundSettingsMap,
  id: ExomuxBackgroundId,
  settingId: string,
  direction = 1,
): ExomuxBackgroundSettingsMap {
  const spec = (EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? []).find((candidate) => candidate.id === settingId);
  if (!spec) return map;
  const current = exomuxBackgroundSettingsFor(map, id)[settingId];
  const at = spec.values.indexOf(current as ExomuxSettingValue);
  const next = spec.values[(at + direction + spec.values.length) % spec.values.length]!;
  return Object.freeze({ ...map, [id]: Object.freeze({ ...map[id], [settingId]: next }) });
}

/** Returns the map with one free-form string setting replaced. */
export function withExomuxBackgroundString(
  map: ExomuxBackgroundSettingsMap,
  id: ExomuxBackgroundId,
  settingId: string,
  value: string,
): ExomuxBackgroundSettingsMap {
  if (!(BACKGROUND_STRING_SETTINGS[id] ?? []).includes(settingId)) return map;
  return Object.freeze({ ...map, [id]: Object.freeze({ ...map[id], [settingId]: value }) });
}

/** Maximum remembered SSH targets persisted with the workspace. */
export const EXOMUX_MAX_SAVED_HOSTS = 64;

/** Conservative SSH target check: optional user@ plus hostname/IP, no option-like leading dash. */
export function isExomuxSshTarget(value: string): boolean {
  return value.length <= 253 && /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,63}@)?[A-Za-z0-9][A-Za-z0-9.:_-]{0,252}$/.test(value);
}

/** Public, content-minimized controller lifecycle inspection. */
export interface ExomuxControllerInspection {
  readonly disposed: boolean;
  readonly connected: boolean;
  readonly themeId: ExomuxThemeId;
  readonly activeSessionId?: string;
  readonly prefixPending: boolean;
  readonly status: string;
  readonly sessionCount: number;
  readonly attachedCount: number;
  readonly runningCount: number;
  readonly persistenceStatus: string;
  readonly sessions: readonly ExomuxSessionSummary[];
}

/** Showcase metadata used by the shared lifecycle/persistence kernel. */
export const EXOMUX_MANIFEST = defineShowcaseManifest({
  id: "exomux",
  title: "Exomux",
  appVersion: "1.0.0",
  routes: [
    { id: "workspace", title: "Workspace" },
    { id: "sessions", title: "Sessions" },
    { id: "help", title: "Help" },
  ],
  initialRouteId: "workspace",
  requiredCapabilities: ["terminal.multiplex", "window.advanced"],
  optionalCapabilities: ["terminal.pty", "terminal.replay"],
  hosts: { terminal: true, browser: false },
});

/** Returns one validated theme, falling back to Midnight Ops. */
export function exomuxTheme(id: unknown): ExomuxThemeSpec {
  return EXOMUX_THEMES.find((theme) => theme.id === id) ?? EXOMUX_THEMES[0]!;
}

/** Stable outer-window identity for one daemon session. */
export function exomuxWindowId(sessionId: string): string {
  return `terminal-${sessionId}`;
}

/** Recovers the daemon session identity from a terminal window id. */
export function exomuxSessionIdFromWindow(windowId: string | undefined): string | undefined {
  return windowId?.startsWith("terminal-") ? windowId.slice("terminal-".length) || undefined : undefined;
}

/** Strictly normalizes JSON-safe app metadata without trusting prototypes. */
export function normalizeExomuxWorkspaceState(value: unknown): ExomuxWorkspaceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return initialExomuxWorkspaceState();
  const record = value as Record<string, unknown>;
  const themeId = exomuxTheme(record.themeId).id;
  const terminalOrdinal = Number.isSafeInteger(record.terminalOrdinal) && (record.terminalOrdinal as number) >= 1
    ? Math.min(1_000_000, record.terminalOrdinal as number)
    : 1;
  const activeSessionId = typeof record.activeSessionId === "string" && isExomuxSessionId(record.activeSessionId)
    ? record.activeSessionId
    : undefined;
  const savedHosts: string[] = [];
  if (Array.isArray(record.savedHosts)) {
    for (const host of record.savedHosts) {
      if (savedHosts.length >= EXOMUX_MAX_SAVED_HOSTS) break;
      if (typeof host === "string" && isExomuxSshTarget(host) && !savedHosts.includes(host)) {
        savedHosts.push(host);
      }
    }
  }
  const sessionHosts: Record<string, string> = {};
  if (record.sessionHosts && typeof record.sessionHosts === "object" && !Array.isArray(record.sessionHosts)) {
    for (const [sessionId, target] of Object.entries(record.sessionHosts as Record<string, unknown>)) {
      if (Object.keys(sessionHosts).length >= EXOMUX_MAX_SAVED_HOSTS) break;
      if (isExomuxSessionId(sessionId) && typeof target === "string" && isExomuxSshTarget(target)) {
        sessionHosts[sessionId] = target;
      }
    }
  }
  const windowSettings: Record<string, ExomuxWindowSettings> = {};
  if (record.windowSettings && typeof record.windowSettings === "object" && !Array.isArray(record.windowSettings)) {
    for (const [sessionId, settings] of Object.entries(record.windowSettings as Record<string, unknown>)) {
      if (Object.keys(windowSettings).length >= EXOMUX_MAX_SAVED_HOSTS) break;
      if (isExomuxSessionId(sessionId)) windowSettings[sessionId] = normalizeExomuxWindowSettings(settings);
    }
  }
  return Object.freeze({
    schemaVersion: EXOMUX_SESSION_SCHEMA_VERSION,
    themeId,
    terminalOrdinal,
    ...(activeSessionId ? { activeSessionId } : {}),
    savedHosts: Object.freeze(savedHosts),
    backgroundId: exomuxBackgroundId(record.backgroundId),
    sessionHosts: Object.freeze(sessionHosts),
    windowSettings: Object.freeze(windowSettings),
    globalSettings: normalizeExomuxGlobalSettings(record.globalSettings),
    backgroundSettings: normalizeExomuxBackgroundSettings(record.backgroundSettings),
  });
}

/** Default durable metadata. */
export function initialExomuxWorkspaceState(): ExomuxWorkspaceState {
  return Object.freeze({
    schemaVersion: EXOMUX_SESSION_SCHEMA_VERSION,
    themeId: "midnight",
    terminalOrdinal: 1,
    savedHosts: Object.freeze([]) as readonly string[],
    backgroundId: "metaballs" as const,
    sessionHosts: Object.freeze({}),
    windowSettings: Object.freeze({}),
    globalSettings: defaultExomuxGlobalSettings(),
    backgroundSettings: Object.freeze({}),
  });
}

/** Content-safe session-id check shared by state restoration and controller calls. */
export function isExomuxSessionId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}
