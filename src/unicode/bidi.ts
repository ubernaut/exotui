// Copyright 2023 Im-Beast. MIT license.

// TXT-008: the Unicode Bidirectional Algorithm (UAX #9, Unicode 17.0.0)
// over the pinned bidi data module. Logical storage is preserved: the
// analysis exposes resolved levels, visual order, level runs, and
// logical↔visual hit-test mappings, and the official BidiCharacterTest
// corpus drives conformance. Explicit formatting characters (X9) keep
// their positions but are marked removed, so mappings stay index-stable.

import { GENERATED_UNICODE_17_0_0_BIDI_DATA } from "./generated/unicode_17_0_0_bidi.ts";

interface BidiData {
  readonly values: readonly string[];
  readonly ranges: readonly number[];
  readonly missingRanges: readonly number[];
  readonly brackets: ReadonlyArray<readonly [number, number, number]>;
}

const DATA = GENERATED_UNICODE_17_0_0_BIDI_DATA as BidiData;

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

const CLASS_RANGES = decodeTriplets(DATA.ranges, DATA.values);
const MISSING_RANGES = decodeTriplets(DATA.missingRanges, DATA.values);
const OPEN_BRACKETS = new Map<number, number>(); // open cp → paired close cp
const CLOSE_BRACKETS = new Set<number>();
for (const [code, paired, type] of DATA.brackets) {
  if (type === 0) OPEN_BRACKETS.set(code, paired);
  else CLOSE_BRACKETS.add(code);
}

function search(ranges: Array<[number, number, string]>, codePoint: number): string | undefined {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid]!;
    if (codePoint < range[0]) high = mid - 1;
    else if (codePoint > range[1]) low = mid + 1;
    else return range[2];
  }
  return undefined;
}

/** The UAX #9 Bidi_Class of a code point. */
export function lookupBidiClass(codePoint: number): string {
  return search(CLASS_RANGES, codePoint) ?? search(MISSING_RANGES, codePoint) ?? "L";
}

/** One level run in the resolved analysis. */
export interface BidiRun {
  readonly start: number;
  readonly end: number;
  readonly level: number;
}

/** The full analysis of one paragraph. */
export interface BidiParagraph {
  readonly paragraphLevel: number;
  /** Resolved level per code point; -1 for X9-removed formatting characters. */
  readonly levels: readonly number[];
  /** Logical indices (removed chars omitted) in visual order. */
  readonly visualOrder: readonly number[];
  readonly runs: readonly BidiRun[];
  /** logical index → visual position (-1 for removed). */
  readonly logicalToVisual: readonly number[];
  /** visual position → logical index. */
  readonly visualToLogical: readonly number[];
}

const MAX_DEPTH = 125;
const REMOVED = new Set(["RLE", "LRE", "RLO", "LRO", "PDF", "BN"]);
const ISOLATE_INITIATORS = new Set(["LRI", "RLI", "FSI"]);
const STRONG = new Set(["L", "R", "AL"]);

