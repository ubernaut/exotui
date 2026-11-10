// Copyright 2023 Im-Beast. MIT license.
import { assertEquals } from "./deps.ts";
import { measuredHTMLGlyphDirection, mirroredTextGlyph } from "../src/content/mermaid_bidi.ts";

Deno.test("Unicode 17 glyph mirrors reproduce every pinned source pair without changing LTR text", async () => {
  const source = await Deno.readTextFile(new URL("./fixtures/unicode/BidiMirroring-17.0.0.txt", import.meta.url));
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)))].map((
    byte,
  ) => byte.toString(16).padStart(2, "0")).join("");
  assertEquals(hash, "a2f16fb873ab4fcdf3221cb1a8a85a134ddd6ed03603181823ff5206af3741ce");
  const rows = [...source.matchAll(/^([0-9A-F]{4,6}); ([0-9A-F]{4,6})/gm)];
  assertEquals(rows.length, 428);
  for (const match of rows) {
    const char = String.fromCodePoint(parseInt(match[1]!, 16)), mirror = String.fromCodePoint(parseInt(match[2]!, 16));
    assertEquals(mirroredTextGlyph(char, true), { text: mirror, unpaired: false });
    assertEquals(mirroredTextGlyph(char, false), { text: char, unpaired: false });
  }
});

Deno.test("glyph mirroring keeps combining marks and reports all unsupported font-only mirrors", async () => {
  assertEquals(mirroredTextGlyph("(\u0301", true), { text: ")\u0301", unpaired: false });
  assertEquals(mirroredTextGlyph("אב😀ABC123", true), { text: "אב😀ABC123", unpaired: false });
  const source = await Deno.readTextFile(new URL("./fixtures/unicode/BidiMirroring-17.0.0.txt", import.meta.url));
  const rows = [...source.matchAll(/^# ([0-9A-F]{4,6});/gm)];
  assertEquals(rows.length, 126);
  for (const match of rows) {
    const char = String.fromCodePoint(parseInt(match[1]!, 16));
    assertEquals(mirroredTextGlyph(char, true), { text: char, unpaired: true });
  }
});

Deno.test("measured HTML glyph direction uses resolved edges, not paragraph direction or adjacent caret affinity", () => {
  const box = { x: 100, y: 20, width: 10, height: 20 };
  assertEquals(measuredHTMLGlyphDirection(box, { x: 110, y: 20 }, { x: 100, y: 20 }), "rtl");
  assertEquals(measuredHTMLGlyphDirection(box, { x: 100, y: 20 }, { x: 110, y: 20 }), "ltr");
  assertEquals(measuredHTMLGlyphDirection(box, { x: 110, y: 20 }, { x: 60, y: 20 }), "rtl");
  assertEquals(measuredHTMLGlyphDirection(box, { x: 60, y: 20 }, { x: 110, y: 20 }), "ltr");
  // A closing parenthesis before PDI has an end caret back in surrounding RTL text.
  assertEquals(measuredHTMLGlyphDirection(box, { x: 100, y: 20 }, { x: 60, y: 20 }), "ltr");
});

Deno.test("ambiguous, transformed, nonfinite and tiny HTML caret geometry never guesses mirrored ink", () => {
  const box = { x: 100, y: 20, width: 10, height: 20 };
  assertEquals(measuredHTMLGlyphDirection(box, { x: 100, y: 20 }, { x: 100, y: 20 }), undefined);
  assertEquals(measuredHTMLGlyphDirection(box, { x: 80, y: 20 }, { x: 90, y: 20 }), undefined);
  assertEquals(measuredHTMLGlyphDirection(box, { x: 100, y: 40 }, { x: 110, y: 40 }), undefined);
  assertEquals(measuredHTMLGlyphDirection({ ...box, width: .01 }, { x: 100, y: 20 }, { x: 100.01, y: 20 }), undefined);
  assertEquals(measuredHTMLGlyphDirection(box, { x: NaN, y: 20 }, { x: 110, y: 20 }), undefined);
});
