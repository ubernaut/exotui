// Copyright 2023 Im-Beast. MIT license.

// LOC-009: pseudo-locales for layout and bidi stress. Four transforms —
// expansion (≈40% longer), accented (diacritic lookalikes), mirrored-rtl
// (RLI-isolated content driving real UAX #9 behavior), and mixed-script
// (Greek/Cyrillic confusables) — all preserving MessageFormat 2 syntax:
// placeholders, declarations, and escapes pass through untouched. The
// pseudo loader wraps any base loader and transforms the DEFAULT locale's
// chunks, so every key that exists at all exists under the pseudo-locale —
// a missing-key fallback is structurally impossible.

import type { MessageBundleChunk, MessageChunkLoader } from "./messages.ts";

/** The available pseudo-locales. */
export type PseudoLocaleKind = "expansion" | "accented" | "mirrored-rtl" | "mixed-script";

/** Locale tags the pseudo loader serves. */
export const PSEUDO_LOCALE_TAGS: Readonly<Record<PseudoLocaleKind, string>> = Object.freeze({
  expansion: "en-XA",
  accented: "en-XB",
  "mirrored-rtl": "en-XC",
  "mixed-script": "en-XD",
});

const ACCENTED: Readonly<Record<string, string>> = {
  a: "á",
  e: "é",
  i: "í",
  o: "ó",
  u: "ú",
  y: "ý",
  c: "ç",
  n: "ñ",
  A: "Á",
  E: "É",
  I: "Í",
  O: "Ó",
  U: "Ú",
  C: "Ç",
  N: "Ñ",
};

const MIXED: Readonly<Record<string, string>> = {
  a: "α",
  b: "в",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  H: "Н",
  B: "В",
  E: "Е",
  O: "О",
  P: "Р",
  T: "Т",
};

const RLI = "⁧";
const PDI = "⁩";

/** MF2-aware segmentation: syntax spans stay untouched. */
function transformPreservingSyntax(text: string, transform: (literal: string) => string): string {
  // Placeholders {...}, escapes \x, and leading declarations pass through.
  return text.split(/(\{\{|\}\}|\{[^}]*\}|\\.|^\.[a-z]+ .*$)/m).map((segment, index) =>
    index % 2 === 1 ? segment : transform(segment)
  ).join("");
}

function mapCharacters(text: string, table: Readonly<Record<string, string>>): string {
  return [...text].map((char) => table[char] ?? char).join("");
}

/** Applies one pseudo-locale transform to a message. */
export function pseudoLocalizeText(text: string, kind: PseudoLocaleKind): string {
  switch (kind) {
    case "expansion":
      return transformPreservingSyntax(text, (literal) => {
        if (literal.trim().length === 0) return literal;
        const padding = "~".repeat(Math.max(1, Math.round(literal.length * 0.4)));
        return `[${literal}${padding}]`;
      });
    case "accented":
      return transformPreservingSyntax(text, (literal) => mapCharacters(literal, ACCENTED));
    case "mirrored-rtl":
      return transformPreservingSyntax(text, (literal) => {
        if (literal.trim().length === 0) return literal;
        return `${RLI}${literal}${PDI}`;
      });
    case "mixed-script":
      return transformPreservingSyntax(text, (literal) => mapCharacters(literal, MIXED));
  }
}

/**
 * Wraps a base loader: pseudo-locale tags load the base locale's chunk with
 * every message transformed. A key that exists in the base exists in the
 * pseudo-locale — no missing-key fallback can occur.
 */
export function pseudoLocaleLoader(base: MessageChunkLoader, baseLocale = "en"): MessageChunkLoader {
  const kinds = new Map<string, PseudoLocaleKind>(
    Object.entries(PSEUDO_LOCALE_TAGS).map(([kind, tag]) => [tag.toLowerCase(), kind as PseudoLocaleKind]),
  );
  return async (namespace, locale) => {
    const kind = kinds.get(locale.toLowerCase());
    if (!kind) return await base(namespace, locale);
    const source = await base(namespace, baseLocale);
    if (!source) return undefined;
    const messages: Record<string, string> = {};
    for (const [key, message] of Object.entries(source.messages)) {
      messages[key] = pseudoLocalizeText(message, kind);
    }
    return { ...source, locale, messages } satisfies MessageBundleChunk;
  };
}