/** Analyzes one paragraph of code points. */
export function bidiParagraph(
  codePoints: readonly number[],
  options: { readonly direction?: "ltr" | "rtl" | "auto" } = {},
): BidiParagraph {
  const length = codePoints.length;
  const classes = codePoints.map(lookupBidiClass);

  // ── P2/P3: the paragraph level (isolate runs are skipped) ────────────────
  const paragraphLevel = options.direction === "ltr"
    ? 0
    : options.direction === "rtl"
    ? 1
    : firstStrongLevel(classes, 0, length);

  // ── X1–X8: explicit levels via the directional status stack ──────────────
  const levels = new Array<number>(length).fill(paragraphLevel);
  const resolved = [...classes];
  {
    interface Entry {
      level: number;
      override: "L" | "R" | undefined;
      isolate: boolean;
    }
    const stack: Entry[] = [{ level: paragraphLevel, override: undefined, isolate: false }];
    let overflowIsolate = 0;
    let overflowEmbedding = 0;
    let validIsolate = 0;
    const matchingPdi = computeMatchingPdi(classes);

    for (let index = 0; index < length; index += 1) {
      const cls = classes[index]!;
      const top = () => stack[stack.length - 1]!;
      const nextLevel = (odd: boolean): number => {
        const level = top().level;
        return odd ? level + (level % 2 === 0 ? 1 : 2) : level + (level % 2 === 0 ? 2 : 1);
      };
      switch (cls) {
        case "RLE":
        case "LRE":
        case "RLO":
        case "LRO": {
          levels[index] = top().level;
          const odd = cls === "RLE" || cls === "RLO";
          const level = nextLevel(odd);
          if (level <= MAX_DEPTH && overflowIsolate === 0 && overflowEmbedding === 0) {
            stack.push({
              level,
              override: cls === "RLO" ? "R" : cls === "LRO" ? "L" : undefined,
              isolate: false,
            });
          } else if (overflowIsolate === 0) overflowEmbedding += 1;
          break;
        }
        case "LRI":
        case "RLI":
        case "FSI": {
          const effective = cls === "FSI"
            ? (firstStrongLevel(classes, index + 1, matchingPdi[index] ?? length) === 1 ? "RLI" : "LRI")
            : cls;
          levels[index] = top().level;
          if (top().override) resolved[index] = top().override!;
          const level = nextLevel(effective === "RLI");
          if (level <= MAX_DEPTH && overflowIsolate === 0 && overflowEmbedding === 0) {
            validIsolate += 1;
            stack.push({ level, override: undefined, isolate: true });
          } else overflowIsolate += 1;
          break;
        }
        case "PDI": {
          if (overflowIsolate > 0) overflowIsolate -= 1;
          else if (validIsolate > 0) {
            overflowEmbedding = 0;
            while (!top().isolate) stack.pop();
            stack.pop();
            validIsolate -= 1;
          }
          levels[index] = top().level;
          if (top().override) resolved[index] = top().override!;
          break;
        }
        case "PDF": {
          levels[index] = top().level;
          if (overflowIsolate > 0) break;
          if (overflowEmbedding > 0) overflowEmbedding -= 1;
          else if (!top().isolate && stack.length > 1) stack.pop();
          break;
        }
        case "B": {
          levels[index] = paragraphLevel;
          break;
        }
        default: {
          levels[index] = top().level;
          if (top().override) resolved[index] = top().override!;
          break;
        }
      }
    }
  }

  // ── X9: mark removed characters ──────────────────────────────────────────
  const removed = classes.map((cls) => REMOVED.has(cls));

  // ── X10: isolating run sequences with sos/eos ────────────────────────────
  const sequences = isolatingRunSequences(classes, levels, removed, paragraphLevel);

  // ── W1–W7, N0–N2 per sequence ────────────────────────────────────────────
  for (const sequence of sequences) {
    applyWeakRules(sequence, resolved, classes);
    applyBracketRule(sequence, resolved, classes, codePoints);
    applyNeutralRules(sequence, resolved);
  }

  // ── I1/I2: implicit levels ───────────────────────────────────────────────
  for (let index = 0; index < length; index += 1) {
    if (removed[index]) continue;
    const cls = resolved[index]!;
    const level = levels[index]!;
    if (level % 2 === 0) {
      if (cls === "R") levels[index] = level + 1;
      else if (cls === "AN" || cls === "EN") levels[index] = level + 2;
    } else {
      if (cls === "L" || cls === "AN" || cls === "EN") levels[index] = level + 1;
    }
  }

  // ── L1: reset separators and trailing whitespace ─────────────────────────
  for (let index = 0; index < length; index += 1) {
    const cls = classes[index]!;
    if (cls === "B" || cls === "S") {
      levels[index] = paragraphLevel;
      for (let back = index - 1; back >= 0; back -= 1) {
        const backClass = classes[back]!;
        if (backClass === "WS" || ISOLATE_INITIATORS.has(backClass) || backClass === "PDI") {
          levels[back] = paragraphLevel;
        } else if (removed[back]) continue;
        else break;
      }
    }
  }
  for (let back = length - 1; back >= 0; back -= 1) {
    const backClass = classes[back]!;
    if (backClass === "WS" || ISOLATE_INITIATORS.has(backClass) || backClass === "PDI") levels[back] = paragraphLevel;
    else if (removed[back]) continue;
    else break;
  }

  // ── L2: reorder ──────────────────────────────────────────────────────────
  const visible: number[] = [];
  for (let index = 0; index < length; index += 1) if (!removed[index]) visible.push(index);
  const order = [...visible];
  const maxLevel = Math.max(paragraphLevel, ...visible.map((index) => levels[index]!));
  const minOdd = Math.min(
    ...visible.map((index) => levels[index]!).filter((level) => level % 2 === 1),
    Infinity,
  );
  for (let level = maxLevel; level >= (minOdd === Infinity ? maxLevel + 1 : minOdd); level -= 1) {
    let runStart = -1;
    for (let position = 0; position <= order.length; position += 1) {
      const inRun = position < order.length && levels[order[position]!]! >= level;
      if (inRun && runStart < 0) runStart = position;
      else if (!inRun && runStart >= 0) {
        reverseSection(order, runStart, position - 1);
        runStart = -1;
      }
    }
  }

  const finalLevels = levels.map((level, index) => removed[index] ? -1 : level);
  const logicalToVisual = new Array<number>(length).fill(-1);
  order.forEach((logical, visual) => logicalToVisual[logical] = visual);

  const runs: BidiRun[] = [];
  for (let index = 0; index < length; index += 1) {
    if (removed[index]) continue;
    const level = levels[index]!;
    const last = runs.at(-1);
    if (last && last.end === index && last.level === level) {
      runs[runs.length - 1] = { start: last.start, end: index + 1, level };
    } else runs.push({ start: index, end: index + 1, level });
  }

  return {
    paragraphLevel,
    levels: finalLevels,
    visualOrder: order,
    runs,
    logicalToVisual,
    visualToLogical: order,
  };
}

