// Copyright 2023 Im-Beast. MIT license.

// A small FIGlet (.flf) parser and text renderer for the GlyphForge text
// tool. It supports the required printable-ASCII character range with
// full-width and kerned layout (letters slide together until they touch);
// FIGlet's smushing rules are deliberately out of scope for the slice, so
// output matches patorjk.com's "Fitted"/"Full" layouts.

import { GLYPH_FONT_SMALL_FLF, GLYPH_FONT_STANDARD_FLF } from "./font_data.ts";

/** One parsed FIGlet font. */
export interface GlyphTextFont {
  readonly id: string;
  readonly label: string;
  readonly height: number;
  /** Glyph rows per character; hardblanks already replaced with spaces. */
  readonly glyphs: ReadonlyMap<string, readonly string[]>;
}

/** Horizontal layout modes for rendered text. */
export type GlyphTextLayout = "full" | "kern";

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
  const glyphs = new Map<string, readonly string[]>();
  let cursor = 1 + commentLines;
  for (let code = 32; code <= 126; code += 1) {
    const rows: string[] = [];
    for (let row = 0; row < height; row += 1) {
      const line = lines[cursor + row];
      if (line === undefined) throw new TypeError(`Font ${id} ends before character ${code}.`);
      // Every glyph line ends with one endmark (two on the last row).
      rows.push(line.replace(/(.)\1?$/, "").replaceAll(hardblank, " "));
    }
    cursor += height;
    // Ragged rows pad to the widest so layout math sees a rectangle.
    const width = Math.max(...rows.map((row) => row.length));
    glyphs.set(String.fromCharCode(code), rows.map((row) => row.padEnd(width, " ")));
  }
  return { id, label, height, glyphs };
}

/** The bundled fonts, parsed once. */
export const GLYPH_TEXT_FONTS: readonly GlyphTextFont[] = [
  parseFigletFont("standard", "Standard", GLYPH_FONT_STANDARD_FLF),
  parseFigletFont("small", "Small", GLYPH_FONT_SMALL_FLF),
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

/** Result of scanning a font-pack directory. */
export interface GlyphFontPack {
  readonly fonts: readonly GlyphTextFont[];
  /** Files that did not parse, with a one-line reason each. */
  readonly skipped: readonly { readonly file: string; readonly reason: string }[];
}

/**
 * Loads every parseable .flf/.tlf font from a directory (the patorjk/TAAG
 * corpus drops in wholesale). Unparseable files are reported, not fatal;
 * results are sorted by label and deduplicated against the bundled ids.
 */
export async function loadGlyphFontPack(directory: string): Promise<GlyphFontPack> {
  const fonts: GlyphTextFont[] = [];
  const skipped: { file: string; reason: string }[] = [];
  const seen = new Set(GLYPH_TEXT_FONTS.map((font) => font.id));
  for await (const entry of Deno.readDir(directory)) {
    if (!entry.isFile || !/\.(flf|tlf)$/i.test(entry.name)) continue;
    const id = glyphFontIdFromFileName(entry.name);
    if (id.length === 0 || seen.has(id)) continue;
    try {
      const source = await Deno.readTextFile(`${directory}/${entry.name}`);
      const label = entry.name.replace(/\.(flf|tlf)$/i, "");
      fonts.push(parseFigletFont(id, label, source));
      seen.add(id);
    } catch (error) {
      skipped.push({ file: entry.name, reason: (error as Error).message.slice(0, 120) });
    }
  }
  fonts.sort((a, b) => a.label.localeCompare(b.label));
  return { fonts, skipped };
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
