// Copyright 2023 Im-Beast. MIT license.

// Truecolor resolution for terminal screen cells.
//
// `TerminalScreenController` stores colors as compact encoded values
// (`terminal_color.ts`); this module resolves them to renderable RGB through
// the xterm-256 palette, raises theme-mapped ANSI text to readable WCAG
// contrast, and folds cursor inversion, dim-inactive fading, and translucent
// grounds into one per-cell resolution (`resolveTerminalCellStyle`) that any
// renderer — a `TerminalScreen` component or a host painting its own grid —
// can share. Promoted from the exomux terminal multiplexer, where it renders
// every live PTY window.

import { decodeTerminalColor } from "./terminal_color.ts";
import type { TerminalScreenCell } from "./terminal_screen.ts";

/** One renderable RGB triple. */
export type TerminalRgb = readonly [number, number, number];

/** Resolves compact TerminalScreen SGR values through the xterm color palette. */
export function terminalPaletteRgb(code: number | undefined, background: boolean): TerminalRgb | undefined {
  if (code === undefined) return undefined;
  const decoded = decodeTerminalColor(code, background);
  if (!decoded) return undefined;
  if (decoded.kind === "ansi") return xtermPaletteRgb(decoded.index);
  if (decoded.kind === "indexed") return xtermPaletteRgb(decoded.index);
  return [decoded.red, decoded.green, decoded.blue];
}

/**
 * Resolves theme-remappable ANSI text and raises it toward `preferredText`
 * until it reads at WCAG AA contrast (4.5:1) against `background`. Indexed and
 * truecolor values pass through untouched — a program that chose an exact
 * color gets that color; only the 16 nameable ANSI slots are theme-lifted.
 */
export function terminalReadableForegroundRgb(
  code: number | undefined,
  background: TerminalRgb,
  preferredText: TerminalRgb,
): TerminalRgb | undefined {
  if (code === undefined) return undefined;
  const color = terminalPaletteRgb(code, false);
  const decoded = decodeTerminalColor(code, false);
  if (!color || decoded?.kind !== "ansi" || terminalContrastRatio(color, background) >= 4.5) return color;
  if (terminalContrastRatio(preferredText, background) < 4.5) {
    const black: TerminalRgb = [0, 0, 0];
    const white: TerminalRgb = [255, 255, 255];
    return terminalContrastRatio(black, background) >= terminalContrastRatio(white, background) ? black : white;
  }
  for (let step = 1; step <= 256; step += 1) {
    const ratio = step / 256;
    const candidate: TerminalRgb = [
      blendChannel(color[0], preferredText[0], ratio),
      blendChannel(color[1], preferredText[1], ratio),
      blendChannel(color[2], preferredText[2], ratio),
    ];
    if (terminalContrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return preferredText;
}

/** Linear per-channel blend from `source` toward `target` by `ratio` (0..1). */
export function mixTerminalRgb(source: TerminalRgb, target: TerminalRgb, ratio: number): TerminalRgb {
  return [
    blendChannel(source[0], target[0], ratio),
    blendChannel(source[1], target[1], ratio),
    blendChannel(source[2], target[2], ratio),
  ];
}

/** WCAG relative-luminance contrast ratio between two colors (1..21). */
export function terminalContrastRatio(left: TerminalRgb, right: TerminalRgb): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05) /
    (Math.min(leftLuminance, rightLuminance) + 0.05);
}

/** How far dim-inactive fades a pane toward its surface. */
const DIM_RATIO = 0.45;

/** Options for one terminal screen's per-cell style resolution. */
export interface TerminalCellStyleOptions {
  /** Ground for cells whose program left the background unset. */
  readonly defaultBackground: TerminalRgb;
  /** Text for cells whose program left the foreground unset. */
  readonly defaultForeground: TerminalRgb;
  /**
   * Raise default-ground ANSI text to readable contrast against
   * `defaultBackground` (the themed look). Off, programs get their raw palette.
   */
  readonly contrastLift?: boolean;
  /** When set, both channels fade toward it (an unfocused pane recedes). */
  readonly dimToward?: TerminalRgb;
  /**
   * See-through ground: with `opacity` below 1, a cell at its default
   * background blends this scene color instead, so only cells a program
   * deliberately painted keep their block of color.
   */
  readonly ground?: (column: number, row: number) => TerminalRgb;
  readonly opacity?: number;
  /** The inverted cursor block's colors. */
  readonly cursorForeground: TerminalRgb;
  readonly cursorBackground: TerminalRgb;
}

/** One resolved, renderable terminal cell. */
export interface ResolvedTerminalCellStyle {
  readonly glyph: string;
  readonly foreground: TerminalRgb;
  readonly background: TerminalRgb;
  readonly bold: boolean;
}

/**
 * Resolves one screen-model cell to its renderable style: xterm-256 palette,
 * themed contrast lift, translucent default grounds, cursor inversion, and
 * dim-inactive fading, in the order a real terminal window layers them.
 * `column`/`row` address the cell for the `ground` callback (pass the same
 * coordinate space the ground expects).
 */
