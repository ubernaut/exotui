// Copyright 2023 Im-Beast. MIT license.
import {
  formatGeneratedCounter,
  generatedCounterFunctionValue,
  type GeneratedCounterStyle,
  generatedCounterStyle,
} from "../../../src/content/mermaid_counter_styles.ts";
import { generatedQuotedContentValue } from "../../../src/content/mermaid_quotes.ts";
export {
  disposeMermaidCounterContextOracle,
  mermaidCounterContextGuards,
  mountMermaidCounterContextOracle,
} from "./counter_contexts.ts";
export {
  captureMermaidCounterContentOriginal,
  MERMAID_COUNTER_CONTENT_FIXTURES,
  mermaidCounterContentMetadataGuards,
  mountMermaidCounterContentOriginal,
} from "./counter_content.ts";

// The oracle's source declarations are authored separately from the formatter's
// predefined tables and algorithms. It never derives CSS from their output.
const rules = `
@counter-style test-cyclic { system: cyclic; symbols: "A" "BB" "C"; negative: "(" ")"; }
@counter-style test-fixed { system: fixed -2; symbols: "α" "β" "γ" "δ"; fallback: upper-roman; }
@counter-style test-symbolic { system: symbolic; symbols: "AB" "👩‍🔬"; }
@counter-style test-alpha { system: alphabetic; symbols: "a" "b" "c"; }
@counter-style test-numeric { system: numeric; symbols: "Z" "O"; }
@counter-style test-additive { system: additive; additive-symbols: 10 "X", 5 "V", 2 "B", 1 "I", 0 "ZERO"; }
@counter-style test-extends { system: extends test-numeric; pad: 5 "_"; negative: "(" ")"; }
@counter-style test-union { system: extends test-numeric; range: -10 -2, 3 9; fallback: upper-alpha; }
@counter-style test-negative-alpha { system: extends test-alpha; range: infinite infinite; }
@counter-style test-grapheme { system: numeric; symbols: "é" "👩‍🔬"; pad: "xy" 4; negative: "👩‍🔬"; }
@counter-style test-punctuation { system: extends decimal; prefix: "PRE"; suffix: "POST"; }
@counter-style test-no-negative { system: cyclic; symbols: "a" "b"; pad: 3 "0"; negative: "(" ")"; }
@counter-style test-sparse { system: additive; additive-symbols: 3 "a", 2 "b"; fallback: upper-alpha; }
@counter-style test-empty { system: symbolic; symbols: ""; }
@counter-style test-empty-additive { system: additive; additive-symbols: 1 ""; }
@counter-style test-fallback-a { system: fixed; symbols: "A"; fallback: test-fallback-b; }
@counter-style test-fallback-b { system: fixed; symbols: "B"; fallback: test-fallback-a; }
@counter-style test-cycle-a { system: extends test-cycle-b; pad: 3 "A"; }
@counter-style test-cycle-b { system: extends test-cycle-a; negative: "(" ")"; }
@counter-style test-cycle-parent { system: extends test-cycle-a; negative: "[" "]"; }
@counter-style test-unknown { system: extends absent-counter-style; }
@counter-style test-padding-boundary { system: extends decimal; pad: 120 "x"; }
@counter-style test-padding-fallback { system: extends decimal; pad: 121 "x"; fallback: upper-roman; }
@counter-style test-many-additive { system: additive; additive-symbols: 2 "a", 1 "b"; }
@counter-style test-multi-additive { system: additive; additive-symbols: 2 "AAAA", 1 "BBBB"; }
@counter-style test-escaped { system: numeric; symbols: "\\30 " \\31; }
@counter-style test-inert { system: fixed; symbols: "<script>window.counterExecuted=true</script>"; }
@counter-style test-big-symbol { system: numeric; symbols: "${"a".repeat(150)}" "${"b".repeat(150)}"; }
`;
const builtins = [
  "decimal",
  "decimal-leading-zero",
  "arabic-indic",
  "bengali",
  "cambodian",
  "khmer",
  "cjk-decimal",
  "devanagari",
  "gujarati",
  "gurmukhi",
  "kannada",
  "lao",
  "malayalam",
  "mongolian",
  "myanmar",
  "oriya",
  "persian",
  "tamil",
  "telugu",
  "thai",
  "tibetan",
  "lower-alpha",
  "lower-latin",
  "upper-alpha",
  "upper-latin",
  "lower-greek",
  "hiragana",
  "katakana",
  "hiragana-iroha",
  "katakana-iroha",
  "lower-roman",
  "upper-roman",
  "disc",
  "circle",
  "square",
  "disclosure-open",
  "disclosure-closed",
  "cjk-earthly-branch",
  "cjk-heavenly-stem",
  "ethiopic-halehame",
  "ethiopic-halehame-am",
  "ethiopic-halehame-ti-er",
  "ethiopic-halehame-ti-et",
  "hangul",
  "hangul-consonant",
  "urdu",
  "unknown-style",
  "UpPeR-RoMaN",
];
const values = [
  -2_147_483_648,
  -121,
  -10,
  -3,
  -2,
  -1,
  0,
  1,
  2,
  3,
  4,
  5,
  9,
  10,
  12,
  13,
  15,
  24,
  25,
  26,
  27,
  44,
  45,
  46,
  47,
  48,
  49,
  120,
  121,
  239,
  240,
  241,
  3999,
  4000,
  2_147_483_647,
];
let owned: HTMLElement | undefined;

