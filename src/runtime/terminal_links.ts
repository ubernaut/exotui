// Copyright 2023 Im-Beast. MIT license.
import type { TerminalScreenCell, TerminalScreenCursor } from "./terminal_screen.ts";

/** Validates a terminal link for a local browser/mail client, without shell interpretation. */
export function normalizeTerminalLink(value: string): string | undefined {
  if (!value || value.length > 8192 || /[\u0000-\u0020\u007f]/u.test(value)) return undefined;
  try {
    const url = new URL(/^www\./iu.test(value) ? `https://${value}` : value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Finds an OSC 8 link or a plain URL at a viewport cell, joining only rows
 * explicitly marked as soft wraps. Cell mapping preserves wide and combining
 * glyphs; a plain URL clipped by the viewport is never opened as a partial URL.
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
  while (first > 0 && rows[first - 1]?.at(-1)?.softWrapped) first--;
  while (last + 1 < rows.length && rows[last]?.at(-1)?.softWrapped) last++;
  let text = "";
  let offset = 0;
  let previousStart = 0;
  for (let row = first; row <= last; row++) {
    for (let column = 0; column < rows[row]!.length; column++) {
      const entry = rows[row]![column]!;
      const start = entry.continuation ? previousStart : text.length;
      if (row === point.row && column === point.column) offset = start;
      if (!entry.continuation && !entry.wrapPadding) {
        previousStart = start;
        text += entry.char;
      }
    }
  }
  for (const match of text.matchAll(/\b(?:https?:\/\/|mailto:|www\.)[^\s<>"'\u0000-\u001f\u007f]+/giu)) {
    if (match.index + match[0].length === text.length && rows[last]?.at(-1)?.softWrapped) continue;
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
