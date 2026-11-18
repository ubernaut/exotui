// Copyright 2023 Im-Beast. MIT license.
import { assertEquals, assertThrows } from "./deps.ts";
import {
  generatedQuoteChanges,
  generatedQuotedContentValue,
  generatedQuotePairs,
  generatedQuoteProfile,
} from "../src/content/mermaid_quotes.ts";
import { MERMAID_AUTO_QUOTE_DATA, MERMAID_CHROMIUM_QUOTE_DATA } from "../src/content/mermaid_quotes_data.ts";

Deno.test("host quotation changes ignore unrelated strings, functions, controls and slash alternatives", () => {
  assertEquals(generatedQuoteChanges('no-open-quote counter(x) close-quote / "open-quote"'), [1, -1]);
  assertEquals(generatedQuoteChanges('"open-quote" url("close-quote") no-close-quote open-quote'), [-1, 1]);
  assertEquals(generatedQuoteChanges('"' + "x".repeat(5000) + '" no-open-quote'), [1]);
  assertEquals(generatedQuoteChanges(String.raw`"\1b open-quote" no-open-quote`), [1]);
  assertEquals(generatedQuoteChanges('"literal" / open-quote'), []);
  assertThrows(() => generatedQuoteChanges("x".repeat(16_385)), RangeError);
  assertThrows(() => generatedQuoteChanges("no-open-quote ".repeat(257)), RangeError);
});

Deno.test("quotation expansion preserves literal/alternative strings and escaped keyword-looking text", () => {
  const state = { depth: 0 };
  assertEquals(generatedQuotedContentValue('"open-quote" / "literal alternative"', "auto", "en", state), {
    text: "open-quote",
    alternative: "literal alternative",
  });
  assertEquals(generatedQuotedContentValue(String.raw`"\22 x\22 "`, "auto", "en", state), { text: '"x"' });
  assertEquals(state.depth, 0);
  assertEquals(generatedQuotedContentValue('open-quote "shown" close-quote / "audible"', "auto", "en", state), {
    text: "“shown”",
    alternative: "audible",
  });
});

Deno.test("quote depth follows generated order and repeats the innermost explicit pair", () => {
  const state = { depth: 0 }, quotes = '"[" "]" "<" ">"';
  const value = (content: string) => generatedQuotedContentValue(content, quotes, "und", state)?.text;
  assertEquals(value("close-quote"), "");
  assertEquals(value("open-quote"), "[");
  assertEquals(value("open-quote open-quote"), "<<");
  assertEquals(value("close-quote close-quote close-quote close-quote"), ">>]");
  assertEquals(state.depth, 0);
  assertEquals(value("open-quote"), "[");
});

Deno.test("none and phantom keywords still alter depth without producing ink", () => {
  const state = { depth: 0 }, quotes = '"[" "]" "<" ">"';
  assertEquals(generatedQuotedContentValue("open-quote", "none", "en", state), { text: "" });
  assertEquals(state.depth, 1);
  assertEquals(generatedQuotedContentValue("open-quote", quotes, "en", state), { text: "<" });
  assertEquals(generatedQuotedContentValue("no-close-quote close-quote", quotes, "en", state), { text: "]" });
  assertEquals(generatedQuotedContentValue("no-close-quote", quotes, "en", state), { text: "" });
  assertEquals(state.depth, 0);
  assertEquals(generatedQuotedContentValue("no-open-quote open-quote", quotes, "en", state), { text: "<" });
});

Deno.test("unknown functions remain unsupported but do not hide real subsequent quote-depth changes", () => {
  const state = { depth: 0 };
  assertEquals(generatedQuotedContentValue('url("open-quote") open-quote', "auto", "en", state), undefined);
  assertEquals(state.depth, 1);
  assertEquals(generatedQuotedContentValue("counter(x) close-quote", "auto", "en", state), undefined);
  assertEquals(state.depth, 0);
  assertEquals(generatedQuotedContentValue('"shown" / counter(x)', "auto", "en", state), undefined);
  assertEquals(generatedQuotedContentValue('open-quote / ""', "auto", "en", state), { text: "“", alternative: "" });
});

Deno.test("auto quote data covers every pinned locale and script/region/default fallbacks", () => {
  let count = 0;
  const seen = new Set<string>();
  for (const [quotes, locales] of MERMAID_AUTO_QUOTE_DATA) {
    for (const locale of locales.split(" ")) {
      assertEquals(seen.has(locale), false, "duplicate locale record");
      seen.add(locale);
      assertEquals(generatedQuotePairs("auto", locale), [...quotes]);
      count++;
    }
  }
  assertEquals(count, 766);
  assertEquals(generatedQuotePairs("auto", "de-CH"), ["„", "“", "‚", "‘"]);
  assertEquals(generatedQuotePairs("auto", "zh-TW"), ["「", "」", "『", "』"]);
  assertEquals(generatedQuotePairs("auto", "fr-XX"), ["«", "»", "«", "»"]);
  assertEquals(generatedQuotePairs("auto", "invalid_!"), ["“", "”", "‘", "’"]);
});

