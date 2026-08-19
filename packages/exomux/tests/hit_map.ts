// Copyright 2023 Im-Beast. MIT license.

// A picture of what every cell on the exomux desktop resolves to.
//
// Pointer bugs in this codebase have all been disagreements about what lives
// at a cell, and they were invisible because nothing ever wrote the answer
// down. This builds that answer for the whole screen as a legend plus an
// ASCII map, so a change in routing shows up as a diff you can read rather
// than as a click that mysteriously stops working.
//
// It resolves through the authorities that exist today — the window host's
// own hit test for floating chrome, the projection for controls and tiled
// windows, the mount's shelf bounds for the top bar — so the map records what
// the desktop actually does, bugs included. That is the point: it is the
// before-picture the pointer refactor (plan/todo/040) must reproduce.

import type { ExomuxAppMount } from "../app.ts";
import type { ExomuxController } from "../controller.ts";
import type { Rectangle } from "@ubernaut/exotui";
import { EXOMUX_START_BUTTON, exomuxMenuQuitRect } from "../desktop_layout.ts";

/** One resolved cell, in the vocabulary the refactor will make into a type. */
export type ExomuxHitLabel = string;

/** A complete desktop hit map: every cell labelled, plus a drawing legend. */
export interface ExomuxHitMap {
  readonly columns: number;
  readonly rows: number;
  /** Row-major labels, `rows` entries of `columns` labels each. */
  readonly cells: readonly (readonly ExomuxHitLabel[])[];
}

function contains(rect: Rectangle, column: number, row: number): boolean {
  return column >= rect.column && column < rect.column + rect.width &&
    row >= rect.row && row < rect.row + rect.height;
}

/**
 * True when exomux considers a modal to own the screen. Mirrors the app's own
 * `modalOpen` predicate, which is a closure and therefore not importable —
 * one of the things plan/todo/040 exists to fix.
 */
export function exomuxModalOpen(controller: ExomuxController): boolean {
  return controller.helpVisible.peek() || controller.pendingKillSessionId.peek() !== undefined ||
    controller.quitModalVisible.peek() || controller.pendingScp.peek() !== undefined ||
    controller.configSessionId.peek() !== undefined ||
    controller.backgroundConfigVisible.peek() ||
    controller.shaderManagerVisible.peek() ||
    controller.startMenuVisible.peek();
}

/** Resolves one cell against the desktop as it behaves today. */
export function exomuxHitLabelAt(
  mounted: ExomuxAppMount,
  controller: ExomuxController,
  column: number,
  row: number,
): ExomuxHitLabel {
  if (exomuxModalOpen(controller)) return "modal";

  const body = mounted.bodyRect.peek();
  if (row < body.row) {
    // The top bar is three rects with gaps between them, not a three-way split:
    // the cells either side of the taskbar belong to nobody, which is what the
    // desktop already does and what the first draft of this map got wrong.
    if (contains(EXOMUX_START_BUTTON, column, row)) return "start";
    if (contains(exomuxMenuQuitRect(mounted.app.tui.rectangle.peek()), column, row)) return "quit";
    if (contains(mounted.shelfBounds.peek(), column, row)) return "shelf";
    return "desktop";
  }
  if (row >= body.row + body.height) return "footer";

  const projection = mounted.windowProjection.peek();
  // The window host owns floating chrome; ask it rather than re-deriving.
  const hit = controller.windowHost.interactions.hitTest({ column, row }, body);
  if (hit) {
    const window = projection.floatingWindows.find((candidate) => candidate.id === hit.id);
    const control = window?.controls.find((candidate) => contains(candidate.hitRect, column, row));
    if (control) return `win:${hit.id}:control:${control.kind}`;
    return `win:${hit.id}:${hit.region === "title-bar" ? "title" : hit.region}`;
  }

  for (let index = projection.tiledWindows.length - 1; index >= 0; index -= 1) {
    const window = projection.tiledWindows[index]!;
    if (!contains(window.rect, column, row)) continue;
    const control = window.controls.find((candidate) => contains(candidate.hitRect, column, row));
    if (control) return `win:${window.id}:control:${control.kind}`;
    if (contains(window.clientRect, column, row)) return `win:${window.id}:client`;
    return `win:${window.id}:chrome`;
  }

  for (let index = projection.separators.length - 1; index >= 0; index -= 1) {
    if (contains(projection.separators[index]!.hitRect, column, row)) return "separator";
  }
  return "desktop";
}

/** Builds the whole-screen map. */
export function buildExomuxHitMap(mounted: ExomuxAppMount, controller: ExomuxController): ExomuxHitMap {
  const bounds = mounted.app.tui.rectangle.peek();
  const cells: ExomuxHitLabel[][] = [];
  for (let row = 0; row < bounds.height; row += 1) {
    const line: ExomuxHitLabel[] = [];
    for (let column = 0; column < bounds.width; column += 1) {
      line.push(exomuxHitLabelAt(mounted, controller, column, row));
    }
    cells.push(line);
  }
  return { columns: bounds.width, rows: bounds.height, cells };
}

// Glyphs are assigned by sorted label, not by where a label first appears, so
// that one cell changing hands moves one character. First-appearance order made
// a two-cell correction rewrite the whole drawing, which is the opposite of
// what a reviewable golden file is for.
const LEGEND_GLYPHS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Renders a map as a legend plus an ASCII drawing, for golden comparison. */
export function formatExomuxHitMap(map: ExomuxHitMap): string {
  const labels = [...new Set(map.cells.flat())].sort();
  const glyphByLabel = new Map<ExomuxHitLabel, string>(
    labels.map((label, index) => [label, LEGEND_GLYPHS[index] ?? "?"]),
  );
  const lines: string[] = [];
  for (const row of map.cells) {
    let line = "";
    for (const label of row) line += glyphByLabel.get(label) ?? "?";
    lines.push(line);
  }
  const legend = [...glyphByLabel.entries()].map(([label, glyph]) => `${glyph}  ${label}`);
  return [
    `size ${map.columns}x${map.rows}`,
    "",
    ...legend,
    "",
    ...lines,
    "",
  ].join("\n");
}

/** Every distinct label in a map, with how many cells carry it. */
export function exomuxHitMapCounts(map: ExomuxHitMap): Map<ExomuxHitLabel, number> {
  const counts = new Map<ExomuxHitLabel, number>();
  for (const row of map.cells) {
    for (const label of row) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

/** The first cell carrying a label, for turning a map back into a click. */
export function exomuxFirstCellWith(map: ExomuxHitMap, label: ExomuxHitLabel): { x: number; y: number } | undefined {
  for (let row = 0; row < map.cells.length; row += 1) {
    const line = map.cells[row]!;
    for (let column = 0; column < line.length; column += 1) {
      if (line[column] === label) return { x: column, y: row };
    }
  }
  return undefined;
}