interface MemoizedTerminalCellStyle {
  foreground: TerminalRgb;
  /** Undefined when the background must blend the per-position ground. */
  background?: TerminalRgb;
  bold: boolean;
}

/**
 * Per-options memo for {@linkcode resolveTerminalCellStyle}. A screen holds
 * thousands of cells but only dozens of distinct color signatures, and the
 * expensive work (palette decoding, WCAG contrast lifting, dim mixing) depends
 * only on that signature plus the options object — so a caller that reuses one
 * options object per paint pass resolves each signature once instead of once
 * per cell. Only the transparent unset-background blend is position-dependent
 * and stays per-cell. Bounded so hostile content full of unique truecolor
 * cells degrades to the uncached path instead of growing without limit.
 */
const cellStyleMemos = new WeakMap<TerminalCellStyleOptions, Map<string, MemoizedTerminalCellStyle>>();
const CELL_STYLE_MEMO_LIMIT = 4096;

/** Resolves one terminal cell to its final colours, honouring cursor, opacity, and ground. */
export function resolveTerminalCellStyle(
  cell: Pick<TerminalScreenCell, "char" | "foreground" | "background" | "bold">,
  column: number,
  row: number,
  cursor: boolean,
  options: TerminalCellStyleOptions,
): ResolvedTerminalCellStyle {
  const opacity = options.opacity ?? 1;
  const transparent = options.ground !== undefined && opacity < 1;
  if (cursor) {
    let background = options.cursorBackground;
    let foreground = options.cursorForeground;
    if (options.dimToward) {
      background = mixTerminalRgb(background, options.dimToward, DIM_RATIO);
      foreground = mixTerminalRgb(foreground, options.dimToward, DIM_RATIO);
    }
    return { glyph: cell.char || " ", foreground, background, bold: true };
  }
  let memo = cellStyleMemos.get(options);
  if (memo === undefined) {
    memo = new Map();
    cellStyleMemos.set(options, memo);
  }
  const key = `${cell.foreground ?? ""}\u001f${cell.background ?? ""}\u001f${cell.bold ? "b" : ""}`;
  let entry = memo.get(key);
  if (entry === undefined) {
    const explicit = terminalPaletteRgb(cell.background, true);
    let background = explicit ?? (transparent ? undefined : options.defaultBackground);
    let foreground = cell.background === undefined && options.contrastLift
      ? terminalReadableForegroundRgb(cell.foreground, options.defaultBackground, options.defaultForeground) ??
        options.defaultForeground
      : terminalPaletteRgb(cell.foreground, false) ?? options.defaultForeground;
    if (options.dimToward) {
      if (background !== undefined) background = mixTerminalRgb(background, options.dimToward, DIM_RATIO);
      foreground = mixTerminalRgb(foreground, options.dimToward, DIM_RATIO);
    }
    entry = { foreground, background, bold: cell.bold === true };
    if (memo.size < CELL_STYLE_MEMO_LIMIT) memo.set(key, entry);
  }
  let background = entry.background;
  if (background === undefined) {
    background = mixTerminalRgb(options.ground!(column, row), options.defaultBackground, opacity);
    if (options.dimToward) background = mixTerminalRgb(background, options.dimToward, DIM_RATIO);
  }
  return { glyph: cell.char || " ", foreground: entry.foreground, background, bold: entry.bold };
}

function xtermPaletteRgb(index: number): TerminalRgb {
  if (index < 8) return ANSI_NORMAL[index]!;
  if (index < 16) return ANSI_BRIGHT[index - 8]!;
  if (index < 232) {
    const cube = index - 16;
    const red = Math.floor(cube / 36);
    const green = Math.floor((cube % 36) / 6);
    const blue = cube % 6;
    return [XTERM_CUBE_LEVELS[red]!, XTERM_CUBE_LEVELS[green]!, XTERM_CUBE_LEVELS[blue]!];
  }
  const level = 8 + (index - 232) * 10;
  return [level, level, level];
}

const ANSI_NORMAL: readonly TerminalRgb[] = Object.freeze([
  [0, 0, 0],
  [205, 49, 49],
  [13, 188, 121],
  [229, 229, 16],
  [36, 114, 200],
  [188, 63, 188],
  [17, 168, 205],
  [229, 229, 229],
]);
const ANSI_BRIGHT: readonly TerminalRgb[] = Object.freeze([
  [102, 102, 102],
  [241, 76, 76],
  [35, 209, 139],
  [245, 245, 67],
  [59, 142, 234],
  [214, 112, 214],
  [41, 184, 219],
  [255, 255, 255],
]);
const XTERM_CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

function blendChannel(source: number, target: number, ratio: number): number {
  return Math.round(source + (target - source) * ratio);
}

function relativeLuminance(color: TerminalRgb): number {
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}