/** Analyzes a string (code-point indexed). */
export function bidiParagraphOfText(
  text: string,
  options: { readonly direction?: "ltr" | "rtl" | "auto" } = {},
): BidiParagraph {
  return bidiParagraph([...text].map((char) => char.codePointAt(0)!), options);
}

// ── helpers ────────────────────────────────────────────────────────────────

function firstStrongLevel(classes: readonly string[], from: number, to: number): number {
  let isolateDepth = 0;
  for (let index = from; index < to; index += 1) {
    const cls = classes[index]!;
    if (ISOLATE_INITIATORS.has(cls)) isolateDepth += 1;
    else if (cls === "PDI") {
      if (isolateDepth === 0) break; // P2 scope ends at an unmatched PDI
      isolateDepth -= 1;
    } else if (isolateDepth === 0 && STRONG.has(cls)) return cls === "L" ? 0 : 1;
  }
  return 0;
}

function computeMatchingPdi(classes: readonly string[]): Array<number | undefined> {
  const matching = new Array<number | undefined>(classes.length);
  const stack: number[] = [];
  for (let index = 0; index < classes.length; index += 1) {
    const cls = classes[index]!;
    if (ISOLATE_INITIATORS.has(cls)) stack.push(index);
    else if (cls === "PDI" && stack.length > 0) matching[stack.pop()!] = index;
  }
  return matching;
}

interface RunSequence {
  /** Logical indices in sequence order (removed chars excluded). */
  readonly indices: number[];
  readonly sos: "L" | "R";
  readonly eos: "L" | "R";
  readonly level: number;
}

function isolatingRunSequences(
  classes: readonly string[],
  levels: readonly number[],
  removed: readonly boolean[],
  paragraphLevel: number,
): RunSequence[] {
  // Level runs over non-removed characters.
  interface Run {
    indices: number[];
    level: number;
  }
  const runs: Run[] = [];
  for (let index = 0; index < classes.length; index += 1) {
    if (removed[index]) continue;
    const level = levels[index]!;
    const last = runs.at(-1);
    if (last && last.level === level && lastLogical(last) === previousVisible(removed, index)) {
      last.indices.push(index);
    } else runs.push({ indices: [index], level });
  }
  const matchingPdi = computeMatchingPdi(classes);
  const usedAsContinuation = new Set<Run>();
  const runOfIndex = new Map<number, Run>();
  for (const run of runs) for (const index of run.indices) runOfIndex.set(index, run);

  const sequences: RunSequence[] = [];
  for (const run of runs) {
    if (usedAsContinuation.has(run)) continue;
    const chain: number[] = [];
    let current: Run | undefined = run;
    while (current) {
      chain.push(...current.indices);
      const lastIndex: number = current.indices[current.indices.length - 1]!;
      const cls = classes[lastIndex]!;
      let next: Run | undefined;
      if (ISOLATE_INITIATORS.has(cls)) {
        const pdi = matchingPdi[lastIndex];
        if (pdi !== undefined) next = runOfIndex.get(pdi);
      }
      if (next) usedAsContinuation.add(next);
      current = next;
    }
    const level = run.level;
    const first = chain[0]!;
    const before = previousVisible(removed, first);
    const sosLevel = Math.max(level, before >= 0 ? levels[before]! : paragraphLevel);
    const lastIndex = chain[chain.length - 1]!;
    const endsWithUnmatchedIsolate = ISOLATE_INITIATORS.has(classes[lastIndex]!) &&
      matchingPdi[lastIndex] === undefined;
    const after = nextVisible(removed, lastIndex, classes.length);
    const eosLevel = endsWithUnmatchedIsolate
      ? Math.max(level, paragraphLevel)
      : Math.max(level, after < classes.length ? levels[after]! : paragraphLevel);
    sequences.push({
      indices: chain,
      level,
      sos: sosLevel % 2 === 0 ? "L" : "R",
      eos: eosLevel % 2 === 0 ? "L" : "R",
    });
  }
  return sequences;

  function lastLogical(run: Run): number {
    return run.indices[run.indices.length - 1]!;
  }
}

