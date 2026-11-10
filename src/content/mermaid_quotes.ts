// Copyright 2023 Im-Beast. MIT license.
import { generatedContentText } from "./mermaid_generated_content.ts";
import { MERMAID_AUTO_QUOTE_DATA, MERMAID_CHROMIUM_QUOTE_DATA } from "./mermaid_quotes_data.ts";

type Part = { text: string } | { keyword: string } | { function: string; arguments: string } | { unsupported: true } | {
  slash: true;
};
const languages = new Map<string, readonly string[]>();
for (const [quotes, locales] of MERMAID_AUTO_QUOTE_DATA) {
  for (const locale of locales.split(" ")) languages.set(locale, [...quotes]);
}
const basic = ["“", "”", "‘", "’"] as const;
const chromiumLanguages = new Map<string, readonly string[]>();
for (const [quotes, locales] of MERMAID_CHROMIUM_QUOTE_DATA) {
  for (const locale of locales.split(" ")) chromiumLanguages.set(locale, [...quotes]);
}

/** Internal capture profile; source CSS cannot choose or alter host locale data. */
export type GeneratedQuoteProfile = "cldr" | "chromium-common";

/** Chromium uses filtered ICU resources and exact-then-truncated, not Intl locale matching. */
export function generatedQuoteProfile(userAgent: string): GeneratedQuoteProfile {
  return /(?:Chrome|Chromium)\/\d/.test(userAgent) ? "chromium-common" : "cldr";
}

/** Decode computed CSS tokens without executing CSS/functions or counting keywords inside strings/functions. */
function parts(content: string, decodeStrings = true): Part[] {
  if (content.length > 16_384) throw new RangeError("Mermaid generated content exceeds its source budget.");
  const result: Part[] = [];
  let at = 0;
  const commentEnd = () => {
    const end = content.indexOf("*/", at + 2);
    if (end < 0) throw new TypeError("Malformed generated content comment");
    at = end + 2;
  };
  const escapeEnd = () => {
    at++;
    let hex = 0;
    while (hex < 6 && /[\da-f]/i.test(content[at] ?? "")) {
      hex++;
      at++;
    }
    if (hex && /[\t\n\r\f ]/.test(content[at] ?? "")) {
      if (content[at] === "\r" && content[at + 1] === "\n") at++;
      at++;
    } else if (!hex) at++;
  };
  const stringEnd = () => {
    const quote = content[at++]!;
    while (at < content.length) {
      const char = content[at++]!;
      if (char === "\\") at++;
      else if (char === quote) return;
    }
    throw new TypeError("Malformed computed generated string");
  };
  while (at < content.length) {
    if (content.startsWith("/*", at)) {
      commentEnd();
      continue;
    }
    if (/[\t\n\r\f ]/.test(content[at]!)) {
      at++;
      continue;
    }
    if (result.length >= 256) throw new RangeError("Mermaid generated content exceeds its token budget.");
    const start = at, char = content[at]!;
    if (char === '"' || char === "'") {
      stringEnd();
      // Host context needs only quotation keywords. Do not decode/transport
      // unrelated page text, whose controls/length need not fit label limits.
      const text = decodeStrings ? generatedContentText(content.slice(start, at)) : "";
      if (text === undefined) throw new TypeError("Malformed computed generated string");
      result.push({ text });
    } else if (char === "/") {
      at++;
      result.push({ slash: true });
    } else {
      while (at < content.length) {
        if (/[-_a-zA-Z0-9\u0080-\uffff]/.test(content[at]!)) at++;
        else if (content[at] === "\\") escapeEnd();
        else break;
      }
      const keyword = (generatedContentText(`"${content.slice(start, at)}"`) ?? "").toLowerCase();
      if (content[at] === "(") {
        const argumentsStart = at + 1;
        let depth = 0;
        do {
          const char = content[at]!;
          if (char === '"' || char === "'") stringEnd();
          else if (content.startsWith("/*", at)) commentEnd();
          else if (char === "\\") escapeEnd();
          else {
            at++;
            if (char === "(") depth++;
            if (char === ")") depth--;
          }
          if (depth > 64) throw new RangeError("Mermaid generated function depth exceeds its budget.");
        } while (at < content.length && depth);
        if (depth) throw new TypeError("Malformed computed generated function");
        result.push({ function: keyword, arguments: content.slice(argumentsStart, at - 1) });
      } else if (keyword) result.push({ keyword });
      else {
        at++;
        result.push({ unsupported: true });
      }
    }
  }
  return result;
}

