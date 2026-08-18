// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { wrapTextBoxLines } from "../src/components/textbox.ts";
import { graphemeBoundaries } from "../src/unicode/grapheme.ts";

// Wrapping a screen of plain text spent 77% of its time in the grapheme
// segmenter, which allocated a one-character string per scalar and ran the
// full rule state machine — for text where every rule that could join two
// scalars needs a code point at or above U+0080. These pin the fast paths that
// replaced that, and the property that matters: identical output.

/** An independent oracle. Intl implements UAX #29 without our data tables. */
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function intlBoundaries(text: string): number[] {
  if (text.length === 0) return [0];
  const offsets = [0];
  for (const part of segmenter.segment(text)) if (part.index > 0) offsets.push(part.index);
  if (offsets[offsets.length - 1] !== text.length) offsets.push(text.length);
  return offsets;
}

Deno.test("ASCII grapheme boundaries agree with Intl, including every control code", () => {
  const corpus = [
    "",
    "a",
    "hello world",
    "note-001 alpha beta gamma",
    "\r\n",
    "a\r\nb",
    "\r",
    "\n",
    "\r\r\n\n",
    "tabs\there",
    "\x1b[31mred\x1b[0m",
    " leading",
    "trailing ",
    "~\x7f",
    "a".repeat(200),
  ];
  // Every ASCII code point, in context, because the fast path decides by range.
  for (let code = 0; code < 128; code += 1) corpus.push(`a${String.fromCharCode(code)}b`);

  for (const text of corpus) {
    assertEquals(
      [...graphemeBoundaries(text)],
      intlBoundaries(text),
      `boundaries disagree for ${JSON.stringify(text)}`,
    );
  }
});

Deno.test("CR LF stays one cluster, which is the only join possible inside ASCII", () => {
  assertEquals([...graphemeBoundaries("\r\n")], [0, 2], "GB3 holds on the fast path");
  assertEquals([...graphemeBoundaries("a\r\nb")], [0, 1, 3, 4]);
  // A lone CR or LF breaks on both sides.
  assertEquals([...graphemeBoundaries("a\rb")], [0, 1, 2, 3]);
  assertEquals([...graphemeBoundaries("a\nb")], [0, 1, 2, 3]);
});

Deno.test("text that leaves ASCII still takes the general path and stays correct", () => {
  for (const text of ["café", "é", "👩‍👩‍👧‍👦", "🇬🇧🇺🇸", "한글", "日本語テキスト", "a👍b", "\r\n👍"]) {
    assertEquals(
      [...graphemeBoundaries(text)],
      intlBoundaries(text),
      `boundaries disagree for ${JSON.stringify(text)}`,
    );
  }
});

/**
 * Captured from the implementation as it stood at f214b09e, before either fast
 * path existed. The fast paths are an optimisation, so the only acceptable
 * output is the output that was there before — including for the inputs that
 * do NOT take them.
 */
const WRAP_BEFORE: readonly {
  readonly lines: readonly string[];
  readonly width: number;
  readonly wrapped: readonly {
    readonly lineIndex: number;
    readonly startColumn: number;
    readonly endColumn: number;
    readonly text: string;
    readonly continuation: boolean;
  }[];
}[] = JSON.parse(await Deno.readTextFile(new URL("./fixtures/textbox/wrap_before_fast_path.json", import.meta.url)));

Deno.test("wrapping is byte-identical to the implementation before the fast paths", () => {
  for (const { lines, width, wrapped } of WRAP_BEFORE) {
    const actual = wrapTextBoxLines(lines, width, { wordWrap: true }).map((visual) => ({
      lineIndex: visual.lineIndex,
      startColumn: visual.startColumn,
      endColumn: visual.endColumn,
      text: visual.text,
      continuation: visual.continuation,
    }));
    assertEquals(actual, wrapped, `wrapping changed for ${JSON.stringify(lines)} at width ${width}`);
  }
  // The fixture is worth having only if it covers what the fast paths skip.
  const covered = WRAP_BEFORE.map((entry) => entry.lines.join(""));
  assert(covered.some((text) => text.includes("\t")), "a tab");
  assert(covered.some((text) => text.includes("\x1b")), "an ANSI sequence");
  assert(covered.some((text) => text.includes("\x07")), "a control character");
  assert(covered.some((text) => /[^\x00-\x7f]/.test(text)), "text outside ASCII");
  assert(covered.some((text) => text.includes("\r\n")), "a CR LF pair");
});

Deno.test("a word longer than the viewport still advances", () => {
  const wrapped = wrapTextBoxLines(["supercalifragilisticexpialidocious"], 8, { wordWrap: true });
  assert(wrapped.length >= 4, "it broke into pieces rather than looping");
  assertEquals(wrapped[0]!.startColumn, 0);
  for (let index = 1; index < wrapped.length; index += 1) {
    assert(
      wrapped[index]!.startColumn > wrapped[index - 1]!.startColumn,
      "each piece starts after the last, so the loop always makes progress",
    );
  }
});
