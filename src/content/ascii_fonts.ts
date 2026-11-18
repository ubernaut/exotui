// Copyright 2023 Im-Beast. MIT license.

// A small FIGlet (.flf) parser and text renderer for the GlyphForge text
// tool. It supports the required printable-ASCII character range with
// full-width, fitted and font-default controlled horizontal smushing.

import { GLYPH_FONT_SMALL_FLF, GLYPH_FONT_STANDARD_FLF } from "./ascii_font_data.ts";
import { GLYPH_FONT_GRAFFITI_FLF } from "./ascii_graffiti_data.ts";

/** One parsed FIGlet font. */
export interface GlyphTextFont {
  readonly id: string;
  readonly label: string;
  readonly height: number;
  /** Glyph rows per character; hardblanks already replaced with spaces. */
  readonly glyphs: ReadonlyMap<string, readonly string[]>;
  /** Original hardblanks and layout flags, retained for font-default smushing. */
  readonly rawGlyphs?: ReadonlyMap<string, readonly string[]>;
  readonly hardblank?: string;
  readonly horizontalLayout?: number;
}

/** Horizontal layout modes for rendered text. */
export type GlyphTextLayout = "full" | "kern" | "fit" | "font";

/**
 * Parses a .flf (FIGlet) or .tlf (TOIlet) source covering at least the
 * printable ASCII range. TOIlet headers may omit the hardblank character.
 */
export function parseFigletFont(id: string, label: string, source: string): GlyphTextFont {
  // Some fonts ship with a UTF-8 BOM; some TOIlet fonts are ZIP archives,
  // which need extraction before they can be parsed.
  if (source.startsWith("PK\u0003\u0004")) {
    throw new TypeError(`Font ${id} is a zipped TOIlet font; unzip it first.`);
  }
  const lines = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").split("\n");
  const header = lines[0] ?? "";
  const match = /^[ft]lf2a(\S)?\s+(\d+)\s+\d+\s+\d+\s+(-?\d+)\s+(\d+)/.exec(header);
  if (!match) throw new TypeError(`Invalid FIGlet header for font ${id}.`);
  const hardblank = match[1] ?? "$";
  const height = Number(match[2]);
  const commentLines = Number(match[4]);
  if (height < 1 || height > 64 || source.length > 2_000_000) throw new RangeError(`Font ${id} exceeds font limits.`);
  const glyphs = new Map<string, readonly string[]>();
  const rawGlyphs = new Map<string, readonly string[]>();
  let cursor = 1 + commentLines;
  for (let code = 32; code <= 126; code += 1) {
    const rows: string[] = [];
    for (let row = 0; row < height; row += 1) {
      const line = lines[cursor + row];
      if (line === undefined) throw new TypeError(`Font ${id} ends before character ${code}.`);
      // Every glyph line ends with one endmark (two on the last row).
      rows.push(line.replace(/(.)\1?$/, ""));
    }
    cursor += height;
    // Ragged rows pad to the widest so layout math sees a rectangle.
    const width = Math.max(...rows.map((row) => row.length));
    if (width > 256) throw new RangeError(`Font ${id} has an oversized glyph.`);
    const padded = rows.map((row) => row.padEnd(width, " "));
    rawGlyphs.set(String.fromCharCode(code), padded);
    glyphs.set(String.fromCharCode(code), padded.map((row) => row.replaceAll(hardblank, " ")));
  }
  const oldLayout = Number(match[3]);
  const fullLayout = Number(header.split(/\s+/)[7]);
  const horizontalLayout = Number.isFinite(fullLayout)
    ? fullLayout & 255
    : oldLayout < 0
    ? 0
    : oldLayout === 0
    ? 64
    : 128 | oldLayout;
  return { id, label, height, glyphs, rawGlyphs, hardblank, horizontalLayout };
}

/** The bundled fonts, parsed once. */
export const GLYPH_TEXT_FONTS: readonly GlyphTextFont[] = [
  parseFigletFont("standard", "Standard", GLYPH_FONT_STANDARD_FLF),
  parseFigletFont("small", "Small", GLYPH_FONT_SMALL_FLF),
  parseFigletFont("graffiti", "Graffiti", GLYPH_FONT_GRAFFITI_FLF),
];

/** Finds a bundled font by id, defaulting to the first. */
export function glyphTextFont(id: string): GlyphTextFont {
  return GLYPH_TEXT_FONTS.find((font) => font.id === id) ?? GLYPH_TEXT_FONTS[0]!;
}

/** Case-insensitive substring filter over font labels and ids. */
export function filterGlyphFonts(
  fonts: readonly GlyphTextFont[],
  query: string,
): readonly GlyphTextFont[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return fonts;
  return fonts.filter((font) => font.label.toLowerCase().includes(needle) || font.id.includes(needle));
}

