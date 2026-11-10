import { assert, assertEquals, assertFalse, assertNotStrictEquals, assertThrows } from "./deps.ts";
import {
  BUILTIN_UNICODE_DATA_PACK,
  coveringGraphemeRange,
  DEFAULT_UNICODE_GRAPHEME_SEGMENTER,
  fingerprintUnicodeDataPackContent,
  graphemeBoundaries,
  isGraphemeBoundary,
  iterateGraphemes,
  lookupIndicConjunctBreakProperty,
  nextGraphemeBoundary,
  previousGraphemeBoundary,
  resolveGraphemeBoundary,
  segmentGraphemes,
  truncateGraphemeClusters,
  truncateGraphemeUtf16,
  type UnicodeDataPack,
  UnicodeDataPackValidationError,
  unicodeDataSha256,
  UnicodeGraphemeBoundaryCursor,
  UnicodeGraphemeChunkSegmenter,
  UnicodeGraphemeDataError,
  UnicodeGraphemeSegmenter,
} from "../src/unicode/mod.ts";

const GRAPHEME_BREAK_TEST_PATH = new URL(
  "./fixtures/unicode/GraphemeBreakTest-17.0.0.txt",
  import.meta.url,
);
const GRAPHEME_BREAK_TEST_SHA256 = "e2d134d2c52919bace503ebb6a551c1855fe1a1faec18478c78fff254a1793ec";

Deno.test("constant-space boundary cursor matches all official Unicode 17 fixture boundaries", async () => {
  const bytes = await Deno.readFile(GRAPHEME_BREAK_TEST_PATH);
  assertEquals(unicodeDataSha256(bytes), GRAPHEME_BREAK_TEST_SHA256);
  const fixtures = parseGraphemeBreakFixture(new TextDecoder().decode(bytes));
  const cursor = new UnicodeGraphemeBoundaryCursor();
  assertEquals(fixtures.length, 766);
  for (const fixture of fixtures) {
    cursor.reset();
    const actual: number[] = [];
    let offset = 0;
    for (const scalar of fixture.text) {
      if (cursor.push(scalar.codePointAt(0)!)) actual.push(offset);
      offset += scalar.length;
    }
    actual.push(offset);
    assertEquals(actual, fixture.boundaries, `official boundary cursor line ${fixture.line}`);
  }
  cursor.reset();
  assertEquals(cursor.push(0x61), true);
  for (const invalid of [-1, 0x110000, 1.5, Infinity, NaN]) assertThrows(() => cursor.push(invalid), RangeError);
  assertEquals(cursor.push(0x301), false); // refusals do not mutate the valid streaming state
  cursor.reset();
  assertEquals(cursor.push(0xd800), true); // JavaScript isolated surrogates retain their own boundary
  assertEquals(cursor.push(0xdc00), true);
});

interface GraphemeBreakFixtureCase {
  readonly line: number;
  readonly text: string;
  readonly boundaries: readonly number[];
}

function parseGraphemeBreakFixture(source: string): readonly GraphemeBreakFixtureCase[] {
  const result: GraphemeBreakFixtureCase[] = [];
  const lines = source.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const body = lines[lineIndex].split("#", 1)[0].trim();
    if (body.length === 0) continue;
    const tokens = body.split(/\s+/);
    assert(tokens.length >= 3 && tokens.length % 2 === 1, `Malformed fixture line ${lineIndex + 1}`);
    let text = "";
    let offset = 0;
    const boundaries: number[] = [];
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (index % 2 === 0) {
        assert(token === "÷" || token === "×", `Malformed boundary marker on fixture line ${lineIndex + 1}`);
        if (token === "÷") boundaries.push(offset);
      } else {
        assert(/^[0-9A-F]{4,6}$/.test(token), `Malformed code point on fixture line ${lineIndex + 1}`);
        const scalar = String.fromCodePoint(Number.parseInt(token, 16));
        text += scalar;
        offset += scalar.length;
      }
    }
    assertEquals(tokens[0], "÷", `Fixture line ${lineIndex + 1} must begin with a boundary`);
    assertEquals(tokens[tokens.length - 1], "÷", `Fixture line ${lineIndex + 1} must end with a boundary`);
    result.push(Object.freeze({ line: lineIndex + 1, text, boundaries: Object.freeze(boundaries) }));
  }
  return Object.freeze(result);
}

