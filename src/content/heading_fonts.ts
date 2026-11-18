// Copyright 2023 Im-Beast. MIT license.
import { GLYPH_TEXT_FONTS, type GlyphTextFont, renderGlyphText } from "./ascii_fonts.ts";
import { getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";

/** Bundled ASCII heading styles, from largest to smallest. */
export type AsciiHeadingFont = "standard" | "small" | "graffiti" | "micro" | "plain";

/** Optional font per semantic heading level. */
export type MarkdownHeadingFonts = Partial<Record<1 | 2 | 3 | 4 | 5 | 6, AsciiHeadingFont>>;

/** A descending heading hierarchy using the two promoted GlyphForge FIGlet fonts. */
export const ASCII_HEADING_FONTS: Readonly<MarkdownHeadingFonts> = Object.freeze({
  1: "standard",
  2: "small",
  3: "micro",
  4: "plain",
  5: "plain",
  6: "plain",
});

/** Compact document hierarchy: three rows only for the title, single-row subheads. */
export const COMPACT_HEADING_FONTS: Readonly<MarkdownHeadingFonts> = Object.freeze({
  1: "micro",
  2: "plain",
  3: "plain",
  4: "plain",
  5: "plain",
  6: "plain",
});

/** Small FIGlet title with plain subheads; combine with headingArt: "title" for one banner per document. */
export const TITLE_HEADING_FONTS: Readonly<MarkdownHeadingFonts> = Object.freeze({
  1: "small",
  2: "plain",
  3: "plain",
  4: "plain",
  5: "plain",
  6: "plain",
});

const MICRO: Readonly<Record<string, readonly string[]>> = {
  A: [" # ", "# #", "###"],
  B: ["## ", "###", "## "],
  C: [" ##", "#  ", " ##"],
  D: ["## ", "# #", "## "],
  E: ["###", "## ", "###"],
  F: ["###", "## ", "#  "],
  G: [" ##", "# #", " ##"],
  H: ["# #", "###", "# #"],
  I: ["###", " # ", "###"],
  J: ["  #", "  #", "## "],
  K: ["# #", "## ", "# #"],
  L: ["#  ", "#  ", "###"],
  M: ["# #", "###", "# #"],
  N: ["## ", "# #", "# #"],
  O: [" # ", "# #", " # "],
  P: ["## ", "## ", "#  "],
  Q: [" # ", "# #", " ##"],
  R: ["## ", "## ", "# #"],
  S: [" ##", " # ", "## "],
  T: ["###", " # ", " # "],
  U: ["# #", "# #", "###"],
  V: ["# #", "# #", " # "],
  W: ["# #", "###", "###"],
  X: ["# #", " # ", "# #"],
  Y: ["# #", " # ", " # "],
  Z: ["## ", " # ", " ##"],
  "0": ["###", "# #", "###"],
  "1": [" # ", "## ", " # "],
  "2": ["## ", " # ", " ##"],
  "3": ["## ", " ##", "## "],
  "4": ["# #", "###", "  #"],
  "5": [" ##", "## ", " ##"],
  "6": ["#  ", "###", "###"],
  "7": ["###", "  #", "  #"],
  "8": ["###", "###", "###"],
  "9": ["###", "###", "  #"],
  " ": ["   ", "   ", "   "],
  ".": ["   ", "   ", " . "],
  "-": ["   ", "---", "   "],
  "_": ["   ", "   ", "___"],
  ":": [" . ", "   ", " . "],
  "/": ["  /", " / ", "/  "],
  "?": ["## ", " # ", " . "],
  "!": [" | ", " | ", " . "],
};

const micro: GlyphTextFont = {
  id: "micro",
  label: "Micro",
  height: 3,
  glyphs: new Map(Object.entries(MICRO).map(([key, value]) => [key, [...value]])),
};

/**
 * Renders a width-bounded ASCII heading. Words wrap, long words split between
 * glyphs, and Unicode/narrow surfaces fall back to readable text, never '?'.
 */
export function renderAsciiHeading(text: string, font: AsciiHeadingFont = "small", width = 120): string[] {
  if (!Number.isFinite(width) || width < 1 || width > 2000) throw new RangeError("Heading width must be 1–2000 cells.");
  if (text.length > 4096) throw new RangeError("Heading text is limited to 4096 characters.");
  const limit = Math.floor(width);
  if (text.includes("\n")) return text.split("\n").flatMap((line) => renderAsciiHeading(line, font, limit));
  const selected = font === "micro" ? micro : GLYPH_TEXT_FONTS.find((entry) => entry.id === font);
  if (font !== "plain" && !selected) throw new TypeError(`Unknown ASCII heading font: ${font}`);
  const value = font === "micro" ? text.toUpperCase() : text;
  const supported = selected && [...value].every((char) => selected.glyphs.has(char));
  if (
    font === "plain" || !supported || [...value].some((char) => (selected!.glyphs.get(char)?.[0]?.length ?? 0) > limit)
  ) {
    // Plain text wraps between words; only a word wider than the row splits between glyphs.
    const rows: string[] = [];
    let row = "";
    for (const token of text.split(/( +)/)) {
      if (!token) continue;
      if (textWidth(row + token) <= limit) {
        row += token;
        continue;
      }
      if (token.startsWith(" ")) {
        rows.push(row);
        row = "";
        continue;
      }
      if (row.trim()) {
        rows.push(row.trimEnd());
        row = "";
      }
      for (const glyph of getMultiCodePointCharacters(token)) {
        const fitting = textWidth(glyph) > limit ? "�" : glyph;
        if (textWidth(row + fitting) > limit) {
          rows.push(row);
          row = "";
        }
        row += fitting;
      }
    }
    if (row) rows.push(rows.length ? row.trimEnd() : row);
    return rows.length ? rows : [""];
  }
  const rows: string[] = [];
  let line = "";
  const flush = () => {
    if (line) rows.push(...headingGlyphs(selected!, line));
    line = "";
  };
  for (const word of value.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (headingGlyphs(selected!, next)[0]!.length <= limit) {
      line = next;
    } else {
      flush();
      for (const char of word) {
        if (headingGlyphs(selected!, line + char)[0]!.length > limit) flush();
        line += char;
      }
    }
  }
  flush();
  return rows.filter((row) => textWidth(row) <= limit);
}

// FIGlet kerning is appropriate inside a word, not across word boundaries.
// Render words independently so whitespace cannot disappear into glyph bearings.
function headingGlyphs(font: GlyphTextFont, text: string): string[] {
  const words = text.split(" ").map((word) =>
    font.id === "micro"
      ? Array.from({ length: font.height }, (_, row) => [...word].map((char) => font.glyphs.get(char)![row]).join(" "))
      : renderGlyphText(font, word, font.id === "standard" ? "kern" : "font")
  );
  return Array.from({ length: font.height }, (_, row) => words.map((word) => word[row]).join("   "));
}