function previousVisible(removed: readonly boolean[], index: number): number {
  for (let back = index - 1; back >= 0; back -= 1) if (!removed[back]) return back;
  return -1;
}

function nextVisible(removed: readonly boolean[], index: number, length: number): number {
  for (let forward = index + 1; forward < length; forward += 1) if (!removed[forward]) return forward;
  return length;
}

function applyWeakRules(sequence: RunSequence, resolved: string[], classes: readonly string[]): void {
  const { indices, sos } = sequence;
  // W1: NSM takes the type of the previous character (sos at start; isolate
  // initiators and PDI force ON).
  for (let position = 0; position < indices.length; position += 1) {
    const index = indices[position]!;
    if (resolved[index] !== "NSM") continue;
    if (position === 0) resolved[index] = sos;
    else {
      const previousClass = classes[indices[position - 1]!]!;
      const previousResolved = resolved[indices[position - 1]!]!;
      resolved[index] = ISOLATE_INITIATORS.has(previousClass) || previousClass === "PDI" ? "ON" : previousResolved;
    }
  }
  // W2: EN → AN when the last strong type is AL.
  let strong: string = sos;
  for (const index of indices) {
    const cls = resolved[index]!;
    if (STRONG.has(cls)) strong = cls;
    else if (cls === "EN" && strong === "AL") resolved[index] = "AN";
  }
  // W3: AL → R.
  for (const index of indices) if (resolved[index] === "AL") resolved[index] = "R";
  // W4: single ES between EN pairs → EN; single CS between a pair of the
  // same number type → that type.
  for (let position = 1; position < indices.length - 1; position += 1) {
    const index = indices[position]!;
    const cls = resolved[index]!;
    const before = resolved[indices[position - 1]!]!;
    const after = resolved[indices[position + 1]!]!;
    if (cls === "ES" && before === "EN" && after === "EN") resolved[index] = "EN";
    else if (cls === "CS" && before === after && (before === "EN" || before === "AN")) resolved[index] = before;
  }
  // W5: ET runs adjacent to EN → EN.
  for (let position = 0; position < indices.length; position += 1) {
    if (resolved[indices[position]!] !== "ET") continue;
    let runEnd = position;
    while (runEnd < indices.length && resolved[indices[runEnd]!] === "ET") runEnd += 1;
    const beforeEn = position > 0 && resolved[indices[position - 1]!] === "EN";
    const afterEn = runEnd < indices.length && resolved[indices[runEnd]!] === "EN";
    if (beforeEn || afterEn) {
      for (let at = position; at < runEnd; at += 1) resolved[indices[at]!] = "EN";
    }
    position = runEnd - 1;
  }
  // W6: remaining ES/ET/CS → ON.
  for (const index of indices) {
    const cls = resolved[index]!;
    if (cls === "ES" || cls === "ET" || cls === "CS") resolved[index] = "ON";
  }
  // W7: EN → L when the last strong type is L.
  strong = sos;
  for (const index of indices) {
    const cls = resolved[index]!;
    if (cls === "L" || cls === "R") strong = cls;
    else if (cls === "EN" && strong === "L") resolved[index] = "L";
  }
}