function collectChunks(
  text: string,
  splitPoints: readonly number[],
): readonly ReturnType<typeof segmentGraphemes>[number][] {
  const stream = new UnicodeGraphemeChunkSegmenter();
  const result: ReturnType<typeof segmentGraphemes>[number][] = [];
  let start = 0;
  for (const end of [...splitPoints, text.length]) {
    result.push(...stream.push(text.slice(start, end)));
    start = end;
  }
  result.push(...stream.finish());
  return result;
}

Deno.test("Unicode 17.0.0 official GraphemeBreakTest corpus passes unchanged", async () => {
  const bytes = await Deno.readFile(GRAPHEME_BREAK_TEST_PATH);
  assertEquals(unicodeDataSha256(bytes), GRAPHEME_BREAK_TEST_SHA256);
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert(source.startsWith("# GraphemeBreakTest-17.0.0.txt\n"));
  const fixtures = parseGraphemeBreakFixture(source);
  const fullPackSegmenter = new UnicodeGraphemeSegmenter(BUILTIN_UNICODE_DATA_PACK);
  assertEquals(fixtures.length, 766);
  assertEquals(DEFAULT_UNICODE_GRAPHEME_SEGMENTER.inspect(), fullPackSegmenter.inspect());
  for (const fixture of fixtures) {
    assertEquals(
      graphemeBoundaries(fixture.text),
      fixture.boundaries,
      `compact GraphemeBreakTest-17.0.0.txt:${fixture.line}`,
    );
    assertEquals(
      fullPackSegmenter.boundaries(fixture.text),
      fixture.boundaries,
      `full-pack GraphemeBreakTest-17.0.0.txt:${fixture.line}`,
    );
  }
});

Deno.test("extended grapheme rules cover CRLF, Hangul, RI, emoji ZWJ, Prepend, and Indic conjuncts", () => {
  const examples: readonly [string, readonly string[]][] = [
    ["", []],
    ["\r\n", ["\r\n"]],
    ["\r\u0308\n", ["\r", "\u0308", "\n"]],
    ["\u1100\u1161\u11a8", ["\u1100\u1161\u11a8"]],
    ["🇦🇧🇨🇩🇪", ["🇦🇧", "🇨🇩", "🇪"]],
    ["👩🏽‍💻", ["👩🏽‍💻"]],
    ["👩‍👩‍👧‍👦", ["👩‍👩‍👧‍👦"]],
    ["1️⃣", ["1️⃣"]],
    ["\u0600A", ["\u0600A"]],
    ["क्‍त", ["क्‍त"]],
    ["क्‍त्‍य", ["क्‍त्‍य"]],
  ];
  for (const [text, expected] of examples) {
    assertEquals(segmentGraphemes(text).map((cluster) => cluster.segment), expected, JSON.stringify(text));
  }

  assertEquals(lookupIndicConjunctBreakProperty(0x0915), "Consonant");
  assertEquals(lookupIndicConjunctBreakProperty(0x094d), "Linker");
  assertEquals(lookupIndicConjunctBreakProperty(0x0301), "Extend");
  assertEquals(lookupIndicConjunctBreakProperty(0x0041), "None");
  for (const invalid of [-1, 0x110000, 1.5, Number.NaN]) {
    assertThrows(() => lookupIndicConjunctBreakProperty(invalid), RangeError);
  }
});

