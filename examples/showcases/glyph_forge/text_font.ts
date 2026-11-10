// Copyright 2023 Im-Beast. MIT license.
// Pure FIGlet rendering is now an ExotUI document feature.
export * from "../../../src/content/ascii_fonts.ts";
import {
  GLYPH_TEXT_FONTS,
  glyphFontIdFromFileName,
  type GlyphTextFont,
  parseFigletFont,
} from "../../../src/content/ascii_fonts.ts";

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
