// Copyright 2023 Im-Beast. MIT license.

// TXT-006: UAX #14 line-break opportunities (Unicode 17.0.0, tr14-55).
// Classes come from the pinned generated data module (LB1's AI/SG/XX/SA
// resolutions and the QU Pi/Pf split are folded at generation time; CJ is
// preserved for tailoring and resolves to NS by default). The rule engine
// applies LB2–LB31 in order over code points with LB9/LB10 combining-mark
// attachment, and the official LineBreakTest corpus drives conformance.

import { GENERATED_UNICODE_17_0_0_LINE_BREAK_DATA } from "./generated/unicode_17_0_0_linebreak.ts";
import { segmentEmojiSequences } from "./emoji.ts";
import type { EmojiAwareWidthOptions } from "./emoji.ts";
import { isGraphemeBoundary } from "./grapheme.ts";

/** Post-fold UAX #14 classes stored in the data module (plus runtime AL). */
export type LineBreakClass = string;

/** One break opportunity. `offset` is a UTF-16 boundary in the input. */
export interface LineBreakOpportunity {
  readonly offset: number;
  /** True for hard breaks (BK/CR/LF/NL and end of text). */
  readonly mandatory: boolean;
}

/** Options for line-break analysis. */
export interface LineBreakOptions {
  /**
   * Locale-tailoring hook: may return a replacement class for a code point
   * before the rules run. `cls` is the data pack's post-fold class.
   */
  readonly tailor?: (codePoint: number, cls: LineBreakClass) => LineBreakClass;
}

interface LineBreakData {
  readonly values: readonly string[];
  readonly ranges: readonly number[];
  readonly eastAsian: readonly number[];
  readonly extPictCn: readonly number[];
}

const DATA = GENERATED_UNICODE_17_0_0_LINE_BREAK_DATA as LineBreakData;

function decodeTriplets(encoded: readonly number[], values: readonly string[]): Array<[number, number, string]> {
  const ranges: Array<[number, number, string]> = [];
  let start = 0;
  for (let index = 0; index < encoded.length; index += 3) {
    start += encoded[index]!;
    const end = start + encoded[index + 1]!;
    ranges.push([start, end, values[encoded[index + 2]!]!]);
    start = end + 1;
  }
  return ranges;
}

function decodePairs(encoded: readonly number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (let index = 0; index < encoded.length; index += 2) {
    start += encoded[index]!;
    const end = start + encoded[index + 1]!;
    ranges.push([start, end]);
    start = end + 1;
  }
  return ranges;
}

const CLASS_RANGES = decodeTriplets(DATA.ranges, DATA.values);
const EAST_ASIAN_RANGES = decodePairs(DATA.eastAsian);
const EXT_PICT_CN_RANGES = decodePairs(DATA.extPictCn);

function searchRanges<T extends readonly [number, number, ...unknown[]]>(
  ranges: readonly T[],
  codePoint: number,
): T | undefined {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid]!;
    if (codePoint < range[0]) high = mid - 1;
    else if (codePoint > range[1]) low = mid + 1;
    else return range;
  }
  return undefined;
}

/** The post-fold UAX #14 class of a code point (default AL). */
export function lookupLineBreakClass(codePoint: number): LineBreakClass {
  return searchRanges(CLASS_RANGES, codePoint)?.[2] as string ?? "AL";
}

function isEastAsian(codePoint: number): boolean {
  return searchRanges(EAST_ASIAN_RANGES, codePoint) !== undefined;
}

function isExtPictCn(codePoint: number): boolean {
  return searchRanges(EXT_PICT_CN_RANGES, codePoint) !== undefined;
}

const HARD = new Set(["BK", "CR", "LF", "NL"]);
const NO_ATTACH = new Set(["BK", "CR", "LF", "NL", "SP", "ZW"]);
const DOTTED_CIRCLE = 0x25cc;

function isQU(cls: string): boolean {
  return cls === "QU" || cls === "QU_Pi" || cls === "QU_Pf";
}

