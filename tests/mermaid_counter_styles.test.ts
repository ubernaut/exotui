// Copyright 2023 Im-Beast. MIT license.
import { assertEquals, assertThrows } from "./deps.ts";
import {
  formatGeneratedCounter,
  generatedCounterFunctionValue,
  type GeneratedCounterStyle,
  generatedCounterStyle,
} from "../src/content/mermaid_counter_styles.ts";
import { generatedCounterRequests, generatedQuotedContentValue } from "../src/content/mermaid_quotes.ts";

function styles(...entries: (readonly [string, Record<string, string>])[]): Map<string, GeneratedCounterStyle> {
  return new Map(entries.map(([name, descriptors]) => {
    const style = generatedCounterStyle(descriptors);
    if (!style) throw new Error(`Invalid test style: ${name}`);
    return [name, style];
  }));
}

Deno.test("counter styles preserve decimal, alphabetic carries, Roman ranges and worldwide numeric digits", () => {
  assertEquals(formatGeneratedCounter(-7, "decimal-leading-zero"), "-7");
  assertEquals(formatGeneratedCounter(7, "decimal-leading-zero"), "07");
  assertEquals(formatGeneratedCounter(0, "decimal-leading-zero"), "00");
  assertEquals(formatGeneratedCounter(27, "lower-alpha"), "aa");
  assertEquals(formatGeneratedCounter(702, "upper-alpha"), "ZZ");
  assertEquals(formatGeneratedCounter(703, "upper-alpha"), "AAA");
  assertEquals(formatGeneratedCounter(-1, "upper-alpha"), "-1");
  assertEquals(formatGeneratedCounter(944, "upper-roman"), "CMXLIV");
  assertEquals(formatGeneratedCounter(4000, "lower-roman"), "4000");
  assertEquals(formatGeneratedCounter(24, "lower-greek"), "ω");
  assertEquals(formatGeneratedCounter(25, "lower-greek"), "αα");
  assertEquals(formatGeneratedCounter(45, "hiragana"), "ゐ");
  assertEquals(formatGeneratedCounter(49, "katakana"), "アア");
  assertEquals(formatGeneratedCounter(48, "hiragana-iroha"), "いい");
  assertEquals(formatGeneratedCounter(2048, "arabic-indic"), "٢٠٤٨");
  assertEquals(formatGeneratedCounter(-102, "persian"), "-۱۰۲");
  assertEquals(formatGeneratedCounter(10, "cjk-decimal"), "一〇");
  assertEquals(formatGeneratedCounter(-10, "cjk-decimal"), "-10");
  assertEquals(formatGeneratedCounter(12, "cjk-earthly-branch"), "亥");
  assertEquals(formatGeneratedCounter(13, "cjk-earthly-branch"), "13");
  assertEquals(formatGeneratedCounter(13, "cjk-earthly-branch", new Map(), "chromium"), "一三");
  assertEquals(formatGeneratedCounter(1, "square"), "▪");
  assertEquals(formatGeneratedCounter(1, "square", new Map(), "chromium"), "■");
  assertEquals(formatGeneratedCounter(20, "unregistered-style"), "20");
  assertEquals(formatGeneratedCounter(20, "hebrew"), undefined, "known missing algorithms must not fabricate decimal");
});

Deno.test("all seven generic counter systems have distinct independently specified algorithms", () => {
  const map = styles(
    ["cyclic", { system: "cyclic", symbols: '"a" "b" "c"', negative: '"(" ")"' }],
    ["fixed", { system: "fixed -1", symbols: '"a" "b" "c"' }],
    ["symbolic", { system: "symbolic", symbols: '"a" "b"' }],
    ["alphabetic", { system: "alphabetic", symbols: '"a" "b"' }],
    ["numeric", { system: "numeric", symbols: '"a" "b"' }],
    ["additive", { system: "additive", "additive-symbols": '5 "V", 2 "B", 1 "A", 0 "Z"' }],
    ["extend", { system: "extends numeric", pad: '4 "_"' }],
  );
  assertEquals([-2, -1, 0, 1, 2, 3, 4].map((n) => formatGeneratedCounter(n, "cyclic", map)), [
    "a",
    "b",
    "c",
    "a",
    "b",
    "c",
    "a",
  ]);
  assertEquals([-2, -1, 0, 1, 2].map((n) => formatGeneratedCounter(n, "fixed", map)), ["-2", "a", "b", "c", "2"]);
  assertEquals(formatGeneratedCounter(7, "symbolic", map), "aaaa");
  assertEquals(formatGeneratedCounter(7, "alphabetic", map), "aaa");
  assertEquals(formatGeneratedCounter(7, "numeric", map), "bbb");
  assertEquals(formatGeneratedCounter(0, "additive", map), "Z");
  assertEquals(formatGeneratedCounter(9, "additive", map), "VBB");
  assertEquals(formatGeneratedCounter(7, "extend", map), "_bbb");
});

