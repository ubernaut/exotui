// Copyright 2023 Im-Beast. MIT license.

// The desktop shell, as a library layer.
//
// Two applications — exomux and the web desktop — grew up painting the same
// furniture over the same `WorkbenchWindowHost` projection: window chrome,
// a switcher panel, menu panels, tab strips. This module is that furniture,
// extracted along the line both proved out: the shell paints projection plus
// resolved colours into any cell surface, and window CONTENT never appears
// here — it stays behind each application's own adapter.
//
// Renderer-neutrality is the contract. A `ShellSurface` is three writes; a
// `ShellGround` is a colour per cell, which is what lets exomux blend its
// chrome over an animated backdrop while the web desktop hands in a constant.
// Colours arrive resolved — from control tokens, a ten-colour theme, or a
// hand palette — because the shell has no opinion about theming systems.

import type { Rectangle } from "../types.ts";
import type { WorkbenchWindowChromeProjection, WorkbenchWindowSwitcherProjection } from "./workbench_window_host.ts";
import { textWidth } from "../utils/strings.ts";

/** One colour, the way every painter in both consumers already spells it. */
export type ShellRgb = readonly [number, number, number];

/** A cell style; absent fields are the surface's business. */
export interface ShellStyle {
  readonly foreground?: ShellRgb;
  readonly background?: ShellRgb;
  readonly bold?: boolean;
}

/** The colour under a cell — constant for a flat desktop, sampled for a live backdrop. */
export type ShellGround = (column: number, row: number) => ShellRgb;

/** The whole rendering contract: anything that can put styled text in cells. */
export interface ShellSurface {
  cell(column: number, row: number, char: string, style: ShellStyle): void;
  write(column: number, row: number, text: string, style: ShellStyle): void;
  fill(rect: Rectangle, char: string, style: ShellStyle): void;
}

/** Border glyph set; structurally satisfied by exomux's `ExomuxBorderGlyphs`. */
export interface ShellBorderGlyphs {
  readonly topLeft: string;
  readonly top: string;
  readonly topRight: string;
  readonly left: string;
  readonly right: string;
  readonly bottomLeft: string;
  readonly bottom: string;
  readonly bottomRight: string;
}

/** A ground that is one colour everywhere. */
export function solidGround(color: ShellRgb): ShellGround {
  return () => color;
}

const glyphColumnCache = new Map<string, 1 | 2>();
const MAX_GLYPH_COLUMN_CACHE = 4096;

/** Terminal columns one glyph occupies, cached because backdrops repeat glyphs endlessly. */
export function shellGlyphColumns(glyph: string): 1 | 2 {
  const code = glyph.codePointAt(0);
  if (code === undefined || code < 0x80) return 1;
  const cached = glyphColumnCache.get(glyph);
  if (cached !== undefined) return cached;
  const columns = textWidth(glyph) > 1 ? 2 : 1;
  if (glyphColumnCache.size >= MAX_GLYPH_COLUMN_CACHE) glyphColumnCache.clear();
  glyphColumnCache.set(glyph, columns);
  return columns;
}

/** Truncates to a column budget with a "..." only when there is room for one. */
export function shellFitText(value: string, width: number): string {
  const safeWidth = Math.max(0, Math.floor(width));
  if (safeWidth === 0) return "";
  let columns = 0;
  for (const char of value) columns += shellGlyphColumns(char);
  if (columns <= safeWidth) return value;
  const ellipsis = safeWidth > 3 ? "..." : "";
  const budget = safeWidth - ellipsis.length;
  let fitted = "";
  let used = 0;
  for (const char of value) {
    const glyphWidth = shellGlyphColumns(char);
    if (used + glyphWidth > budget) break;
    fitted += char;
    used += glyphWidth;
  }
  return fitted + ellipsis;
}

/** A span clamped into [min, max] and into what the bounds minus a margin allow. */
export function shellFitSpan(available: number, min: number, max: number, margin: number): number {
  const room = Math.max(1, Math.floor(available) - margin);
  return Math.max(1, Math.min(room, Math.min(max, Math.max(min, room))));
}