/** Stable font id from a file name ("ANSI Shadow.flf" → "ansi-shadow"). */
export function glyphFontIdFromFileName(fileName: string): string {
  return fileName
    .replace(/\.(flf|tlf)$/i, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/**
 * Renders one line of text into glyph rows. "kern" slides each character
 * against the previous until any of their non-space cells would touch,
 * keeping one column of air; "full" keeps every glyph's designed width.
 */
export function renderGlyphText(
  font: GlyphTextFont,
  text: string,
  layout: GlyphTextLayout = "kern",
): string[] {
  if (text.length > 4096) throw new RangeError("FIGlet text is limited to 4096 characters.");
  if (layout === "font" || layout === "fit") return renderFittedText(font, text, layout);
  const rows = new Array<string>(font.height).fill("");
  for (const char of text) {
    const glyph = font.glyphs.get(char) ?? font.glyphs.get("?")!;
    if (rows[0]!.length === 0) {
      for (let row = 0; row < font.height; row += 1) rows[row] = glyph[row]!;
      continue;
    }
    const overlap = layout === "kern" ? kernOverlap(rows, glyph, font.height) : 0;
    for (let row = 0; row < font.height; row += 1) {
      const left = rows[row]!;
      const right = glyph[row]!;
      const keep = left.length - overlap;
      // The overlap region merges: a space yields to the other side's ink.
      let merged = left.slice(0, keep);
      for (let index = 0; index < overlap; index += 1) {
        const a = left[keep + index] ?? " ";
        const b = right[index] ?? " ";
        merged += a === " " ? b : a;
      }
      rows[row] = merged + right.slice(overlap);
    }
  }
  // Trim uniform trailing space so stamps are as tight as their ink.
  const width = Math.max(0, ...rows.map((row) => row.trimEnd().length));
  return rows.map((row) => row.slice(0, width).padEnd(width, " "));
}

/** FIGlet's six controlled horizontal smushing rules; hardblanks remain barriers. */
function smush(a: string, b: string, hardblank: string, rules: number): string | undefined {
  if (a === " ") return b;
  if (b === " ") return a;
  if (a === hardblank || b === hardblank) return rules & 32 && a === b ? a : undefined;
  if (!rules) return b;
  if (rules & 1 && a === b) return a;
  if (rules & 2) {
    if (a === "_" && "|/\\[]{}()<>".includes(b)) return b;
    if (b === "_" && "|/\\[]{}()<>".includes(a)) return a;
  }
  const groups = ["|", "/\\", "[]", "{}", "()", "<>"];
  const left = groups.findIndex((group) => group.includes(a));
  const right = groups.findIndex((group) => group.includes(b));
  if (rules & 4 && left >= 0 && right >= 0 && left !== right) return left > right ? a : b;
  if (rules & 8 && ["[]", "][", "{}", "}{", "()", ")("].includes(a + b)) return "|";
  if (rules & 16) return ({ "/\\": "|", "\\/": "Y", "><": "X" } as Record<string, string>)[a + b];
  return undefined;
}

function renderFittedText(font: GlyphTextFont, text: string, layout: "font" | "fit"): string[] {
  const rows = new Array<string>(font.height).fill("");
  const flags = font.horizontalLayout ?? 64;
  const allowSmush = layout === "font" && (flags & 128) !== 0;
  const fitted = layout === "fit" || (flags & 192) !== 0;
  const hardblank = font.hardblank ?? "$";
  let previousWidth = 0;
  for (const char of text) {
    const glyphs = font.rawGlyphs ?? font.glyphs;
    const glyph = glyphs.get(char) ?? glyphs.get("?")!;
    const width = glyph[0]!.length;
    let overlap = 0;
    const cap = fitted ? Math.min(rows[0]!.length, width) : 0;
    for (let candidate = 1; candidate <= cap; candidate++) {
      let valid = true;
      let collision = false;
      for (let row = 0; row < font.height && valid; row++) {
        const left = rows[row]!;
        for (let x = 0; x < candidate; x++) {
          const a = left[left.length - candidate + x]!, b = glyph[row]![x]!;
          if (a !== " " && b !== " ") collision = true;
          if (
            a !== " " && b !== " " &&
            (!allowSmush || width < 2 || previousWidth < 2 || smush(a, b, hardblank, flags & 63) === undefined)
          ) {
            valid = false;
            break;
          }
        }
      }
      if (!valid) break;
      overlap = candidate;
      if (collision) break;
    }
    for (let row = 0; row < font.height; row++) {
      const left = rows[row]!, right = glyph[row]!;
      const keep = left.length - overlap;
      let merged = left.slice(0, keep);
      for (let x = 0; x < overlap; x++) merged += smush(left[keep + x]!, right[x]!, hardblank, flags & 63)!;
      rows[row] = merged + right.slice(overlap);
    }
    previousWidth = width;
  }
  const visible = rows.map((row) => row.replaceAll(hardblank, " "));
  const width = Math.max(0, ...visible.map((row) => row.trimEnd().length));
  return visible.map((row) => row.slice(0, width).padEnd(width, " "));
}

/** Columns the next glyph may slide left over the accumulated rows. */
function kernOverlap(rows: readonly string[], glyph: readonly string[], height: number): number {
  const glyphWidth = glyph[0]?.length ?? 0;
  let overlap = Math.min(glyphWidth, ...rows.map((row) => row.length));
  for (let row = 0; row < height; row += 1) {
    const left = rows[row]!;
    const right = glyph[row]!;
    const leftInk = left.trimEnd().length;
    let rightInk = 0;
    while (rightInk < right.length && right[rightInk] === " ") rightInk += 1;
    // Air between this row's rightmost ink and the glyph's leftmost ink,
    // minus one column so letters never fuse.
    const air = (left.length - leftInk) + rightInk - 1;
    overlap = Math.min(overlap, Math.max(0, air));
  }
  return overlap;
}