/** Mount original counter() source, then return independent formatter predictions, not browser text. */
export function mountMermaidCounterStyleOracle(): {
  id: string;
  name: string;
  value: number;
  expected?: string;
  refused?: true;
  serializationLoss?: { computedContent: string; prediction?: string };
}[] {
  disposeMermaidCounterStyleOracle();
  const root = document.createElement("div"), style = document.createElement("style");
  root.id = "exotui-counter-style-oracle";
  root.style.contain = "style";
  style.textContent = rules;
  root.append(style);
  document.body.append(root);
  owned = root;
  const custom = new Map<string, GeneratedCounterStyle>();
  for (const rule of style.sheet!.cssRules) {
    if (!("name" in rule) || !("system" in rule)) throw new Error("Original counter-style rule was not parsed.");
    const native = rule as CSSCounterStyleRule;
    const parsed = generatedCounterStyle({
      system: native.system,
      symbols: native.symbols,
      "additive-symbols": native.additiveSymbols,
      negative: native.negative,
      pad: native.pad,
      range: native.range,
      fallback: native.fallback,
      prefix: native.prefix,
      suffix: native.suffix,
    });
    if (!parsed) throw new Error(`Textual original counter-style descriptors were refused: ${native.cssText}`);
    custom.set(native.name, parsed);
  }
  const examples = [...builtins, ...custom.keys()];
  const fixtures: ReturnType<typeof mountMermaidCounterStyleOracle> = [];
  for (const name of examples) {
    for (const value of values) {
      const id = `counter-style-${fixtures.length}`;
      const group = document.createElement("div"), source = document.createElement("span");
      group.setAttribute("role", "document");
      group.setAttribute("aria-label", id);
      source.className = id;
      source.style.counterReset = `probe ${value}`;
      const rule = document.createElement("style");
      rule.textContent = `.${id}::before{content:counter(probe,${name})}`;
      group.append(rule, source);
      root.append(group);
      if (getComputedStyle(source, "::before").content === "none") {
        throw new Error(`Original counter() was refused: ${name}`);
      }
      try {
        const expected = formatGeneratedCounter(value, name, custom, "chromium");
        if (expected === undefined) throw new Error(`Formatter lacks an asserted style: ${name}`);
        fixtures.push({ id, name, value, expected });
      } catch (error) {
        // Preserve genuinely oversized original examples and independently
        // check their text length; do not relabel an ordinary mismatch a quota.
        if (!(error instanceof RangeError) || !error.message.includes("counter text exceeds")) throw error;
        fixtures.push({ id, name, value, refused: true });
      }
    }
  }
  const contentExamples = [
    "counter(probe)",
    "counter(probe,upper-roman)",
    'counters(probe,".",upper-roman)',
    'counters(probe,"")',
    String.raw`counters(probe,"\22 ,\22 ")`,
    'open-quote counters(probe,".") close-quote',
    '"shown" / counter(probe,upper-roman)',
    'counter(probe) / counters(probe,".",upper-roman)',
    'counter(probe) / ""',
    '"" / counters(probe,".")',
    "counter(absent-probe)",
    'counters(absent-probe,".")',
  ];
  for (const [index, content] of contentExamples.entries()) {
    const id = `counter-content-${index}`, group = document.createElement("div");
    group.setAttribute("role", "document");
    group.setAttribute("aria-label", id);
    const outer = document.createElement("div"),
      inner = document.createElement("div"),
      source = document.createElement("span");
    source.className = id;
    outer.style.counterReset = "probe 2";
    inner.style.counterReset = "probe 4";
    source.style.counterReset = "probe 9";
    const rule = document.createElement("style");
    rule.textContent = `.${id}::before{quotes:"[" "]";content:${content}}`;
    inner.append(source);
    outer.append(inner);
    group.append(rule, outer);
    root.append(group);
    const css = getComputedStyle(source, "::before");
    if (css.content === "none") throw new Error(`Original counter content was refused: ${content}`);
    const resolver = (name: string, args: string) =>
      generatedCounterFunctionValue(
        name,
        args,
        (counterName) => counterName === "probe" ? [2, 4, 9] : undefined,
        custom,
        "chromium",
      );
    const output = generatedQuotedContentValue(
      content,
      css.quotes,
      "en",
      { depth: 0 },
      "chromium-common",
      resolver,
    );
    if (!output) throw new Error(`Formatter lacks asserted counter content: ${content}`);
    const expected = output.alternative ?? output.text;
    const computed = generatedQuotedContentValue(
      css.content,
      css.quotes,
      "en",
      { depth: 0 },
      "chromium-common",
      resolver,
    );
    const prediction = computed?.alternative ?? computed?.text;
    // Chromium serializes counters(probe, "") as counter(probe). Preserve
    // this independent failure: later DOM capture needs original plural data,
    // not a falsely certified computed-only resolver.
    if (prediction !== expected) {
      if (
        content !== 'counters(probe,"")' || css.content !== "counter(probe)" || prediction !== "9" || expected !== "249"
      ) {
        throw new Error(
          `New counter serialization discrepancy: ${
            JSON.stringify({ content, computed: css.content, prediction, expected })
          }`,
        );
      }
      fixtures.push({
        id,
        name: content,
        value: 9,
        expected,
        serializationLoss: { computedContent: css.content, prediction },
      });
    } else fixtures.push({ id, name: content, value: 9, expected });
  }
  if ("counterExecuted" in globalThis) throw new Error("Counter symbols must remain inert text.");
  return fixtures;
}

/** Dispose only the independent oracle's owned markup. */
export function disposeMermaidCounterStyleOracle(): void {
  owned?.remove();
  owned = undefined;
}