interface Analysis {
  /** Code points and their UTF-16 offsets (offsets[n] = text.length). */
  readonly codePoints: number[];
  readonly offsets: number[];
  /** Original (tailored) class per code point. */
  readonly original: string[];
  /** Effective class after LB9 attachment / LB10 (AL for lone CM/ZWJ). */
  readonly effective: string[];
  /** True when the position is a CM/ZWJ attached to an earlier base. */
  readonly transparent: boolean[];
}

function analyze(text: string, options: LineBreakOptions): Analysis {
  const codePoints: number[] = [];
  const offsets: number[] = [];
  const original: string[] = [];
  for (let offset = 0; offset < text.length;) {
    const codePoint = text.codePointAt(offset)!;
    codePoints.push(codePoint);
    offsets.push(offset);
    let cls = lookupLineBreakClass(codePoint);
    cls = options.tailor?.(codePoint, cls) ?? cls;
    if (cls === "CJ") cls = "NS"; // default tailoring; a hook may override
    original.push(cls);
    offset += codePoint > 0xffff ? 2 : 1;
  }
  offsets.push(text.length);

  const effective: string[] = new Array(codePoints.length);
  const transparent: boolean[] = new Array(codePoints.length);
  for (let index = 0; index < codePoints.length; index += 1) {
    const cls = original[index]!;
    if ((cls === "CM" || cls === "ZWJ") && index > 0 && !NO_ATTACH.has(original[index - 1]!)) {
      effective[index] = effective[index - 1]!;
      transparent[index] = true;
    } else if (cls === "CM" || cls === "ZWJ") {
      effective[index] = "AL"; // LB10
      transparent[index] = false;
    } else {
      effective[index] = cls;
      transparent[index] = false;
    }
  }
  return { codePoints, offsets, original, effective, transparent };
}

/** Index of the base position at or before `index`, skipping transparency. */
function baseIndex(analysis: Analysis, index: number): number {
  let at = index;
  while (at >= 0 && analysis.transparent[at]) at -= 1;
  return at;
}

/** The previous non-transparent position strictly before `index`. */
function previousBase(analysis: Analysis, index: number): number {
  return baseIndex(analysis, index - 1);
}

/** Walks back from `index` (inclusive) over spaces; returns the position of
 * the last non-SP base, or -1 for start of text. */
function skipSpacesBack(analysis: Analysis, index: number): number {
  let at = baseIndex(analysis, index);
  while (at >= 0 && analysis.original[at] === "SP") at = previousBase(analysis, at);
  return at;
}

function isAkLike(analysis: Analysis, index: number): boolean {
  if (index < 0) return false;
  const cls = analysis.effective[index]!;
  return cls === "AK" || cls === "AS" || analysis.codePoints[index] === DOTTED_CIRCLE;
}