Deno.test("boundary navigation, selection, and truncation never split UTF-16 surrogate pairs or clusters", () => {
  const text = "A😀e\u0301Z";
  assertEquals(graphemeBoundaries(text), [0, 1, 3, 5, 6]);
  assert(isGraphemeBoundary(text, 0));
  assert(isGraphemeBoundary(text, 3));
  assertFalse(isGraphemeBoundary(text, 2));
  assertFalse(isGraphemeBoundary(text, 4));
  assertEquals(previousGraphemeBoundary(text, 0), 0);
  assertEquals(previousGraphemeBoundary(text, 2), 1);
  assertEquals(previousGraphemeBoundary(text, 3), 1);
  assertEquals(nextGraphemeBoundary(text, 2), 3);
  assertEquals(nextGraphemeBoundary(text, 3), 5);
  assertEquals(nextGraphemeBoundary(text, text.length), text.length);
  assertEquals(resolveGraphemeBoundary(text, 2, "backward"), 1);
  assertEquals(resolveGraphemeBoundary(text, 2, "forward"), 3);
  assertEquals(resolveGraphemeBoundary(text, 2, "nearest"), 1);
  assertEquals(resolveGraphemeBoundary(text, 4, "nearest"), 3);
  assertEquals(coveringGraphemeRange(text, 2, 4), { start: 1, end: 5 });

  assertEquals(truncateGraphemeClusters(text, 0), "");
  assertEquals(truncateGraphemeClusters(text, 2), "A😀");
  assertEquals(truncateGraphemeClusters(text, 99), text);
  assertEquals(truncateGraphemeUtf16(text, 2), "A");
  assertEquals(truncateGraphemeUtf16(text, 4), "A😀");
  assertEquals(truncateGraphemeUtf16(text, 99), text);

  const isolated = "\ud83dX\ude00";
  assertEquals(graphemeBoundaries(isolated), [0, 1, 2, 3]);
  assertEquals(segmentGraphemes("😀").map((cluster) => cluster.segment), ["😀"]);
  assertFalse(isGraphemeBoundary("😀", 1));
});

Deno.test("boundary APIs reject invalid offsets, counts, biases, ranges, and non-primitive strings", () => {
  const text = "e\u0301";
  for (const invalid of [-1, text.length + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertThrows(() => isGraphemeBoundary(text, invalid), RangeError);
    assertThrows(() => previousGraphemeBoundary(text, invalid), RangeError);
    assertThrows(() => nextGraphemeBoundary(text, invalid), RangeError);
    assertThrows(() => resolveGraphemeBoundary(text, invalid, "nearest"), RangeError);
  }
  for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertThrows(() => truncateGraphemeClusters(text, invalid), RangeError);
    assertThrows(() => truncateGraphemeUtf16(text, invalid), RangeError);
  }
  assertThrows(
    () => resolveGraphemeBoundary(text, 1, "sideways" as never),
    TypeError,
    "backward",
  );
  assertThrows(() => coveringGraphemeRange(text, 2, 1), RangeError, "must not precede");

  let getterCalls = 0;
  const stringProxy = new Proxy(new String("safe"), {
    get() {
      getterCalls++;
      throw new Error("must not execute");
    },
  });
  assertThrows(() => graphemeBoundaries(stringProxy as unknown as string), TypeError, "primitive string");
  assertEquals(getterCalls, 0);
});

Deno.test("segments, boundaries, ranges, and inspection are immutable and alias-safe", () => {
  const boundaries = graphemeBoundaries("a\u0301b");
  const segments = segmentGraphemes("a\u0301b");
  const range = coveringGraphemeRange("a\u0301b", 1, 2);
  const inspection = DEFAULT_UNICODE_GRAPHEME_SEGMENTER.inspect();
  assert(Object.isFrozen(boundaries));
  assert(Object.isFrozen(segments));
  assert(Object.isFrozen(segments[0]));
  assert(Object.isFrozen(range));
  assert(Object.isFrozen(inspection));
  assertThrows(() => (boundaries as number[]).push(99), TypeError);
  assertThrows(() => (segments as unknown as { start: number }[])[0].start = 99, TypeError);
  assertThrows(() => (range as { start: number }).start = 99, TypeError);

  const first = segmentGraphemes("a\u0301b");
  const second = segmentGraphemes("a\u0301b");
  assertEquals(first, second);
  assertNotStrictEquals(first, second);
  assertNotStrictEquals(first[0], second[0]);
  assertEquals(Array.from(iterateGraphemes("a\u0301b")), first);
});