/** Quote-depth changes only; strings, function arguments and accessibility alternatives are inert. */
export function generatedQuoteChanges(content: string): readonly (1 | -1)[] {
  const changes: (1 | -1)[] = [];
  for (const part of parts(content, false)) {
    if ("slash" in part) break;
    if ("keyword" in part && /^(?:no-)?(?:open|close)-quote$/.test(part.keyword)) {
      changes.push(part.keyword.endsWith("open-quote") ? 1 : -1);
    }
  }
  return changes;
}

/** Identify real computed counter functions, never keyword-looking strings or nested URL arguments. */
export function generatedCounterRequests(content: string): readonly { name: string; arguments: string }[] {
  return parts(content, false).flatMap((part) =>
    "function" in part && ["counter", "counters"].includes(part.function)
      ? [{ name: part.function, arguments: part.arguments }]
      : []
  );
}

/** Resolve explicit/none/locale-auto quote systems with pinned delimiter-only CLDR data. */
export function generatedQuotePairs(
  quotes: string,
  locale: string,
  profile: GeneratedQuoteProfile = "cldr",
): readonly string[] | undefined {
  if (quotes === "none") return [];
  if (quotes === "auto") {
    if (locale.length > 128) throw new RangeError("Mermaid generated quote locale exceeds its budget.");
    const tag = locale.toLowerCase().replaceAll("_", "-");
    if (profile === "chromium-common") {
      for (let candidate = tag; candidate; candidate = candidate.replace(/-?[^-]+$/, "")) {
        const value = chromiumLanguages.get(candidate);
        if (value) return value;
      }
      return basic;
    }
    // CLDR JSON names default-content locales by script, while ICU can expose
    // region aliases (zh-TW -> zh-Hant). Prefer exact records before maximizing.
    for (let candidate = tag; candidate; candidate = candidate.replace(/-?[^-]+$/, "")) {
      const exact = languages.get(candidate);
      if (exact) return exact;
      try {
        let maximized = new Intl.Locale(candidate).maximize().toString().toLowerCase();
        while (maximized) {
          const values = languages.get(maximized);
          if (values) return values;
          maximized = maximized.replace(/-?[^-]+$/, "");
        }
      } catch {
        // Empty/invalid/unknown language falls back to the host's basic set.
      }
    }
    return basic;
  }
  const values = parts(quotes);
  if (!values.length || values.length % 2 || values.some((part) => !("text" in part))) return;
  const strings = values.map((part) => (part as { text: string }).text);
  if (strings.length > 128 || strings.join("").length > 4096) {
    throw new RangeError("Mermaid generated quote system exceeds its budget.");
  }
  return strings;
}

/** Expand quotation keywords in source order; even unsupported content retains quote-depth effects. */
export function generatedQuotedContentValue(
  content: string,
  quotes: string,
  locale: string,
  state: { depth: number },
  profile: GeneratedQuoteProfile = "cldr",
  counter?: (name: string, argumentsText: string) => string | undefined,
): { text: string; alternative?: string } | undefined {
  if (!Number.isSafeInteger(state.depth) || state.depth < 0 || state.depth > 16_384) {
    throw new RangeError("Mermaid quotation depth exceeds its budget.");
  }
  const tokens = parts(content), strings = generatedQuotePairs(quotes, locale, profile);
  let text = "", alternative: string | undefined, unsupported = false, visual = false;
  for (const part of tokens) {
    if ("slash" in part) {
      if (alternative !== undefined || !visual) unsupported = true;
      alternative = "";
      continue;
    }
    if ("text" in part) {
      if (alternative !== undefined) alternative += part.text;
      else {
        text += part.text;
        visual = true;
      }
    } else if ("keyword" in part && /^(?:no-)?(?:open|close)-quote$/.test(part.keyword) && alternative === undefined) {
      const opening = part.keyword.endsWith("open-quote"), silent = part.keyword.startsWith("no-");
      const depth = opening ? state.depth++ : state.depth > 0 ? --state.depth : -1;
      visual = true;
      if (state.depth > 16_384) throw new RangeError("Mermaid quotation depth exceeds its budget.");
      if (strings === undefined) unsupported = true;
      else if (!silent && depth >= 0 && strings.length) {
        text += strings[Math.min(depth, strings.length / 2 - 1) * 2 + (opening ? 0 : 1)]!;
      }
    } else if ("function" in part && ["counter", "counters"].includes(part.function) && counter) {
      const value = counter(part.function, part.arguments);
      if (value === undefined) unsupported = true;
      else if (alternative !== undefined) alternative += value;
      else {
        text += value;
        visual = true;
      }
    } else unsupported = true;
    if (text.length + (alternative?.length ?? 0) > 4096) {
      throw new RangeError("Mermaid generated content exceeds its combined visual/alternative text budget.");
    }
  }
  if (unsupported || !visual) return;
  return alternative === undefined ? { text } : { text, alternative };
}
