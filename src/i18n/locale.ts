// Copyright 2023 Im-Beast. MIT license.

// LOC-001: an immutable locale context — canonicalization, requested/supported
// negotiation, fallback chains, time zone, numbering system, and calendar —
// resolvable deterministically for malformed, partial, and region-specific
// tags, and inspectable without loading any UI code.

/** Why one requested tag was dropped during canonicalization. */
export interface UnicodeLocaleInvalidTag {
  readonly tag: string;
  readonly reason: "malformed" | "empty" | "not-a-string";
}

/** Options for building one locale context. */
export interface UnicodeLocaleContextOptions {
  /** Requested tags in preference order (a user/environment preference list). */
  readonly requested?: readonly unknown[];
  /** Tags the host actually ships resources for. */
  readonly supported?: readonly unknown[];
  /** Final fallback when negotiation fails entirely. */
  readonly defaultLocale?: string;
  readonly timeZone?: string;
  readonly numberingSystem?: string;
  readonly calendar?: string;
}

/** The complete, frozen resolution of one context. */
export interface UnicodeLocaleResolution {
  /** Canonicalized requested tags, invalid ones dropped (and recorded). */
  readonly requested: readonly string[];
  readonly supported: readonly string[];
  /** The negotiated tag: the first requested tag whose fallback chain hits a supported one. */
  readonly resolved: string;
  /** The resolved tag followed by its progressively truncated parents, ending at the default. */
  readonly fallbackChain: readonly string[];
  readonly invalidTags: readonly UnicodeLocaleInvalidTag[];
  readonly timeZone: string;
  readonly numberingSystem: string;
  readonly calendar: string;
  /** Diagnostics for replaced invalid time zone / numbering system / calendar values. */
  readonly replacedOptions: readonly string[];
}

const MAX_LOCALE_TAGS = 64;
const MAX_TAG_LENGTH = 64;

function canonicalizeTag(tag: unknown): string | UnicodeLocaleInvalidTag {
  if (typeof tag !== "string") return { tag: String(tag), reason: "not-a-string" };
  const trimmed = tag.trim();
  if (trimmed.length === 0) return { tag, reason: "empty" };
  if (trimmed.length > MAX_TAG_LENGTH) return { tag: trimmed.slice(0, MAX_TAG_LENGTH), reason: "malformed" };
  try {
    const canonical = Intl.getCanonicalLocales(trimmed);
    return canonical.length === 1 ? canonical[0]! : { tag: trimmed, reason: "malformed" };
  } catch {
    return { tag: trimmed, reason: "malformed" };
  }
}

/** The BCP-47 truncation chain: strip extensions, then subtags right-to-left. */
export function unicodeLocaleFallbackChain(tag: string): readonly string[] {
  const chain: string[] = [];
  // Unicode extensions and private use come off first, whole.
  let base = tag.replace(/-(?:u|x|t)-.*$/i, "");
  while (base.length > 0) {
    if (!chain.includes(base)) chain.push(base);
    const cut = base.lastIndexOf("-");
    if (cut < 0) break;
    base = base.slice(0, cut);
  }
  return chain;
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validIntlValue(kind: "numberingSystem" | "calendar", value: string): boolean {
  if (!/^[a-z0-9]{3,8}(-[a-z0-9]{3,8})*$/i.test(value)) return false;
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supportedValuesOf !== "function") return true;
  try {
    return supportedValuesOf(kind === "numberingSystem" ? "numberingSystem" : "calendar").includes(value);
  } catch {
    return true;
  }
}

/** Immutable locale context; every derived fact comes from `resolve()`. */
export class UnicodeLocaleContext {
  readonly #resolution: UnicodeLocaleResolution;

  constructor(options: UnicodeLocaleContextOptions = {}) {
    const invalidTags: UnicodeLocaleInvalidTag[] = [];
    const canonicalize = (tags: readonly unknown[] | undefined): string[] => {
      const out: string[] = [];
      for (const tag of (tags ?? []).slice(0, MAX_LOCALE_TAGS)) {
        const result = canonicalizeTag(tag);
        if (typeof result === "string") {
          if (!out.includes(result)) out.push(result);
        } else {
          invalidTags.push(result);
        }
      }
      return out;
    };
    const requested = canonicalize(options.requested);
    const supported = canonicalize(options.supported);
    const fallbackResult = canonicalizeTag(options.defaultLocale ?? "en");
    const defaultLocale = typeof fallbackResult === "string" ? fallbackResult : "en";
    if (typeof fallbackResult !== "string") invalidTags.push(fallbackResult);

    // Lookup negotiation: the first requested tag any of whose truncations is
    // supported wins; ties broken by request order, then chain depth.
    let resolved = defaultLocale;
    negotiation: for (const tag of requested) {
      for (const candidate of unicodeLocaleFallbackChain(tag)) {
        if (supported.length === 0 || supported.includes(candidate)) {
          resolved = supported.length === 0 ? tag : candidate;
          break negotiation;
        }
      }
    }

    const fallbackChain = [...unicodeLocaleFallbackChain(resolved)];
    for (const parent of unicodeLocaleFallbackChain(defaultLocale)) {
      if (!fallbackChain.includes(parent)) fallbackChain.push(parent);
    }

    const replacedOptions: string[] = [];
    let timeZone = options.timeZone ?? "UTC";
    if (!validTimeZone(timeZone)) {
      replacedOptions.push(`timeZone "${timeZone}" is unknown; using UTC`);
      timeZone = "UTC";
    }
    let numberingSystem = options.numberingSystem ?? "latn";
    if (!validIntlValue("numberingSystem", numberingSystem)) {
      replacedOptions.push(`numberingSystem "${numberingSystem}" is unknown; using latn`);
      numberingSystem = "latn";
    }
    let calendar = options.calendar ?? "gregory";
    if (!validIntlValue("calendar", calendar)) {
      replacedOptions.push(`calendar "${calendar}" is unknown; using gregory`);
      calendar = "gregory";
    }

    this.#resolution = Object.freeze({
      requested: Object.freeze(requested),
      supported: Object.freeze(supported),
      resolved,
      fallbackChain: Object.freeze(fallbackChain),
      invalidTags: Object.freeze(invalidTags.map((entry) => Object.freeze({ ...entry }))),
      timeZone,
      numberingSystem,
      calendar,
      replacedOptions: Object.freeze(replacedOptions),
    });
    Object.freeze(this);
  }

  /** The frozen resolution; identical on every call. */
  resolve(): UnicodeLocaleResolution {
    return this.#resolution;
  }

  /** True when the canonicalized tag appears in the resolved fallback chain. */
  matches(tag: string): boolean {
    const canonical = canonicalizeTag(tag);
    return typeof canonical === "string" && this.#resolution.fallbackChain.includes(canonical);
  }
}

/** Builds an immutable locale context; see {@linkcode UnicodeLocaleContext}. */
export function createUnicodeLocaleContext(options: UnicodeLocaleContextOptions = {}): UnicodeLocaleContext {
  return new UnicodeLocaleContext(options);
}
