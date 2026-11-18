// Copyright 2023 Im-Beast. MIT license.
import { assertEquals, assertThrows } from "./deps.ts";
import {
  generatedContentText,
  generatedContentValue,
  generatedStyleMatches,
} from "../src/content/mermaid_generated_content.ts";
import { semanticAXGeneratedTextQuirk } from "./fixtures/mermaid_standard/semantic_ax.ts";

Deno.test("generated content decodes resolved string lists without adding inter-token spaces", () => {
  assertEquals(generatedContentText('"before " "inside" \' after\''), "before inside after");
  assertEquals(generatedContentText('""'), "");
  assertEquals(generatedContentText(String.raw`"a\"b" "\\" "\1f642 "`), 'a"b\\🙂');
  assertEquals(generatedContentText(String.raw`"\a \9 "`), "\n\t");
  assertEquals(generatedContentText('"a\\\r\nb"'), "ab");
  assertEquals(generatedContentText(String.raw`"\0 \d800 \110000 "`), "\ufffd\ufffd\ufffd");
});

Deno.test("generated content never interprets URLs, functions, counters or alternative text as literal strings", () => {
  for (
    const value of [
      "none",
      "normal",
      "open-quote",
      "counter(section)",
      "attr(title)",
      '"shown" / "alt"',
      'url("https://example.test/image.svg")',
      '"prefix" counter(section)',
      '"broken',
      '"bad\nstring"',
      '"one"\u00a0"two"',
    ]
  ) assertEquals(generatedContentText(value), undefined);
  assertEquals(generatedContentText('"<script>alert(1)</script>"'), "<script>alert(1)</script>");
  assertEquals(generatedContentText('"url(https://example.test/)"'), "url(https://example.test/)");
});

Deno.test("generated content refuses source/output budgets and terminal-control escapes", () => {
  assertThrows(() => generatedContentText('"' + "x".repeat(16_384) + '"'), RangeError);
  assertThrows(() => generatedContentText('"' + "x".repeat(4097) + '"'), RangeError);
  assertThrows(() => generatedContentText('"' + "x".repeat(2049) + '" "' + "y".repeat(2048) + '"'), RangeError);
  for (const value of [String.raw`"\1b "`, String.raw`"\7f "`, String.raw`"\85 "`]) {
    assertThrows(() => generatedContentText(value), TypeError);
  }
  assertEquals(generatedContentText('"Recovered"'), "Recovered");
});

Deno.test("generated alternatives retain distinct visual/literal text including empty decoration and escaped slashes", () => {
  assertEquals(generatedContentValue('"shown" / "alternative"'), { text: "shown", alternative: "alternative" });
  assertEquals(generatedContentValue('"decorative" / ""'), { text: "decorative", alternative: "" });
  assertEquals(generatedContentValue('"" / "audible"'), { text: "", alternative: "audible" });
  assertEquals(generatedContentValue('"s" "hown" / "alt" "ernative"'), { text: "shown", alternative: "alternative" });
  assertEquals(generatedContentValue(String.raw`"a/b" / "c\2f d"`), { text: "a/b", alternative: "c/d" });
  assertEquals(generatedContentValue(String.raw`"a\"/b" / "<script>/ inert"`), {
    text: 'a"/b',
    alternative: "<script>/ inert",
  });
  assertEquals(generatedContentValue('"plain"'), { text: "plain" });
  for (
    const value of [
      '"shown" /',
      '/ "alternative"',
      '"shown" / "alt" / "extra"',
      '"shown" / counter(x)',
      'url(x) / "alt"',
    ]
  ) {
    assertEquals(generatedContentValue(value), undefined);
  }
});

Deno.test("generated visual/alternative budgets share output accounting and reject control injection", () => {
  assertThrows(() => generatedContentValue('"' + "x".repeat(2048) + '" / "' + "y".repeat(2049) + '"'), RangeError);
  assertThrows(() => generatedContentValue('"" / "' + "y".repeat(4097) + '"'), RangeError);
  assertThrows(() => generatedContentValue('"' + "x".repeat(16_385) + '" / ""'), RangeError);
  assertThrows(() => generatedContentValue(String.raw`"safe" / "\1b "`), TypeError);
  assertEquals(generatedContentValue('"" / "Recovered"'), { text: "", alternative: "Recovered" });
});

Deno.test("generated fidelity distinguishes used-value CSSOM rounding from real style changes", () => {
  assertEquals(generatedStyleMatches("width", "41.7812px", "41.7656px"), true);
  assertEquals(generatedStyleMatches("transform-origin", "20.8906px 27px", "20.8828px 27px"), true);
  assertEquals(generatedStyleMatches("height", "18px", "18px"), true);
  for (const property of ["font-size", "letter-spacing", "top", "fill", "color", "transform"]) {
    assertEquals(generatedStyleMatches(property, "16px", "16.0156px"), false);
  }
  for (
    const [before, after] of [["41px", "41.02px"], ["41px", "41.03125px"], ["auto", "41px"], ["41%", "41px"], [
      "Infinitypx",
      "42px",
    ]]
  ) {
    assertEquals(generatedStyleMatches("width", before!, after!), false);
  }
  assertEquals(generatedStyleMatches("transform-origin", "20px 27px", "20px 27px 0px"), false);
  assertEquals(generatedStyleMatches("width", "20px 27px", "20.01px 27px"), false);
});

Deno.test("generated MathML AX host quirk checks exact source and correct Unicode companion, never arbitrary differences", () => {
  const tree = (
    name: string,
  ) => [{ role: "MathMLMath", children: [{ role: "MathMLStringLiteral", children: [{ role: "StaticText", name }] }] }];
  assertEquals(
    semanticAXGeneratedTextQuirk(tree("STRASSSINSIDEmixed"), tree("STRASSEINSIDEmixed"), "generated-math-casing"),
    true,
  );
  assertEquals(
    semanticAXGeneratedTextQuirk(tree("STRASSSINSIDEmixed"), tree("STRASSSINSIDEmixed"), "generated-math-casing"),
    false,
  );
  assertEquals(
    semanticAXGeneratedTextQuirk(tree("STRASSSINSIDEmixed"), tree("STRASSEINSIDEmixed"), "other-fixture"),
    false,
  );
  assertEquals(
    semanticAXGeneratedTextQuirk(tree("STRASSSINSIDEmixed "), tree("STRASSEINSIDEmixed"), "generated-math-casing"),
    false,
  );
  assertEquals(
    semanticAXGeneratedTextQuirk([{ role: "StaticText", name: " [inside] " }], [{
      role: "StaticText",
      name: "  [inside]  ",
    }], "generated-html-preserved-space"),
    true,
  );
  assertEquals(
    semanticAXGeneratedTextQuirk([{ role: "StaticText", name: "[inside]" }], [{
      role: "StaticText",
      name: "  [inside]  ",
    }], "generated-html-preserved-space"),
    false,
  );
});