Deno.test("quote strings preserve multi-character/empty markers, CSS escapes and inert content", () => {
  assertEquals(generatedQuotePairs('"" "END"', "en"), ["", "END"]);
  assertEquals(generatedQuotePairs(String.raw`"\ab " "\bb "`, "en"), ["«", "»"]);
  assertEquals(generatedQuotePairs('"<script>" "</script>"', "en"), ["<script>", "</script>"]);
  assertEquals(generatedQuotePairs('"unpaired"', "en"), undefined);
  assertEquals(generatedQuotePairs("match-parent", "en"), undefined);
  assertEquals(generatedQuotePairs("none", "en"), []);
});

Deno.test("Chromium quotes retain filtered parents, rejected aliases and original ICU delimiters", () => {
  const profile = "chromium-common", basic = ["“", "”", "‘", "’"];
  const seen = new Set<string>();
  for (const [quotes, locales] of MERMAID_CHROMIUM_QUOTE_DATA) {
    for (const locale of locales.split(" ")) {
      assertEquals(seen.has(locale), false, "duplicate ICU record");
      seen.add(locale);
      assertEquals(generatedQuotePairs("auto", locale, profile), [...quotes]);
    }
  }
  assertEquals(seen.size, 621);
  for (const locale of ["ht", "kk", "kk-Cyrl", "oc-ES", "uz", "bs", "zh-TW", "zh-HK", "zz", "en-XA"]) {
    assertEquals(generatedQuotePairs("auto", locale, profile), basic, locale);
  }
  assertEquals(generatedQuotePairs("auto", "ti-ER", profile), ["‘", "’", "‘", "’"]);
  assertEquals(generatedQuotePairs("auto", "ar-XB", profile), ["”", "“", "’", "‘"]);
  assertEquals(generatedQuotePairs("auto", "el-polyton", profile), ["«", "»", "“", "”"]);
  assertEquals(generatedQuotePairs("auto", "zh-Hant-TW", profile), ["「", "」", "『", "』"]);
  assertEquals(generatedQuotePairs("auto", "de-CH", profile), ["„", "“", "‚", "‘"]);
  assertEquals(generatedQuotePairs("auto", "invalid_!", profile), basic);
  assertEquals(generatedQuotedContentValue("open-quote", "auto", "ht", { depth: 0 }, profile), { text: "“" });
  assertEquals(generatedQuotedContentValue("open-quote", '"[" "]"', "ht", { depth: 0 }, profile), { text: "[" });
});

Deno.test("automatic profile comes from the host, never source language or CSS", () => {
  assertEquals(generatedQuoteProfile("Mozilla/5.0 HeadlessChrome/154.0.0.0 Safari/537.36"), "chromium-common");
  assertEquals(generatedQuoteProfile("Mozilla/5.0 Chrome/154.0.0.0 Edg/154.0.0.0"), "chromium-common");
  assertEquals(generatedQuoteProfile("Chromium/154"), "chromium-common");
  assertEquals(generatedQuoteProfile("Deno/2.6"), "cldr");
  assertEquals(generatedQuoteProfile("Firefox/149.0"), "cldr");
  assertEquals(generatedQuoteProfile(""), "cldr");
});

Deno.test("quotation/source/token/style/text/locale budgets and control rejection remain bounded", () => {
  const value = (content: string, quotes = "auto", depth = 0) =>
    generatedQuotedContentValue(content, quotes, "en", { depth });
  assertThrows(() => value("open-quote", "auto", 16_384), RangeError);
  assertThrows(() => value("open-quote", "auto", -1), RangeError);
  assertThrows(() => value("open-quote", "auto", Infinity), RangeError);
  assertThrows(() => value('"x" '.repeat(257)), RangeError);
  assertThrows(() => value("x".repeat(16_385)), RangeError);
  assertThrows(
    () => value("open-quote close-quote", '"' + "x".repeat(2048) + '" "' + "y".repeat(2049) + '"'),
    RangeError,
  );
  assertThrows(() => value(String.raw`"\1b "`), TypeError);
  assertThrows(() => value("open-quote", String.raw`"\7f " "safe"`), TypeError);
  assertThrows(() => generatedQuotePairs("auto", "x".repeat(129)), RangeError);
  assertEquals(value('"Recovered"'), { text: "Recovered" });
});