const CANONICAL_BRACKET_ALIASES = new Map<number, number>([[0x3008, 0x2329], [0x3009, 0x232a]]);

function canonicalBracket(codePoint: number): number {
  return CANONICAL_BRACKET_ALIASES.get(codePoint) ?? codePoint;
}

function applyBracketRule(
  sequence: RunSequence,
  resolved: string[],
  classes: readonly string[],
  codePoints: readonly number[],
): void {
  const { indices, level, sos } = sequence;
  const embedding: "L" | "R" = level % 2 === 0 ? "L" : "R";
  // BD16: pair brackets with a bounded stack (63) over ON characters.
  const stack: Array<{ close: number; position: number }> = [];
  const pairs: Array<{ open: number; close: number }> = [];
  for (let position = 0; position < indices.length; position += 1) {
    const index = indices[position]!;
    if (resolved[index] !== "ON") continue;
    const codePoint = codePoints[index]!;
    const paired = OPEN_BRACKETS.get(codePoint);
    if (paired !== undefined) {
      if (stack.length >= 63) return; // BD16: stop processing entirely
      stack.push({ close: canonicalBracket(paired), position });
    } else if (CLOSE_BRACKETS.has(codePoint)) {
      const canonical = canonicalBracket(codePoint);
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        if (stack[depth]!.close === canonical) {
          pairs.push({ open: stack[depth]!.position, close: position });
          stack.length = depth;
          break;
        }
      }
    }
  }
  pairs.sort((left, right) => left.open - right.open);

  for (const pair of pairs) {
    // N0: strong types inside the pair.
    let sawEmbedding = false;
    let sawOpposite = false;
    for (let position = pair.open + 1; position < pair.close; position += 1) {
      const cls = strongClassOf(resolved[indices[position]!]!);
      if (cls === embedding) sawEmbedding = true;
      else if (cls !== undefined) sawOpposite = true;
    }
    let direction: "L" | "R" | undefined;
    if (sawEmbedding) direction = embedding;
    else if (sawOpposite) {
      // Context before the opening bracket, else sos.
      let context: "L" | "R" = sos;
      for (let position = pair.open - 1; position >= 0; position -= 1) {
        const cls = strongClassOf(resolved[indices[position]!]!);
        if (cls !== undefined) {
          context = cls;
          break;
        }
      }
      direction = context !== embedding ? context : embedding;
    }
    if (direction) {
      resolved[indices[pair.open]!] = direction;
      resolved[indices[pair.close]!] = direction;
      // NSMs following a re-typed bracket take its type.
      for (const at of [pair.open, pair.close]) {
        for (let position = at + 1; position < indices.length; position += 1) {
          if (classes[indices[position]!] === "NSM") resolved[indices[position]!] = direction;
          else break;
        }
      }
    }
  }

  function strongClassOf(cls: string): "L" | "R" | undefined {
    if (cls === "L") return "L";
    if (cls === "R" || cls === "EN" || cls === "AN") return "R";
    return undefined;
  }
}

const NEUTRAL = new Set(["B", "S", "WS", "ON", "LRI", "RLI", "FSI", "PDI"]);

function applyNeutralRules(sequence: RunSequence, resolved: string[]): void {
  const { indices, level, sos, eos } = sequence;
  const embedding: "L" | "R" = level % 2 === 0 ? "L" : "R";
  for (let position = 0; position < indices.length; position += 1) {
    if (!NEUTRAL.has(resolved[indices[position]!]!)) continue;
    let runEnd = position;
    while (runEnd < indices.length && NEUTRAL.has(resolved[indices[runEnd]!]!)) runEnd += 1;
    const before = position > 0 ? directionOf(resolved[indices[position - 1]!]!) : sos;
    const after = runEnd < indices.length ? directionOf(resolved[indices[runEnd]!]!) : eos;
    const direction = before === after ? before : embedding; // N1 else N2
    for (let at = position; at < runEnd; at += 1) resolved[indices[at]!] = direction;
    position = runEnd - 1;
  }

  function directionOf(cls: string): "L" | "R" {
    if (cls === "L") return "L";
    return "R"; // R, EN, AN all count as R for N1
  }
}

function reverseSection(order: number[], from: number, to: number): void {
  while (from < to) {
    const swap = order[from]!;
    order[from] = order[to]!;
    order[to] = swap;
    from += 1;
    to -= 1;
  }
}
