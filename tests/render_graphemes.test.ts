// Copyright 2023 Im-Beast. MIT license.
import { assertEquals } from "./deps.ts";
import {
  characterWidth,
  cropToWidth,
  getMultiCodePointCharacters,
  stripStyles,
  textWidth,
} from "../src/utils/strings.ts";
import { createAnsiStyle } from "../src/theme.ts";
import { unicodeDataSha256 } from "../src/unicode/data_pack.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";
import { TextObject } from "../src/canvas/text.ts";

const samples = ["ạ́́", "क्ष", "क्‍ष", "각", "👩‍💻", "1️⃣", "界é"];
const blue = createAnsiStyle({ foreground: [0, 0, 255], underline: true });

Deno.test("render helpers retain all Unicode 17 official grapheme boundaries in plain and ANSI styled text", async () => {
  const bytes = await Deno.readFile(new URL("./fixtures/unicode/GraphemeBreakTest-17.0.0.txt", import.meta.url));
  assertEquals(unicodeDataSha256(bytes), "e2d134d2c52919bace503ebb6a551c1855fe1a1faec18478c78fff254a1793ec");
  let fixtures = 0;
  for (const [line, source] of new TextDecoder().decode(bytes).split("\n").entries()) {
    const body = source.split("#", 1)[0]!.trim();
    if (!body) continue;
    const tokens = body.split(/\s+/), expected: string[] = [];
    let cluster = "", text = "";
    for (let i = 0; i < tokens.length; i++) {
      if (i % 2 === 0) {
        if (tokens[i] === "÷" && cluster) {
          expected.push(cluster);
          cluster = "";
        }
      } else {
        const char = String.fromCodePoint(parseInt(tokens[i]!, 16));
        cluster += char;
        text += char;
      }
    }
    assertEquals(getMultiCodePointCharacters(text), expected, `Plain official line ${line + 1}`);
    assertEquals(
      getMultiCodePointCharacters(blue(text)).map(stripStyles),
      expected,
      `Styled official line ${line + 1}`,
    );
    // SGR is transparent to Unicode boundaries even when authors change style inside a cluster.
    const fragmented = Array.from(text).map((char, i) => `\x1b[${i % 2 ? 31 : 32}m${char}`).join("") + "\x1b[0m";
    assertEquals(
      getMultiCodePointCharacters(fragmented).map(stripStyles),
      expected,
      `Fragmented official line ${line + 1}`,
    );
    fixtures++;
  }
  assertEquals(fixtures, 766);
});

Deno.test("render widths and cropping keep long accents, Indic conjuncts and Hangul indivisible", () => {
  for (const [text, width] of [["ạ́́", 1], ["क्ष", 1], ["क्‍ष", 1], ["각", 2], ["👩‍💻", 2], ["1️⃣", 2]] as const) {
    assertEquals(getMultiCodePointCharacters(text), [text]);
    assertEquals(characterWidth(text), width);
    assertEquals(textWidth(`${text}Z`), width + 1);
    assertEquals(textWidth(blue(`${text}Z`)), width + 1);
    assertEquals(stripStyles(cropToWidth(blue(`${text}Z`), width)), text);
    assertEquals(stripStyles(cropToWidth(blue(`${text}Z`), width - 1)), width === 2 ? " " : "");
  }
  assertEquals(textWidth("ab\r\nLater"), 2);
  assertEquals(stripStyles(cropToWidth(blue("ab\r\nLater"), 20)), "ab");
  for (const width of [0, 1, 2, 3, 20]) {
    assertEquals(cropToWidth("ab\r\nLater", width), "ab".slice(0, width));
    assertEquals(stripStyles(cropToWidth(blue("ab\r\nLater"), width)), "ab".slice(0, width));
  }
});

Deno.test("SGR inside a grapheme uses its first scalar's cell style without losing the next style or crop controls", () => {
  const value = "\x1b[31me\x1b[32ḿX\x1b[0m";
  assertEquals(getMultiCodePointCharacters(value), ["\x1b[31mé\x1b[0m", "\x1b[32mX\x1b[0m"]);
  assertEquals(cropToWidth(value, 1), "\x1b[31me\x1b[32ḿ");
  assertEquals(textWidth(value), 2);
});

Deno.test("actual TextObject cells preserve complete plain/styled graphemes and their wide followers", async () => {
  for (const text of samples) {
    for (const styled of [false, true]) {
      const canvas = new Canvas({ sink: new MemoryCanvasSink(), size: { columns: 12, rows: 1 } });
      const object = new TextObject({
        canvas,
        value: styled ? blue(text) : text,
        style: (text) => text,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: 12 },
        overwriteRectangle: true,
        multiCodePointSupport: true,
      });
      object.draw();
      try {
        await Promise.resolve();
        await Promise.resolve();
        canvas.render();
        const glyphs = canvas.frameBuffer[0]!.map((cell) =>
          stripStyles(typeof cell === "string" ? cell : new TextDecoder().decode(cell))
        );
        const expected = text === "界é" ? ["界", "", "é"] : characterWidth(text) === 2 ? [text, ""] : [text];
        assertEquals(glyphs.slice(0, expected.length), expected);
        assertEquals(glyphs.slice(expected.length), Array<string>(12 - expected.length).fill(" "));
      } finally {
        object.erase();
      }
    }
  }
});
