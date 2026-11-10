// Copyright 2023 Im-Beast. MIT license.
/** Shared chip package paint used by the live circuits board and document diagrams. */
export function circuitChipGlyph(column: number, row: number, width: number, height: number, fill = "▓"): string {
  if (row === 0) return column === 0 ? "╔" : column === width - 1 ? "╗" : "═";
  if (row === height - 1) return column === 0 ? "╚" : column === width - 1 ? "╝" : "═";
  return column === 0 || column === width - 1 ? "║" : fill;
}