/** True when a break is allowed between positions `index-1` and `index`. */
function breakAllowed(analysis: Analysis, index: number): boolean {
  const { codePoints, original, effective, transparent } = analysis;
  const prevOriginal = original[index - 1]!;
  const nextOriginal = original[index]!;

  // LB4/LB5 hard breaks.
  if (prevOriginal === "BK") return true;
  if (prevOriginal === "CR" && nextOriginal === "LF") return false;
  if (prevOriginal === "CR" || prevOriginal === "LF" || prevOriginal === "NL") return true;
  // LB6.
  if (HARD.has(nextOriginal)) return false;
  // LB7.
  if (nextOriginal === "SP" || nextOriginal === "ZW") return false;
  // LB8: ZW SP* ÷.
  if (skipSpacesBack(analysis, index - 1) >= 0 && original[skipSpacesBack(analysis, index - 1)] === "ZW") return true;
  // LB8a.
  if (prevOriginal === "ZWJ") return false;
  // LB9: attached combining marks never detach.
  if (transparent[index]) return false;

  const beforeAt = baseIndex(analysis, index - 1);
  const before = beforeAt >= 0 ? effective[beforeAt]! : "sot";
  const next = effective[index]!;

  // LB11.
  if (next === "WJ" || before === "WJ") return false;
  // LB12.
  if (before === "GL") return false;
  // LB12a.
  if (next === "GL" && before !== "SP" && before !== "BA" && before !== "HY" && before !== "HH") return false;
  // LB13.
  if (next === "CL" || next === "CP" || next === "EX" || next === "SY") return false;
  // LB14: OP SP* ×.
  const anchorAt = skipSpacesBack(analysis, index - 1);
  const anchor = anchorAt >= 0 ? original[anchorAt]! : "sot";
  if (anchor === "OP") return false;
  // LB15a: (sot|BK|CR|LF|NL|OP|QU|GL|SP|ZW) QU_Pi SP* ×.
  if (anchor === "QU_Pi") {
    const beforeQuote = previousBase(analysis, anchorAt);
    const context = beforeQuote >= 0 ? original[beforeQuote]! : "sot";
    if (
      context === "sot" || HARD.has(context) || context === "OP" || isQU(context) || context === "GL" ||
      context === "SP" || context === "ZW"
    ) return false;
  }
  // LB15b: × QU_Pf (SP|GL|WJ|CL|QU|CP|EX|IS|SY|BK|CR|LF|NL|ZW|eot).
  if (nextOriginal === "QU_Pf") {
    const followAt = index + 1;
    const follow = followAt < original.length ? original[followAt]! : "eot";
    if (
      follow === "eot" || follow === "SP" || follow === "GL" || follow === "WJ" || follow === "CL" || isQU(follow) ||
      follow === "CP" || follow === "EX" || follow === "IS" || follow === "SY" || HARD.has(follow) || follow === "ZW"
    ) return false;
  }
  // LB15c: SP ÷ IS NU.
  if (prevOriginal === "SP" && next === "IS" && index + 1 < effective.length && effective[index + 1] === "NU") {
    return true;
  }
  // LB15d: × IS.
  if (next === "IS") return false;
  // LB16: (CL|CP) SP* × NS.
  if ((anchor === "CL" || anchor === "CP") && next === "NS") return false;
  // LB17: B2 SP* × B2.
  if (anchor === "B2" && next === "B2") return false;
  // LB18: SP ÷.
  if (prevOriginal === "SP") return true;
  // LB19: × [QU - Pi]; [QU - Pf] ×.
  if (next === "QU" || next === "QU_Pf") return false;
  if (before === "QU" || before === "QU_Pi") return false;
  // LB19a: East Asian aware quote handling.
  const beforeEast = beforeAt >= 0 && isEastAsian(codePoints[beforeAt]!);
  const nextEast = isEastAsian(codePoints[index]!);
  if (isQU(next)) {
    if (beforeAt < 0 || !beforeEast) return false;
    const followAt = index + 1;
    if (followAt >= codePoints.length || !isEastAsian(codePoints[followAt]!)) return false;
  }
  if (isQU(before)) {
    if (!nextEast) return false;
    const beforeQuote = previousBase(analysis, beforeAt);
    if (beforeQuote < 0 || !isEastAsian(codePoints[beforeQuote]!)) return false;
  }
  // LB20.
  if (next === "CB" || before === "CB") return true;
  // LB20a: (sot|BK|CR|LF|NL|SP|ZW|CB|GL) (HY|HH) × (AL|HL).
  if ((before === "HY" || before === "HH") && (next === "AL" || next === "HL")) {
    const beforeHyphen = previousBase(analysis, beforeAt);
    const context = beforeHyphen >= 0 ? original[beforeHyphen]! : "sot";
    if (
      context === "sot" || HARD.has(context) || context === "SP" || context === "ZW" || context === "CB" ||
      context === "GL"
    ) return false;
  }
  // LB21.
  if (next === "BA" || next === "HH" || next === "HY" || next === "NS") return false;
  if (before === "BB") return false;
  // LB21a: HL (HY|HH) × [^HL].
  if ((before === "HY" || before === "HH") && next !== "HL") {
    const beforeHyphen = previousBase(analysis, beforeAt);
    if (beforeHyphen >= 0 && effective[beforeHyphen] === "HL") return false;
  }
  // LB21b.
  if (before === "SY" && next === "HL") return false;
  // LB22.
  if (next === "IN") return false;
  // LB23.
  if ((before === "AL" || before === "HL") && next === "NU") return false;
  if (before === "NU" && (next === "AL" || next === "HL")) return false;
  // LB23a.
  if (before === "PR" && (next === "ID" || next === "EB" || next === "EM")) return false;
  if ((before === "ID" || before === "EB" || before === "EM") && next === "PO") return false;
  // LB24.
  if ((before === "PR" || before === "PO") && (next === "AL" || next === "HL")) return false;
  if ((before === "AL" || before === "HL") && (next === "PR" || next === "PO")) return false;
  // LB25 numeric sequences (ordered sub-rules).
  {
    // NU (SY|IS)* (CL|CP)? × (PO|PR) and NU (SY|IS)* × NU.
    let scan = beforeAt;
    let sawCloser = false;
    if (scan >= 0 && (effective[scan] === "CL" || effective[scan] === "CP")) {
      sawCloser = true;
      scan = previousBase(analysis, scan);
    }
    while (scan >= 0 && (effective[scan] === "SY" || effective[scan] === "IS")) scan = previousBase(analysis, scan);
    const numericContext = scan >= 0 && effective[scan] === "NU";
    if (numericContext && (next === "PO" || next === "PR")) return false;
    if (numericContext && !sawCloser && next === "NU") return false;
  }
  if (before === "PO" || before === "PR") {
    if (next === "NU") return false;
    if (next === "OP") {
      const one = index + 1 < effective.length ? effective[index + 1]! : "eot";
      const two = index + 2 < effective.length ? effective[index + 2]! : "eot";
      if (one === "NU" || (one === "IS" && two === "NU")) return false;
    }
  }
  if ((before === "HY" || before === "IS") && next === "NU") return false;
  // LB26.
  if (before === "JL" && (next === "JL" || next === "JV" || next === "H2" || next === "H3")) return false;
  if ((before === "JV" || before === "H2") && (next === "JV" || next === "JT")) return false;
  if ((before === "JT" || before === "H3") && next === "JT") return false;
  // LB27.
  if (
    (before === "JL" || before === "JV" || before === "JT" || before === "H2" || before === "H3") && next === "PO"
  ) return false;
  if (before === "PR" && (next === "JL" || next === "JV" || next === "JT" || next === "H2" || next === "H3")) {
    return false;
  }
  // LB28.
  if ((before === "AL" || before === "HL") && (next === "AL" || next === "HL")) return false;
  // LB28a Brahmic clusters.
  {
    const nextAk = isAkLike(analysis, index);
    const beforeAk = isAkLike(analysis, beforeAt);
    if (before === "AP" && (nextAk || next === "AS")) return false;
    if ((beforeAk || before === "AS") && (next === "VF" || next === "VI")) return false;
    if (before === "VI") {
      const beforeVirama = previousBase(analysis, beforeAt);
      if (
        (isAkLike(analysis, beforeVirama) || (beforeVirama >= 0 && effective[beforeVirama] === "AS")) &&
        nextAk && effective[index] !== "AS"
      ) return false;
    }
    if ((beforeAk || before === "AS") && (nextAk || next === "AS")) {
      const follow = index + 1 < effective.length ? effective[index + 1]! : "eot";
      if (follow === "VF") return false;
    }
  }
  // LB29.
  if (before === "IS" && (next === "AL" || next === "HL")) return false;
  // LB30.
  if ((before === "AL" || before === "HL" || before === "NU") && next === "OP" && !isEastAsian(codePoints[index]!)) {
    return false;
  }
  if (
    before === "CP" && beforeAt >= 0 && !isEastAsian(codePoints[beforeAt]!) &&
    (next === "AL" || next === "HL" || next === "NU")
  ) return false;
  // LB30a: break between RI pairs only.
  if (before === "RI" && next === "RI") {
    let count = 0;
    for (let scan = beforeAt; scan >= 0 && effective[scan] === "RI"; scan = previousBase(analysis, scan)) count += 1;
    if (count % 2 === 1) return false;
  }
  // LB30b.
  if (before === "EB" && next === "EM") return false;
  if (beforeAt >= 0 && isExtPictCn(codePoints[beforeAt]!) && next === "EM") return false;
  // LB31.
  return true;
}