Deno.test("segmenter snapshots caller packs and rejects accessors, unsupported values, and data versions", () => {
  const raw = structuredClone(BUILTIN_UNICODE_DATA_PACK) as {
    tables: { graphemeBreak: { value: string }[] };
  } & UnicodeDataPack;
  const segmenter = new UnicodeGraphemeSegmenter(raw);
  raw.tables.graphemeBreak[0].value = "Other";
  assertEquals(segmenter.boundaries("\u0000\u0301"), [0, 1, 2]);

  let getterCalls = 0;
  const accessorPack = Object.defineProperty({}, "schema", {
    enumerable: true,
    get() {
      getterCalls++;
      return "deno-tui.unicode-data-pack";
    },
  });
  assertThrows(() => new UnicodeGraphemeSegmenter(accessorPack), UnicodeDataPackValidationError, "accessors");
  assertEquals(getterCalls, 0);

  const unsupported = structuredClone(BUILTIN_UNICODE_DATA_PACK) as {
    fingerprint: string;
    tables: { graphemeBreak: { value: string }[] };
  } & UnicodeDataPack;
  unsupported.tables.graphemeBreak[0].value = "FutureProperty";
  unsupported.fingerprint = fingerprintUnicodeDataPackContent({
    schema: unsupported.schema,
    schemaVersion: unsupported.schemaVersion,
    unicodeVersion: unsupported.unicodeVersion,
    sources: unsupported.sources,
    tables: unsupported.tables,
  });
  assertThrows(() => new UnicodeGraphemeSegmenter(unsupported), UnicodeGraphemeDataError, "unsupported value");

  const wrongVersion = structuredClone(BUILTIN_UNICODE_DATA_PACK) as UnicodeDataPack & {
    fingerprint: string;
    unicodeVersion: string;
  };
  wrongVersion.unicodeVersion = "16.0.0";
  wrongVersion.fingerprint = fingerprintUnicodeDataPackContent({
    schema: wrongVersion.schema,
    schemaVersion: wrongVersion.schemaVersion,
    unicodeVersion: wrongVersion.unicodeVersion,
    sources: wrongVersion.sources,
    tables: wrongVersion.tables,
  });
  assertThrows(() => new UnicodeGraphemeSegmenter(wrongVersion), UnicodeGraphemeDataError, "no matching");
});

Deno.test("segmenter pins algorithm-critical tables but accepts non-segmentation pack variation", () => {
  const missingExtendedPictographic = structuredClone(BUILTIN_UNICODE_DATA_PACK) as {
    fingerprint: string;
    tables: { emoji: { property: string; ranges: { start: number; end: number }[] }[] };
  } & UnicodeDataPack;
  const extendedPictographicIndex = missingExtendedPictographic.tables.emoji.findIndex((entry) =>
    entry.property === "Extended_Pictographic"
  );
  assert(extendedPictographicIndex >= 0);
  missingExtendedPictographic.tables.emoji.splice(extendedPictographicIndex, 1);
  missingExtendedPictographic.fingerprint = fingerprintUnicodeDataPackContent({
    schema: missingExtendedPictographic.schema,
    schemaVersion: missingExtendedPictographic.schemaVersion,
    unicodeVersion: missingExtendedPictographic.unicodeVersion,
    sources: missingExtendedPictographic.sources,
    tables: missingExtendedPictographic.tables,
  });
  assertThrows(
    () => new UnicodeGraphemeSegmenter(missingExtendedPictographic),
    UnicodeGraphemeDataError,
    "Extended_Pictographic",
  );

  const nonSegmentationVariation = structuredClone(BUILTIN_UNICODE_DATA_PACK) as {
    fingerprint: string;
    tables: { eastAsianWidth: { start: number; end: number; value: string }[] };
  } & UnicodeDataPack;
  nonSegmentationVariation.tables.eastAsianWidth[0].value = "Na";
  nonSegmentationVariation.fingerprint = fingerprintUnicodeDataPackContent({
    schema: nonSegmentationVariation.schema,
    schemaVersion: nonSegmentationVariation.schemaVersion,
    unicodeVersion: nonSegmentationVariation.unicodeVersion,
    sources: nonSegmentationVariation.sources,
    tables: nonSegmentationVariation.tables,
  });
  const segmenter = new UnicodeGraphemeSegmenter(nonSegmentationVariation);
  assertEquals(segmenter.segments("👩‍👩").map((cluster) => cluster.segment), ["👩‍👩"]);
});