Deno.test("Chromium legacy UA counter names retain their alphabets instead of falling through to unknown-name decimal", () => {
  const format = (value: number, name: string) => formatGeneratedCounter(value, name, new Map(), "chromium");
  assertEquals(format(26, "ethiopic-halehame"), "ፐ");
  assertEquals(format(27, "ethiopic-halehame"), "ሀሀ");
  assertEquals(format(33, "ethiopic-halehame-am"), "ፐ");
  assertEquals(format(31, "ethiopic-halehame-ti-er"), "ፐ");
  assertEquals(format(34, "ethiopic-halehame-ti-et"), "ፐ");
  assertEquals(format(15, "hangul"), "가가");
  assertEquals(format(15, "hangul-consonant"), "ㄱㄱ");
  assertEquals(format(-102, "urdu"), "-۱۰۲");
  assertEquals(formatGeneratedCounter(15, "hangul"), "15", "nonstandard names stay host-profile specific");
});

Deno.test("padding counts graphemes and negative signs, and does not add marker prefixes or suffixes", () => {
  const map = styles(
    ["accounting", { system: "extends decimal", negative: '"(" ")"', pad: '5 "0"', prefix: '"PRE"', suffix: '"POST"' }],
    ["grapheme", { system: "numeric", symbols: '"é" "👩‍🔬"', negative: '"👩‍🔬"', pad: '4 "xy"' }],
    ["negative-alpha", { system: "alphabetic", symbols: '"a" "b"', range: "infinite infinite" }],
  );
  assertEquals(formatGeneratedCounter(-3, "accounting", map), "(003)");
  assertEquals(formatGeneratedCounter(3, "accounting", map), "00003");
  assertEquals(formatGeneratedCounter(1, "grapheme", map), "xyxyxy👩‍🔬");
  assertEquals(formatGeneratedCounter(-1, "grapheme", map), "👩‍🔬xyxy👩‍🔬");
  assertEquals(formatGeneratedCounter(-3, "negative-alpha", map), "-aa");
});

Deno.test("range unions, greedy additive failure and fallback cycles preserve CSS behavior", () => {
  const map = styles(
    ["limited", { system: "numeric", symbols: '"0" "1"', range: "-3 -1, 2 4", fallback: "upper-roman" }],
    ["gaps", { system: "additive", "additive-symbols": '3 "a", 2 "b"', fallback: "upper-alpha" }],
    ["first", { system: "fixed", symbols: '"X"', fallback: "second" }],
    ["second", { system: "fixed", symbols: '"Y"', fallback: "first" }],
  );
  assertEquals(formatGeneratedCounter(-3, "limited", map), "-11");
  assertEquals(formatGeneratedCounter(4, "limited", map), "100");
  assertEquals(formatGeneratedCounter(5, "limited", map), "V");
  assertEquals(formatGeneratedCounter(4, "gaps", map), "D", "additive is greedy, not a change-making solver");
  assertEquals(formatGeneratedCounter(3, "first", map), "3");
  assertEquals(formatGeneratedCounter(-2_147_483_648, "decimal", map), "-2147483648");
});

Deno.test("extends inherits descriptors but auto range and cycles reset the correct parts", () => {
  const map = styles(
    ["base", { system: "numeric", symbols: '"0" "1"', negative: '"(" ")"', range: "1 9", pad: '4 "_"' }],
    ["child", { system: "extends base", range: "auto" }],
    ["a", { system: "extends b", pad: '3 "A"' }],
    ["b", { system: "extends a", negative: '"(" ")"' }],
    ["outside", { system: "extends a", negative: '"[" "]"' }],
    ["unknown", { system: "extends nonexistent" }],
    ["complex", { system: "extends hebrew" }],
  );
  assertEquals(formatGeneratedCounter(-2, "child", map), "(10)");
  assertEquals(formatGeneratedCounter(-1, "a", map), "-A1");
  assertEquals(formatGeneratedCounter(-1, "b", map), "(1)", "a cycle member must not inherit another's pad");
  assertEquals(formatGeneratedCounter(-1, "outside", map), "[1]");
  assertEquals(formatGeneratedCounter(9, "unknown", map), "9");
  assertEquals(formatGeneratedCounter(9, "complex", map), undefined);
});

Deno.test("computed counter descriptor parsing handles escaped strings, identifiers and either-order descriptor pairs", () => {
  const map = styles(
    ["escapes", { system: "numeric", symbols: String.raw`"\30 " \31`, pad: '"_" 3' }],
    ["additive", { system: "additive", "additive-symbols": '"V" 5, "I" 1' }],
    ["inert", { system: "fixed", symbols: '"<script>alert(1)</script>"' }],
  );
  assertEquals(formatGeneratedCounter(3, "escapes", map), "_11");
  assertEquals(formatGeneratedCounter(7, "additive", map), "VII");
  assertEquals(formatGeneratedCounter(1, "inert", map), "<script>alert(1)</script>");
  assertEquals(generatedCounterStyle({ system: "extends decimal", symbols: '"X"' }), undefined);
  assertEquals(generatedCounterStyle({ system: "numeric", symbols: '"X"' }), undefined);
  assertEquals(
    generatedCounterStyle({ system: "fixed", symbols: 'url("https://counter-probe.invalid/x")' }),
    undefined,
  );
  assertEquals(generatedCounterStyle({ system: "additive", "additive-symbols": '1 "a", 2 "b"' }), undefined);
  assertEquals(generatedCounterStyle({ system: "fixed", symbols: '"X"', range: "3 1" }), undefined);
});