/** Fills a rect cell by cell so each one can take its own blended ground. */
export function fillOnGround(
  surface: ShellSurface,
  rect: Rectangle,
  foreground: ShellRgb,
  ground: ShellGround,
): void {
  for (let row = 0; row < rect.height; row += 1) {
    for (let column = 0; column < rect.width; column += 1) {
      const x = rect.column + column;
      const y = rect.row + row;
      surface.write(x, y, " ", { foreground, background: ground(x, y) });
    }
  }
}

/** Writes text cell by cell so each one keeps its own blended ground. */
export function writeOnGround(
  surface: ShellSurface,
  column: number,
  row: number,
  text: string,
  style: { readonly foreground: ShellRgb; readonly bold?: boolean },
  ground: ShellGround,
): void {
  const glyphs = [...text];
  for (let index = 0; index < glyphs.length; index += 1) {
    surface.write(column + index, row, glyphs[index]!, {
      foreground: style.foreground,
      background: ground(column + index, row),
      bold: style.bold,
    });
  }
}

/** Draws a border box whose every cell samples the ground behind it. */
export function borderBoxOnGround(
  surface: ShellSurface,
  rect: Rectangle,
  glyphs: ShellBorderGlyphs,
  foreground: ShellRgb,
  ground: ShellGround,
  bold: boolean,
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const right = rect.column + rect.width - 1;
  const bottom = rect.row + rect.height - 1;
  const cellOn = (column: number, row: number, glyph: string) => {
    surface.cell(column, row, glyph, { foreground, background: ground(column, row), bold });
  };
  for (let column = rect.column + 1; column < right; column += 1) {
    cellOn(column, rect.row, glyphs.top);
    cellOn(column, bottom, glyphs.bottom);
  }
  for (let row = rect.row + 1; row < bottom; row += 1) {
    cellOn(rect.column, row, glyphs.left);
    cellOn(right, row, glyphs.right);
  }
  cellOn(rect.column, rect.row, glyphs.topLeft);
  cellOn(right, rect.row, glyphs.topRight);
  cellOn(rect.column, bottom, glyphs.bottomLeft);
  cellOn(right, bottom, glyphs.bottomRight);
}

// ---------------------------------------------------------------------------
// Window chrome: rect fill, border, title bar, controls. The client area is
// deliberately untouched — that is content, and content is the application's.

/** Everything the chrome painter needs resolved; nothing here knows about themes. */
export interface ShellWindowChromeOptions {
  /** Style the whole window rect is filled with before anything draws. */
  readonly surfaceFill: ShellStyle;
  readonly borderGlyphs: ShellBorderGlyphs;
  readonly borderForeground: ShellRgb;
  /** Ground the border cells sit on (blended chrome in exomux, flat elsewhere). */
  readonly chromeGround: ShellGround;
  /** Ground the title bar fills with and text sits on. */
  readonly titleBarGround: ShellGround;
  /** Foreground used for the title-bar fill pass (spaces still carry one). */
  readonly titleBarFillForeground: ShellRgb;
  /** The finished title text — placement glyph, adornments, whatever the app composes. */
  readonly titleText: string;
  readonly titleForeground: ShellRgb;
  readonly titleBold: boolean;
  /** Bold decision per control; exomux bolds danger tones and active windows. */
  readonly controlBold: (control: WorkbenchWindowChromeProjection["controls"][number]) => boolean;
  readonly controlForeground: ShellRgb;
}

/**
 * Paints one window's chrome from its projection. The title is truncated to
 * the room left of the first control, the way both applications already did.
 */
