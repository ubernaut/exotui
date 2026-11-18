// Copyright 2023 Im-Beast. MIT license.
import { generatedQuotePairs, generatedQuoteProfile } from "../../../src/content/mermaid_quotes.ts";
import { MERMAID_AUTO_QUOTE_DATA, MERMAID_CHROMIUM_QUOTE_DATA } from "../../../src/content/mermaid_quotes_data.ts";

/** Original browser-generated punctuation; expected values never read its AX output. */
export function mountMermaidAutoQuoteComparison() {
  const root = document.createElement("div");
  root.id = "exotui-auto-quote-comparison";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Authoritative automatic quotes");
  const locales = [
    ...new Set([
      ...MERMAID_AUTO_QUOTE_DATA.flatMap(([, languages]) => languages.split(" ")),
      ...MERMAID_CHROMIUM_QUOTE_DATA.flatMap(([, languages]) => languages.split(" ")),
      "und",
      "de-CH",
      "zh-TW",
      "zh-CN",
      "zh-HK",
      "sr-ME",
      "fr-XX",
      "no",
      "zz",
      "x-private",
      "en-XA",
      "ar-XB",
      "iw",
      "in",
      "mo",
      "sh",
      "tl",
      "zh-SG",
      "zh-MO",
      "sr-BA",
      "no-NO-NY",
    ]),
  ];
  const cases = locales.map((locale, index) => {
    const row = document.createElement("div");
    row.lang = locale;
    row.style.cssText = "contain:style;quotes:auto";
    row.setAttribute("role", "group");
    const label = `Quote locale ${index}: ${locale}`;
    row.setAttribute("aria-label", label);
    const outer = document.createElement("q"), inner = document.createElement("q"), deep = document.createElement("q");
    deep.textContent = "x";
    inner.append(deep);
    outer.append(inner);
    row.append(outer);
    root.append(row);
    const quotes = generatedQuotePairs("auto", locale, generatedQuoteProfile(navigator.userAgent))!;
    return {
      label,
      locale,
      expected: quotes[0]! + quotes[2]! + quotes[2]! + "x" + quotes[3]! + quotes[3]! + quotes[1]!,
    };
  });
  document.body.append(root);
  return cases;
}

/** Remove only the fixture-owned original browser tree. */
export function disposeMermaidAutoQuoteComparison() {
  document.getElementById("exotui-auto-quote-comparison")?.remove();
}
