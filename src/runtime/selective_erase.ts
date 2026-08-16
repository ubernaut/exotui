// Copyright 2023 Im-Beast. MIT license.

// TERM-005: protection is a CELL attribute and selective erase honors
// it INDEPENDENTLY of ordinary erase. DECSCA marks cells protected as
// they are written; DECSED (selective erase in display) and DECSEL
// (selective erase in line) blank only unprotected cells in their
// before-cursor / after-cursor / whole ranges, preserving protected
// content exactly — characters AND attributes; ordinary ED/EL are
// separate operations that erase everything, protection included, so
// the two semantics never bleed into each other.

import { type CellAttributes, type CellScreen, DEFAULT_ATTRIBUTES } from "./cell_screen.ts";

/** Erase ranges shared by ED/EL/DECSED/DECSEL. */
export type EraseMode = "to-end" | "to-start" | "all";

/** Writes text with DECSCA protection state. */
export function writeProtected(
  screen: CellScreen,
  column: number,
  row: number,
  text: string,
  options: { readonly protected: boolean } & Partial<Omit<CellAttributes, "protected">> = { protected: true },
): void {
  let cursor = column;
  for (const char of text) {
    screen.set(cursor, row, {
      char,
      attributes: { ...DEFAULT_ATTRIBUTES, ...options },
    });
    cursor += 1;
  }
}

const BLANK = { char: " ", attributes: DEFAULT_ATTRIBUTES } as const;

function inRange(
  mode: EraseMode,
  index: number,
  cursorIndex: number,
): boolean {
  if (mode === "all") return true;
  return mode === "to-end" ? index >= cursorIndex : index <= cursorIndex;
}

/** DECSEL: selective erase in line — unprotected cells only. */
export function selectiveEraseLine(
  screen: CellScreen,
  cursorColumn: number,
  row: number,
  mode: EraseMode,
): void {
  for (let column = 0; column < screen.columns; column += 1) {
    if (!inRange(mode, column, cursorColumn)) continue;
    if (screen.get(column, row).attributes.protected) continue;
    screen.set(column, row, BLANK);
  }
}

/** DECSED: selective erase in display — unprotected cells only. */
export function selectiveEraseDisplay(
  screen: CellScreen,
  cursorColumn: number,
  cursorRow: number,
  mode: EraseMode,
): void {
  const cursorIndex = cursorRow * screen.columns + cursorColumn;
  for (let row = 0; row < screen.rows; row += 1) {
    for (let column = 0; column < screen.columns; column += 1) {
      if (!inRange(mode, row * screen.columns + column, cursorIndex)) continue;
      if (screen.get(column, row).attributes.protected) continue;
      screen.set(column, row, BLANK);
    }
  }
}

/** EL: ordinary erase in line — protection does NOT apply. */
export function eraseLine(screen: CellScreen, cursorColumn: number, row: number, mode: EraseMode): void {
  for (let column = 0; column < screen.columns; column += 1) {
    if (!inRange(mode, column, cursorColumn)) continue;
    screen.set(column, row, BLANK);
  }
}

/** ED: ordinary erase in display — protection does NOT apply. */
export function eraseDisplay(
  screen: CellScreen,
  cursorColumn: number,
  cursorRow: number,
  mode: EraseMode,
): void {
  const cursorIndex = cursorRow * screen.columns + cursorColumn;
  for (let row = 0; row < screen.rows; row += 1) {
    for (let column = 0; column < screen.columns; column += 1) {
      if (!inRange(mode, row * screen.columns + column, cursorIndex)) continue;
      screen.set(column, row, BLANK);
    }
  }
}