export function paintShellWindowChrome(
  surface: ShellSurface,
  window: WorkbenchWindowChromeProjection,
  options: ShellWindowChromeOptions,
): void {
  surface.fill(window.rect, " ", options.surfaceFill);
  borderBoxOnGround(
    surface,
    window.rect,
    options.borderGlyphs,
    options.borderForeground,
    options.chromeGround,
    window.active,
  );
  fillOnGround(surface, window.titleBarRect, options.titleBarFillForeground, options.titleBarGround);
  const firstControl = window.controls.reduce(
    (minimum, control) => Math.min(minimum, control.rect.column),
    window.titleBarRect.column + window.titleBarRect.width,
  );
  const titleWidth = Math.max(0, firstControl - window.titleBarRect.column - 2);
  writeOnGround(
    surface,
    window.titleBarRect.column + 1,
    window.titleBarRect.row,
    shellFitText(options.titleText, titleWidth),
    { foreground: options.titleForeground, bold: options.titleBold },
    options.titleBarGround,
  );
  for (const control of window.controls) {
    writeOnGround(
      surface,
      control.rect.column,
      control.rect.row,
      shellFitText(control.text, control.rect.width),
      { foreground: options.controlForeground, bold: options.controlBold(control) },
      options.titleBarGround,
    );
  }
}

// ---------------------------------------------------------------------------
// The switcher panel: the host projects the items, the shell draws the box.

/** Resolved styles for the switcher panel, its frame, and both item states. */
export interface ShellSwitcherColors {
  readonly panelFill: ShellStyle;
  readonly frame: ShellStyle;
  readonly item: ShellStyle;
  readonly selectedItem: ShellStyle;
}

/** Switcher paint options; the span defaults are the ones exomux shipped with. */
export interface ShellSwitcherOptions {
  readonly colors: ShellSwitcherColors;
  /** Glyph the frame is drawn with; exomux uses "#". */
  readonly frameChar?: string;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly widthMargin?: number;
  readonly heightMargin?: number;
}

/** Frame drawn as one repeated glyph, the way exomux's modal frames are. */
function paintCharFrame(surface: ShellSurface, rect: Rectangle, char: string, style: ShellStyle): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const right = rect.column + rect.width - 1;
  const bottom = rect.row + rect.height - 1;
  for (let column = rect.column; column <= right; column += 1) {
    surface.cell(column, rect.row, char, style);
    surface.cell(column, bottom, char, style);
  }
  for (let row = rect.row + 1; row < bottom; row += 1) {
    surface.cell(rect.column, row, char, style);
    surface.cell(right, row, char, style);
  }
}

/**
 * Paints the keyboard task switcher centered in the bounds and returns the
 * rect it covered, so callers can register the footprint or hit-test it.
 */
export function paintShellSwitcher(
  surface: ShellSurface,
  switcher: WorkbenchWindowSwitcherProjection,
  bounds: Rectangle,
  options: ShellSwitcherOptions,
): Rectangle {
  const width = shellFitSpan(bounds.width, options.minWidth ?? 20, options.maxWidth ?? 48, options.widthMargin ?? 8);
  const height = Math.min(
    switcher.items.length + 2,
    shellFitSpan(bounds.height, 3, bounds.height, options.heightMargin ?? 4),
  );
  const rect = {
    column: bounds.column + Math.max(0, Math.floor((bounds.width - width) / 2)),
    row: bounds.row + Math.max(0, Math.floor((bounds.height - height) / 2)),
    width,
    height,
  };
  surface.fill(rect, " ", options.colors.panelFill);
  paintCharFrame(surface, rect, options.frameChar ?? "#", options.colors.frame);
  for (let index = 0; index < Math.min(switcher.items.length, Math.max(0, height - 2)); index += 1) {
    const item = switcher.items[index]!;
    surface.write(
      rect.column + 1,
      rect.row + 1 + index,
      shellFitText(`${item.selected ? ">" : " "} ${item.title}`, width - 2),
      item.selected ? options.colors.selectedItem : options.colors.item,
    );
  }
  return rect;
}

// ---------------------------------------------------------------------------
// Menu panels: the framed box and its plain rows. Layout stays with the app —
// exomux anchors to a click, the web desktop drops from its bar — and richer
// rows (glyphs, summaries) are the app writing into the panel it was given.