/** All break opportunities in a string, end of text included (mandatory). */
export function lineBreakOpportunities(text: string, options: LineBreakOptions = {}): LineBreakOpportunity[] {
  if (text.length === 0) return [];
  const analysis = analyze(text, options);
  const opportunities: LineBreakOpportunity[] = [];
  for (let index = 1; index < analysis.codePoints.length; index += 1) {
    if (!breakAllowed(analysis, index)) continue;
    const prev = analysis.original[index - 1]!;
    const mandatory = prev === "BK" || prev === "LF" || prev === "NL" ||
      (prev === "CR" && analysis.original[index] !== "LF");
    opportunities.push({ offset: analysis.offsets[index]!, mandatory });
  }
  opportunities.push({ offset: text.length, mandatory: true }); // LB3
  return opportunities;
}

/** One wrapped line as a half-open UTF-16 slice of the input. */
export interface TerminalWrappedLine {
  readonly start: number;
  readonly end: number;
  /** True when the line ended at a hard break in the source. */
  readonly hard: boolean;
}

/** Options for terminal wrapping. */
export interface TerminalWrapOptions extends LineBreakOptions, EmojiAwareWidthOptions {}

/**
 * Wraps text to a column budget using UAX #14 opportunities restricted to
 * grapheme boundaries, with emergency grapheme-boundary breaks when a single
 * segment exceeds the budget. The returned slices partition the input
 * exactly — joining them reconstructs the original string, hard breaks
 * included — and no line ever splits a grapheme cluster.
 */
