// Copyright 2023 Im-Beast. MIT license.

// TXT-007: hyphenation as a lazy provider boundary. Providers register per
// language tag and can be unloaded at any time; lookup walks the BCP-47
// fallback chain. Soft hyphens (U+00AD) always contribute opportunities and
// stay in the source — display strips them and shows a hyphen only at the
// chosen break, and the copy mapping reconstructs the original string
// exactly. Without a provider the soft-hyphen-only fallback keeps
// measurement deterministic.

import { unicodeLocaleFallbackChain } from "../i18n/locale.ts";

const SOFT_HYPHEN = "­";

/** Supplies hyphenation points for one language. */
export interface HyphenationProvider {
  /** BCP-47 language tag the provider serves (canonical casing preferred). */
  readonly language: string;
  /** UTF-16 offsets inside `word` where hyphenation is allowed. */
  hyphenate(word: string): readonly number[];
}

/** One hyphenation opportunity inside a word. */
export interface HyphenationOpportunity {
  /** UTF-16 offset in the ORIGINAL word (soft hyphens included). */
  readonly offset: number;
  readonly kind: "soft-hyphen" | "provider";
}

/** A word broken for display at one opportunity. */
export interface HyphenatedBreak {
  /** Display text of the first line: prefix without soft hyphens, plus "-". */
  readonly display: string;
  /** Display text of the remainder, soft hyphens stripped. */
  readonly remainder: string;
  /** The original word — copy reconstructs it exactly. */
  readonly source: string;
}

/** Registry of hyphenation providers with fallback-chain lookup. */
export class HyphenationRegistry {
  readonly #providers = new Map<string, HyphenationProvider>();

  /** Registers a provider; returns its unloader. */
  register(provider: HyphenationProvider): () => void {
    const key = provider.language.toLowerCase();
    this.#providers.set(key, provider);
    return () => {
      if (this.#providers.get(key) === provider) this.#providers.delete(key);
    };
  }

  /** The provider serving a tag, via its BCP-47 truncation chain. */
  providerFor(language: string): HyphenationProvider | undefined {
    for (const candidate of unicodeLocaleFallbackChain(language)) {
      const provider = this.#providers.get(candidate.toLowerCase());
      if (provider) return provider;
    }
    return undefined;
  }

  /**
   * All hyphenation opportunities for a word: soft hyphens always, provider
   * points when a provider serves the language. Deterministic for a fixed
   * registry state; sorted ascending and deduplicated.
   */
  opportunities(word: string, language: string): readonly HyphenationOpportunity[] {
    const found = new Map<number, HyphenationOpportunity["kind"]>();
    for (let offset = 0; offset < word.length; offset += 1) {
      // The break is AFTER the soft hyphen: prefix keeps it in the source.
      if (word[offset] === SOFT_HYPHEN) found.set(offset + 1, "soft-hyphen");
    }
    const provider = this.providerFor(language);
    if (provider) {
      for (const offset of provider.hyphenate(word)) {
        if (offset > 0 && offset < word.length && !found.has(offset)) found.set(offset, "provider");
      }
    }
    return [...found.entries()]
      .sort(([left], [right]) => left - right)
      .map(([offset, kind]) => ({ offset, kind }));
  }

  inspect(): { readonly languages: readonly string[] } {
    return { languages: [...this.#providers.keys()].sort() };
  }
}

/** Strips soft hyphens for display. */
export function stripSoftHyphens(text: string): string {
  return text.replaceAll(SOFT_HYPHEN, "");
}

/**
 * Breaks a word for display at an opportunity offset (in original UTF-16
 * coordinates). The display lines carry no soft hyphens and the first ends
 * with an explicit hyphen unless the source character there already renders
 * one; `source` is the untouched original, so copy is exact reconstruction.
 */
export function breakWordForDisplay(word: string, offset: number): HyphenatedBreak {
  const prefix = word.slice(0, offset);
  const remainder = word.slice(offset);
  const displayPrefix = stripSoftHyphens(prefix);
  const needsHyphen = !displayPrefix.endsWith("-");
  return {
    display: needsHyphen ? `${displayPrefix}-` : displayPrefix,
    remainder: stripSoftHyphens(remainder),
    source: word,
  };
}

/** Creates a hyphenation registry. */
export function createHyphenationRegistry(): HyphenationRegistry {
  return new HyphenationRegistry();
}
