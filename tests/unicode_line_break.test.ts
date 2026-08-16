// Copyright 2023 Im-Beast. MIT license.

// TXT-006: UAX #14 line breaking — the official LineBreakTest corpus passes
// in full, tailoring hooks work, forced breaks stay lossless, and wrapping
// never separates a grapheme.

import { assert, assertEquals } from "./deps.ts";
import { lineBreakOpportunities, lookupLineBreakClass, wrapTerminalText } from "../mod.ts";

Deno.test("the official LineBreakTest corpus passes completely", async () => {
  const text = await Deno.readTextFile(new URL("./fixtures/unicode/LineBreakTest-17.0.0.txt", import.meta.url));
  let total = 0;
  const failures: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0]!.trim();
    if (!line) continue;
    const codePoints: number[] = [];
    const expected = new Set<number>();
    let boundary = 0;
    for (const token of line.split(/\s+/)) {
      if (token === "÷") {
        if (boundary > 0) expected.add(boundary);
      } else if (token !== "×") {
        codePoints.push(Number.parseInt(token, 16));
        boundary += 1;
      }
    }
    const input = String.fromCodePoint(...codePoints);
    const offsets: number[] = [0];
    let offset = 0;
    for (const codePoint of codePoints) {
      offset += codePoint > 0xffff ? 2 : 1;
      offsets.push(offset);
    }
    const got = new Set<number>();
    for (const opportunity of lineBreakOpportunities(input)) {
      const cpBoundary = offsets.indexOf(opportunity.offset);
      if (cpBoundary > 0) got.add(cpBoundary);
    }
    total += 1;
    const want = [...expected].sort((a, b) => a - b).join(",");
    const have = [...got].sort((a, b) => a - b).join(",");
    if (want !== have && failures.length < 5) failures.push(`${line}: want [${want}] got [${have}]`);
  }
  assert(total > 19_000, `corpus loaded: ${total} lines`);
  assertEquals(failures, []);
});

Deno.test("classes, mandatory breaks, and tailoring hooks behave", () => {
  assertEquals(lookupLineBreakClass(0x0020), "SP");
  assertEquals(lookupLineBreakClass(0x000a), "LF");
  assertEquals(lookupLineBreakClass(0x4e00), "ID");
  assertEquals(lookupLineBreakClass(0xffff9999), "AL"); // out of range: default

  const breaks = lineBreakOpportunities("ab cd\nef");
  assertEquals(breaks, [
    { offset: 3, mandatory: false }, // after "ab "
    { offset: 6, mandatory: true }, // after the newline
    { offset: 8, mandatory: true }, // end of text
  ]);

  // Tailoring: treat "-" (HY) as glue so no break appears after it.
  const plain = lineBreakOpportunities("um-editor x");
  assert(plain.some((entry) => entry.offset === 3));
  const tailored = lineBreakOpportunities("um-editor x", {
    tailor: (codePoint, cls) => codePoint === 0x2d ? "GL" : cls,
  });
  assert(!tailored.some((entry) => entry.offset === 3));
});

Deno.test("wrapping is lossless, respects hard breaks, and never splits graphemes", () => {
  const text = "alpha beta gamma\ndelta";
  const lines = wrapTerminalText(text, 8);
  // Slices partition the input exactly: joining reconstructs the source.
  assertEquals(lines.map((line) => text.slice(line.start, line.end)).join(""), text);
  // The hard break in the source ends its line.
  const hard = lines.find((line) => line.hard);
  assert(hard && text.slice(hard.start, hard.end).endsWith("\n"));
  for (const line of lines) {
    assert(line.end - line.start > 0, "no empty lines");
  }

  // A ZWJ family is one grapheme: an emergency wrap may not cut through it.
  const family = "\u{1F469}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
  const emoji = `${family}${family}${family}`;
  const narrow = wrapTerminalText(emoji, 2);
  assertEquals(narrow.map((line) => emoji.slice(line.start, line.end)), [family, family, family]);

  // An unbreakable ASCII run emergency-breaks at grapheme boundaries.
  const run = wrapTerminalText("abcdefghij", 4);
  assertEquals(run.map((line) => "abcdefghij".slice(line.start, line.end)), ["abcd", "efgh", "ij"]);
});