export function wrapTerminalText(
  text: string,
  columns: number,
  options: TerminalWrapOptions = {},
): readonly TerminalWrappedLine[] {
  if (text.length === 0) return [];
  const budget = Math.max(1, Math.floor(columns));
  const spans = segmentEmojiSequences(text, options);
  const allowed = new Set<number>();
  const mandatory = new Set<number>();
  for (const opportunity of lineBreakOpportunities(text, options)) {
    if (!isGraphemeBoundary(text, opportunity.offset)) continue;
    allowed.add(opportunity.offset);
    // LB3's end-of-text opportunity is not a hard break in the source.
    if (opportunity.mandatory && opportunity.offset < text.length) mandatory.add(opportunity.offset);
  }

  const lines: TerminalWrappedLine[] = [];
  let lineStart = 0;
  let cells = 0;
  let lastOpportunity = -1;
  for (const span of spans) {
    if (mandatory.has(span.start) && span.start > lineStart) {
      lines.push({ start: lineStart, end: span.start, hard: true });
      lineStart = span.start;
      cells = 0;
      lastOpportunity = -1;
    }
    if (allowed.has(span.start) && span.start > lineStart) lastOpportunity = span.start;
    if (cells + span.cells > budget && span.start > lineStart) {
      // Prefer the last UAX #14 opportunity; fall back to an emergency break
      // at this grapheme boundary.
      const breakAt = lastOpportunity > lineStart ? lastOpportunity : span.start;
      lines.push({ start: lineStart, end: breakAt, hard: false });
      lineStart = breakAt;
      cells = 0;
      lastOpportunity = -1;
      for (const resumed of spans) {
        if (resumed.start >= lineStart && resumed.start < span.end) cells += resumed.cells;
      }
      continue;
    }
    cells += span.cells;
  }
  if (lineStart < text.length) {
    lines.push({ start: lineStart, end: text.length, hard: /[\n\r\u0085\u000B\u000C\u2028\u2029]$/.test(text) });
  }
  return lines;
}