Deno.test("chunk segmenter rejects overridable or proxied segmenters without executing traps", () => {
  class DroppingSegmenter extends UnicodeGraphemeSegmenter {
    override segments(_text: string): readonly never[] {
      return [];
    }
  }

  assertThrows(
    () => new UnicodeGraphemeChunkSegmenter(new DroppingSegmenter()),
    TypeError,
    "exact, unproxied",
  );

  let getterCalls = 0;
  const proxy = new Proxy(new UnicodeGraphemeSegmenter(), {
    get() {
      getterCalls++;
      throw new Error("must not execute");
    },
  });
  assertThrows(() => new UnicodeGraphemeChunkSegmenter(proxy), TypeError, "exact, unproxied");
  assertEquals(getterCalls, 0);
});

Deno.test("incremental chunk segmentation matches contiguous input at every UTF-16 split", () => {
  const corpus = [
    "",
    "plain ascii",
    "A😀e\u0301Z",
    "\r\n",
    "🇦🇧🇨🇩🇪",
    "👩🏽‍💻 family 👩‍👩‍👧‍👦",
    "क्‍त्‍य",
    "\u0600A",
    "\ud83dX\ude00",
  ];
  for (const text of corpus) {
    const expected = segmentGraphemes(text);
    for (let split = 0; split <= text.length; split++) {
      assertEquals(collectChunks(text, [split]), expected, `${JSON.stringify(text)} split ${split}`);
    }
    assertEquals(
      collectChunks(text, Array.from({ length: text.length }, (_, index) => index + 1)),
      expected,
      `${JSON.stringify(text)} one UTF-16 unit per chunk`,
    );
  }

  const stream = new UnicodeGraphemeChunkSegmenter();
  const pushed = stream.push("ab");
  assert(Object.isFrozen(pushed));
  assert(Object.isFrozen(pushed[0]));
  assertEquals(stream.finish().map((cluster) => cluster.segment), ["b"]);
  assert(stream.finished);
  assertEquals(stream.finish(), []);
  assertThrows(() => stream.push("c"), Error, "finished");
  assertThrows(() => new UnicodeGraphemeChunkSegmenter({} as never), TypeError, "requires");

  const emptyInterruptedSurrogate = new UnicodeGraphemeChunkSegmenter();
  assertEquals(emptyInterruptedSurrogate.push("\ud83d"), []);
  assertEquals(emptyInterruptedSurrogate.push(""), []);
  assertEquals(emptyInterruptedSurrogate.push("\ude00"), []);
  assertEquals(emptyInterruptedSurrogate.finish().map((cluster) => cluster.segment), ["😀"]);
});

Deno.test("long combining, emoji, and RI runs remain deterministic", () => {
  const combining = `a${"\u0301".repeat(20_000)}`;
  assertEquals(DEFAULT_UNICODE_GRAPHEME_SEGMENTER.count(combining), 1);
  assertEquals(graphemeBoundaries(combining), [0, combining.length]);

  const regionalIndicators = "🇦".repeat(2_001);
  assertEquals(DEFAULT_UNICODE_GRAPHEME_SEGMENTER.count(regionalIndicators), 1_001);
  assertEquals(truncateGraphemeClusters(regionalIndicators, 1).length, 4);
});

Deno.test("one-code-unit chunks retain long open clusters without rescanning buffered input", () => {
  const combiningCount = 8_000;
  const stream = new UnicodeGraphemeChunkSegmenter();
  assertEquals(stream.push("a"), []);
  for (let index = 0; index < combiningCount; index++) assertEquals(stream.push("\u0301"), []);
  assertEquals(stream.finish(), [{
    segment: `a${"\u0301".repeat(combiningCount)}`,
    start: 0,
    end: combiningCount + 1,
    index: 0,
  }]);
});