Deno.test("counter expansion, style chains and source work remain bounded with recovery", () => {
  const map = styles(["explosion", { system: "symbolic", symbols: '"X"' }]);
  assertThrows(() => formatGeneratedCounter(4097, "explosion", map), RangeError);
  assertEquals(formatGeneratedCounter(121, "explosion", map, "chromium"), "121");
  assertEquals(formatGeneratedCounter(120, "explosion", map, "chromium"), "X".repeat(120));
  const double = styles(["double", { system: "symbolic", symbols: '"XY"' }]);
  assertEquals(formatGeneratedCounter(120, "double", double, "chromium"), "XY".repeat(120));
  assertThrows(() => formatGeneratedCounter(Infinity), RangeError);
  assertThrows(() => formatGeneratedCounter(2_147_483_648), RangeError);
  assertThrows(() => generatedCounterStyle({ system: "fixed", symbols: '"' + "a".repeat(16_385) + '"' }), RangeError);
  assertThrows(() => generatedCounterStyle({ system: "fixed", symbols: '"a" '.repeat(257) }), RangeError);
  assertThrows(() => generatedCounterStyle({ system: "fixed", symbols: String.raw`"\1b "` }), TypeError);
  for (let index = 0; index < 130; index++) {
    map.set(`chain${index}`, { system: "extends", extends: `chain${index + 1}` });
  }
  assertThrows(() => formatGeneratedCounter(1, "chain0", map), RangeError);
  assertEquals(formatGeneratedCounter(2, "explosion", map), "XX", "a failed format must not poison later calls");
});

Deno.test("counter and counters functions preserve nesting, CSS separators and resolved accessible alternatives", () => {
  const values = (name: string) => name === "chapter" ? [2, 4, 9] : undefined;
  const resolver = (name: string, args: string) => generatedCounterFunctionValue(name, args, values);
  assertEquals(resolver("counter", "chapter, upper-roman"), "IX");
  assertEquals(resolver("counters", 'chapter, ".", upper-roman'), "II.IV.IX");
  assertEquals(resolver("counters", 'chapter, ""'), "249");
  assertEquals(resolver("counters", String.raw`chapter, "\22 ,\22 "`), '2","4","9');
  assertEquals(resolver("counter", "missing"), "0");
  assertEquals(resolver("counters", 'chapter,/*ignore ( )*/""'), "249");
  assertEquals(resolver("counters", 'missing, "."'), "0");
  assertEquals(resolver("counter", String.raw`\63 hapter`), "9");
  assertEquals(resolver("counter", "chapter, symbols(numeric '0' '1')"), undefined);
  assertEquals(resolver("counter", '"chapter"'), undefined);
  assertEquals(resolver("counter", "none"), undefined);
  assertEquals(resolver("counter", "chapter, none"), undefined);
  assertEquals(resolver("counters", 'chapter, "." ","'), undefined);
  assertEquals(resolver("counter", "chapter, heBREW"), undefined);
  assertEquals(generatedCounterRequests('"counter(a)" url("counters(b)") counter(chapter) / counters(chapter,".")'), [
    { name: "counter", arguments: "chapter" },
    { name: "counters", arguments: 'chapter,"."' },
  ]);
  assertEquals(generatedCounterRequests(String.raw`\63 OUNTERS(chapter,/* ) inert */"")`), [
    { name: "counters", arguments: 'chapter,/* ) inert */""' },
  ]);
  assertEquals(
    generatedQuotedContentValue(
      'open-quote counter(chapter,upper-roman) close-quote / counters(chapter,".")',
      '"[" "]"',
      "en",
      { depth: 0 },
      "cldr",
      resolver,
    ),
    { text: "[IX]", alternative: "2.4.9" },
  );
  assertThrows(() => generatedCounterFunctionValue("counters", 'chapter,"."', () => Array(129).fill(1)), RangeError);
  assertThrows(
    () => generatedCounterFunctionValue("counters", 'chapter,"' + "x".repeat(3000) + '"', () => [1, 2, 3]),
    RangeError,
  );
});

Deno.test("known unsupported authored counter styles and inherited definitions never fabricate decimal", () => {
  const map = new Map<string, GeneratedCounterStyle>([
    ["decimal", { system: "symbolic", unsupported: true }],
    ["derived", { system: "extends", extends: "decimal" }],
  ]);
  assertEquals(formatGeneratedCounter(5, "decimal", map), undefined);
  assertEquals(formatGeneratedCounter(5, "derived", map), undefined);
  assertEquals(formatGeneratedCounter(5, "unknown", new Map()), "5");
});
