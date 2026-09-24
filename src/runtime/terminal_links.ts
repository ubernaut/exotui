// Copyright 2023 Im-Beast. MIT license.
import type { TerminalScreenCell, TerminalScreenCursor } from "./terminal_screen.ts";

const URL_CHARACTER = /^[^\s<>"'\p{Cc}]/u;
const URL_START = /^(?:https?:\/\/|mailto:|www\.)/iu;
/** A lone symbol or a number opening a row is list or tree furniture, not URL data. */
const ROW_MARKER = /^(?:[^\p{L}\p{N}]|\p{N}+[.)])$/u;
/**
 * Blank columns an application may leave at the right edge when it wraps text
 * itself; Claude Code pads its message text by one.
 */
const HARD_WRAP_EDGE_SLACK = 1;

/** Validates a terminal link for a local browser/mail client, without shell interpretation. */
export function normalizeTerminalLink(value: string): string | undefined {
  if (!value || value.length > 8192 || /[\u0000- \u007f]/u.test(value)) return undefined;
  try {
    const url = new URL(/^www\./iu.test(value) ? `https://${value}` : value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Finds an OSC 8 link or a plain URL at a viewport cell. Rows marked as soft
 * wraps always join. A hard line break joins only where a URL runs to the right
 * edge and the next row continues it, because applications such as Claude Code
 * wrap long URLs themselves and indent the continuation. Cell mapping preserves
 * wide and combining glyphs; a plain URL clipped by the viewport or cut by a
 * narrowing resize is never opened as a partial URL.
 */
export function terminalLinkAt(
  rows: readonly (readonly TerminalScreenCell[])[],
  point: TerminalScreenCursor,
): string | undefined {
  if (!Number.isInteger(point.row) || !Number.isInteger(point.column) || point.column < 0) return undefined;
  const cells = rows[point.row];
  const cell = cells?.[point.column];
  if (!cell || !cells) return undefined;
  const glyph = cell.continuation ? cells[point.column - 1] : cell;
  if (glyph?.hyperlink !== undefined) return normalizeTerminalLink(glyph.hyperlink);
  let first = point.row;
  let last = point.row;
  while (first > 0 && rowJoin(rows, first - 1)) first--;
  while (last + 1 < rows.length && rowJoin(rows, last)) last++;
  let text = "";
  let offset = -1;
  let previousStart = 0;
  let hardAbove = false;
  const clipped: number[] = [];
  for (let row = first; row <= last; row++) {
    const entries = rows[row]!;
    // A hard join runs from the last occupied cell of one row to the first of
    // the next, so neither the edge padding nor the indentation is URL text.
    const hardBelow = row < last && rowJoin(rows, row) === "hard";
    const extent = hardAbove || hardBelow ? rowExtent(entries) : undefined;
    const from = hardAbove ? extent!.first : 0;
    const to = hardBelow ? extent!.last : entries.length - 1;
    for (let column = from; column <= to; column++) {
      const entry = entries[column]!;
      const start = entry.continuation ? previousStart : text.length;
      if (row === point.row && column === point.column) offset = start;
      if (entry.clipped) clipped.push(start);
      if (!entry.continuation && !entry.wrapPadding) {
        previousStart = start;
        text += entry.char;
      }
    }
    hardAbove = hardBelow;
  }
  for (const match of text.matchAll(/\b(?:https?:\/\/|mailto:|www\.)[^\s<>"'\u0000-\u001f\u007f]+/giu)) {
    if (match.index + match[0].length === text.length && rows[last]?.at(-1)?.softWrapped) continue;
    if (clipped.some((at) => at >= match.index && at < match.index + match[0].length)) continue;
    let candidate = match[0];
    // Sentence punctuation and unmatched Markdown brackets are not URL data.
    while (candidate) {
      if (/[.,;:!?]$/u.test(candidate)) {
        candidate = candidate.slice(0, -1);
        continue;
      }
      const close = candidate.at(-1)!;
      const open = ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[close];
      if (open && candidate.split(close).length > candidate.split(open).length) {
        candidate = candidate.slice(0, -1);
        continue;
      }
      break;
    }
    if (offset >= match.index && offset < match.index + candidate.length) return normalizeTerminalLink(candidate);
  }
  return undefined;
}

/** How a row's text continues onto the row below it, if at all. */
function rowJoin(rows: readonly (readonly TerminalScreenCell[])[], row: number): "soft" | "hard" | undefined {
  const upper = rows[row];
  const lower = rows[row + 1];
  if (!upper || !lower || upper.at(-1)?.clipped) return undefined;
  if (upper.at(-1)?.softWrapped) return "soft";
  return continuesHardWrappedUrl(upper, lower) ? "hard" : undefined;
}

/**
 * Whether a URL-character run reaching the right edge of `upper` goes on in
 * `lower`. The next row may be indented, but not past where that run starts,
 * and its first word must not start a URL of its own (which would glue prose
 * onto the scheme) or be a list or tree marker. A URL that ends at the edge
 * by coincidence is indistinguishable from one broken there; the edge rule is
 * what keeps that rare.
 */
function continuesHardWrappedUrl(
  upper: readonly TerminalScreenCell[],
  lower: readonly TerminalScreenCell[],
): boolean {
  const above = rowExtent(upper);
  const below = rowExtent(lower);
  if (!above || !below || above.run > above.last) return false;
  if (above.last < upper.length - 1 - HARD_WRAP_EDGE_SLACK || below.first > above.run) return false;
  let word = "";
  for (let column = below.first; column < lower.length; column++) {
    const entry = lower[column]!;
    if (entry.continuation || entry.wrapPadding) continue;
    if (!URL_CHARACTER.test(entry.char)) break;
    word += entry.char;
  }
  return word.length > 0 && !URL_START.test(word) && !ROW_MARKER.test(word);
}

/**
 * The first and last occupied columns of a row, and the column where the run
 * of URL characters ending at its last glyph starts (`last + 1` when the last
 * glyph is not one).
 */
function rowExtent(
  cells: readonly TerminalScreenCell[],
): { readonly first: number; readonly last: number; readonly run: number } | undefined {
  let first = -1;
  let last = -1;
  for (let column = 0; column < cells.length; column++) {
    const cell = cells[column]!;
    if (cell.wrapPadding || (!cell.continuation && /^\s*$/u.test(cell.char))) continue;
    if (first < 0) first = column;
    last = column;
  }
  if (last < 0) return undefined;
  let run = last + 1;
  for (let column = last; column >= first; column--) {
    const cell = cells[column]!;
    if (cell.continuation) continue;
    if (!URL_CHARACTER.test(cell.char)) break;
    run = column;
  }
  return { first, last, run };
}
