// Copyright 2023 Im-Beast. MIT license.

// QAL-003: Unicode conformance is a GATED NUMBER, not a vibe. Each gate
// runs one vendored official corpus (grapheme, line break, bidi) or one
// pinned tailoring sample (width, emoji) through the shipped algorithms
// and returns exact pass/total counts with the corpus data version. A
// checked-in baseline records those counts; the gate test compares
// EXACTLY, so any Unicode data or rule change produces an explicit diff
// that must be accepted by regenerating the baseline — silent conformance
// drift is impossible.

import { graphemeBoundaries } from "./grapheme.ts";
import { lineBreakOpportunities } from "./line_break.ts";
import { bidiParagraphOfText } from "./bidi.ts";
import { emojiAwareTextWidth } from "./emoji.ts";
import { CJK_WIDE_WIDTH_PROFILE, UNICODE_NARROW_WIDTH_PROFILE } from "./width.ts";

/** One gate's result. */
export interface ConformanceGateResult {
  readonly gate: string;
  readonly dataVersion: string;
  readonly total: number;
  readonly passed: number;
}

/** Runs the UAX #29 grapheme gate over GraphemeBreakTest. */
export function runGraphemeConformance(corpus: string, dataVersion: string): ConformanceGateResult {
  let total = 0;
  let passed = 0;
  for (const rawLine of corpus.split(/\r?\n/)) {
    const body = rawLine.split("#", 1)[0]!.trim();
    if (body === "") continue;
    const tokens = body.split(/\s+/);
    let text = "";
    const expected: number[] = [];
    let valid = true;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      if (index % 2 === 0) {
        if (token !== "÷" && token !== "×") {
          valid = false;
          break;
        }
        if (token === "÷") expected.push(text.length);
      } else {
        text += String.fromCodePoint(Number.parseInt(token, 16));
      }
    }
    if (!valid) continue;
    total += 1;
    const actual = graphemeBoundaries(text);
    if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  }
  return { gate: "grapheme", dataVersion, total, passed };
}

/** Runs the UAX #14 line-break gate over LineBreakTest. */
export function runLineBreakConformance(corpus: string, dataVersion: string): ConformanceGateResult {
  let total = 0;
  let passed = 0;
  for (const rawLine of corpus.split(/\r?\n/)) {
    const body = rawLine.split("#", 1)[0]!.trim();
    if (body === "") continue;
    const tokens = body.split(/\s+/);
    let text = "";
    const expected: number[] = [];
    let valid = true;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      if (index % 2 === 0) {
        if (token !== "÷" && token !== "×") {
          valid = false;
          break;
        }
        if (token === "÷" && index > 0) expected.push(text.length);
      } else {
        text += String.fromCodePoint(Number.parseInt(token, 16));
      }
    }
    if (!valid || text.length === 0) continue;
    total += 1;
    const actual = lineBreakOpportunities(text)
      .map((opportunity) => opportunity.offset)
      .filter((offset) => offset > 0);
    if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  }
  return { gate: "line-break", dataVersion, total, passed };
}

/** Runs the UAX #9 bidi gate over BidiCharacterTest. */
export function runBidiConformance(corpus: string, dataVersion: string): ConformanceGateResult {
  let total = 0;
  let passed = 0;
  for (const rawLine of corpus.split(/\r?\n/)) {
    const body = rawLine.split("#", 1)[0]!.trim();
    if (body === "") continue;
    const fields = body.split(";");
    if (fields.length < 5) continue;
    const text = fields[0]!.trim().split(/\s+/).map((hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .join("");
    const paragraphDirection = Number.parseInt(fields[1]!, 10);
    const expectedLevels = fields[3]!.trim().split(/\s+/);
    total += 1;
    try {
      const result = bidiParagraphOfText(text, {
        direction: paragraphDirection === 0 ? "ltr" : paragraphDirection === 1 ? "rtl" : "auto",
      });
      const actual = result.levels.map((level) => level < 0 ? "x" : String(level));
      if (JSON.stringify(actual) === JSON.stringify(expectedLevels)) passed += 1;
    } catch {
      // counted as failed
    }
  }
  return { gate: "bidi", dataVersion, total, passed };
}

/** The pinned width-tailoring sample: char → [narrowCells, cjkCells]. */
export const WIDTH_TAILORING_SAMPLE: ReadonlyArray<readonly [string, number, number]> = [
  ["a", 1, 1],
  ["中", 2, 2],
  ["→", 1, 2], // ambiguous: narrow 1, CJK 2
  ["•", 1, 2],
  ["①", 1, 2],
  ["ｱ", 1, 1], // halfwidth katakana
  ["Ａ", 2, 2], // fullwidth
];

/** Runs the width-tailoring gate over the pinned sample. */
export function runWidthConformance(dataVersion: string): ConformanceGateResult {
  let passed = 0;
  for (const [char, narrow, cjk] of WIDTH_TAILORING_SAMPLE) {
    const narrowActual = emojiAwareTextWidth(char, { profile: UNICODE_NARROW_WIDTH_PROFILE });
    const cjkActual = emojiAwareTextWidth(char, { profile: CJK_WIDE_WIDTH_PROFILE });
    if (narrowActual === narrow && cjkActual === cjk) passed += 1;
  }
  return { gate: "width-tailoring", dataVersion, total: WIDTH_TAILORING_SAMPLE.length, passed };
}

/** The pinned emoji sample: sequence → cells. */
export const EMOJI_SAMPLE: ReadonlyArray<readonly [string, number]> = [
  ["🙂", 2],
  ["👩‍👩‍👧", 2], // ZWJ family is one 2-cell cluster
  ["🇵🇱", 2], // flag
  ["1️⃣", 2], // keycap
  ["a🙂b", 4],
];

/** Runs the emoji-width gate over the pinned sample. */
export function runEmojiConformance(dataVersion: string): ConformanceGateResult {
  let passed = 0;
  for (const [text, cells] of EMOJI_SAMPLE) {
    if (emojiAwareTextWidth(text) === cells) passed += 1;
  }
  return { gate: "emoji", dataVersion, total: EMOJI_SAMPLE.length, passed };
}