/** One plain menu row: where it goes, what it says, whether it warns. */
export interface ShellMenuRow {
  readonly rect: Rectangle;
  readonly label: string;
  readonly danger?: boolean;
}

/** Resolved styles for a menu panel and its rows. */
export interface ShellMenuPanelOptions {
  readonly panelFill: ShellStyle;
  readonly borderGlyphs: ShellBorderGlyphs;
  readonly borderStyle: ShellStyle;
  readonly rowStyle: ShellStyle;
  readonly dangerForeground: ShellRgb;
}

/** Paints a menu panel's chrome and any plain rows the caller laid out. */
export function paintShellMenuPanel(
  surface: ShellSurface,
  panelRect: Rectangle,
  rows: readonly ShellMenuRow[],
  options: ShellMenuPanelOptions,
): void {
  surface.fill(panelRect, " ", options.panelFill);
  const glyphs = options.borderGlyphs;
  if (panelRect.width > 1 && panelRect.height > 1) {
    const right = panelRect.column + panelRect.width - 1;
    const bottom = panelRect.row + panelRect.height - 1;
    for (let column = panelRect.column + 1; column < right; column += 1) {
      surface.cell(column, panelRect.row, glyphs.top, options.borderStyle);
      surface.cell(column, bottom, glyphs.bottom, options.borderStyle);
    }
    for (let row = panelRect.row + 1; row < bottom; row += 1) {
      surface.cell(panelRect.column, row, glyphs.left, options.borderStyle);
      surface.cell(right, row, glyphs.right, options.borderStyle);
    }
    surface.cell(panelRect.column, panelRect.row, glyphs.topLeft, options.borderStyle);
    surface.cell(right, panelRect.row, glyphs.topRight, options.borderStyle);
    surface.cell(panelRect.column, bottom, glyphs.bottomLeft, options.borderStyle);
    surface.cell(right, bottom, glyphs.bottomRight, options.borderStyle);
  }
  for (const row of rows) {
    if (row.rect.row >= panelRect.row + panelRect.height - 1) break;
    surface.write(row.rect.column, row.rect.row, shellFitText(row.label, row.rect.width), {
      ...options.rowStyle,
      foreground: row.danger ? options.dangerForeground : options.rowStyle.foreground,
      bold: row.danger ? true : options.rowStyle.bold,
    });
  }
}

// ---------------------------------------------------------------------------
// A tab strip: one label per open thing, laid out left to right, hit rects
// returned so pointer routing shares the painter's geometry.

/** One tab on a strip: an open window, terminal, or document. */
export interface ShellTab {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
  /** Dimmed but present — a minimized window's tab. */
  readonly dimmed?: boolean;
}

/** Resolved styles for the three states a tab can be in. */
export interface ShellTabStripColors {
  readonly activeTab: ShellStyle;
  readonly tab: ShellStyle;
  readonly dimmedTab: ShellStyle;
}

/** Where one tab landed, for the pointer router to hit-test. */
export interface ShellTabRect {
  readonly id: string;
  readonly rect: Rectangle;
}

/**
 * Paints tabs into a one-row rect, stopping before the reserved tail width,
 * and returns each tab's rect. The gap between tabs is one column.
 */
export function paintShellTabStrip(
  surface: ShellSurface,
  rect: Rectangle,
  tabs: readonly ShellTab[],
  colors: ShellTabStripColors,
  reservedTail = 0,
): ShellTabRect[] {
  const placed: ShellTabRect[] = [];
  let column = rect.column;
  const limit = rect.column + rect.width - reservedTail;
  for (const tab of tabs) {
    const label = ` ${tab.label} `;
    const width = [...label].reduce((sum, glyph) => sum + shellGlyphColumns(glyph), 0);
    if (column + width >= limit) break;
    surface.write(column, rect.row, label, tab.active ? colors.activeTab : tab.dimmed ? colors.dimmedTab : colors.tab);
    placed.push({ id: tab.id, rect: { column, row: rect.row, width, height: 1 } });
    column += width + 1;
  }
  return placed;
}
