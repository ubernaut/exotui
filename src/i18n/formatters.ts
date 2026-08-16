// Copyright 2023 Im-Beast. MIT license.

// LOC-004: locale-aware formatters behind one disposable registry. Every
// formatter is a host Intl instance built from the locale context's resolved
// tag, time zone, numbering system, and calendar, cached under a key that
// includes every semantic option — so equal requests share one instance and
// differing options can never collide.

import type { UnicodeLocaleContext } from "./locale.ts";

/** Options for a formatter registry. */
export interface LocaleFormatterRegistryOptions {
  /** Cache entry cap; the oldest entry is evicted past it. */
  readonly maxCached?: number;
}

/** Cache behavior counters. */
export interface LocaleFormatterInspection {
  readonly cached: number;
  readonly hits: number;
  readonly misses: number;
  readonly evicted: number;
}

/** Duration fields accepted by {@linkcode LocaleFormatterRegistry.duration}. */
export interface LocaleDurationValue {
  readonly hours?: number;
  readonly minutes?: number;
  readonly seconds?: number;
}

const DEFAULT_MAX_CACHED = 128;

function cacheKey(kind: string, options: Record<string, unknown>): string {
  const entries = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `${kind}:${JSON.stringify(entries)}`;
}

/**
 * One registry per locale context. All formatters resolve against the
 * context's negotiated locale; date/time formatters inherit its time zone and
 * calendar, number formatters its numbering system, unless the caller
 * overrides them explicitly.
 */
export class LocaleFormatterRegistry {
  readonly #context: UnicodeLocaleContext;
  readonly #maxCached: number;
  readonly #cache = new Map<string, unknown>();
  #hits = 0;
  #misses = 0;
  #evicted = 0;
  #disposed = false;

  constructor(context: UnicodeLocaleContext, options: LocaleFormatterRegistryOptions = {}) {
    this.#context = context;
    this.#maxCached = Math.max(1, options.maxCached ?? DEFAULT_MAX_CACHED);
  }

  number(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
    const merged = { numberingSystem: this.#context.resolve().numberingSystem, ...options };
    return this.#cached("number", merged, () => new Intl.NumberFormat(this.#locale(), merged));
  }

  /** Number formatter in unit style, e.g. `unit: "megabyte-per-second"`. */
  unit(unit: string, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
    return this.number({ style: "unit", unit, ...options });
  }

  dateTime(options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
    const resolved = this.#context.resolve();
    const merged = { timeZone: resolved.timeZone, calendar: resolved.calendar, ...options };
    return this.#cached("dateTime", merged, () => new Intl.DateTimeFormat(this.#locale(), merged));
  }

  relativeTime(options: Intl.RelativeTimeFormatOptions = {}): Intl.RelativeTimeFormat {
    return this.#cached(
      "relativeTime",
      options as Record<string, unknown>,
      () => new Intl.RelativeTimeFormat(this.#locale(), options),
    );
  }

  list(options: Intl.ListFormatOptions = {}): Intl.ListFormat {
    return this.#cached("list", options as Record<string, unknown>, () => new Intl.ListFormat(this.#locale(), options));
  }

  displayNames(options: Intl.DisplayNamesOptions): Intl.DisplayNames {
    return this.#cached(
      "displayNames",
      options as unknown as Record<string, unknown>,
      () => new Intl.DisplayNames([this.#locale()], options),
    );
  }

  /**
   * Formats an hours/minutes/seconds duration as a locale-aware list of unit
   * values (e.g. "1 hr, 5 min, 20 sec"), composed from cached unit and list
   * formatters so it works on hosts without `Intl.DurationFormat`.
   */
  duration(value: LocaleDurationValue, options: { readonly unitDisplay?: "long" | "short" | "narrow" } = {}): string {
    const unitDisplay = options.unitDisplay ?? "short";
    const parts: string[] = [];
    for (const [unit, amount] of [["hour", value.hours], ["minute", value.minutes], ["second", value.seconds]]) {
      if (amount === undefined || amount === 0) continue;
      parts.push(this.unit(unit as string, { unitDisplay }).format(amount as number));
    }
    if (parts.length === 0) return this.unit("second", { unitDisplay }).format(0);
    return this.list({ style: unitDisplay === "long" ? "long" : "narrow", type: "unit" }).format(parts);
  }

  inspect(): LocaleFormatterInspection {
    return { cached: this.#cache.size, hits: this.#hits, misses: this.#misses, evicted: this.#evicted };
  }

  dispose(): void {
    this.#disposed = true;
    this.#cache.clear();
  }

  #locale(): string {
    return this.#context.resolve().resolved;
  }

  #cached<T>(kind: string, options: Record<string, unknown>, build: () => T): T {
    if (this.#disposed) throw new Error("LocaleFormatterRegistry is disposed");
    const key = cacheKey(kind, options);
    const existing = this.#cache.get(key);
    if (existing !== undefined) {
      this.#hits += 1;
      return existing as T;
    }
    this.#misses += 1;
    const built = build();
    if (this.#cache.size >= this.#maxCached) {
      const oldest = this.#cache.keys().next().value;
      if (oldest !== undefined) {
        this.#cache.delete(oldest);
        this.#evicted += 1;
      }
    }
    this.#cache.set(key, built);
    return built;
  }
}

/** Creates a formatter registry bound to a locale context. */
export function createLocaleFormatterRegistry(
  context: UnicodeLocaleContext,
  options: LocaleFormatterRegistryOptions = {},
): LocaleFormatterRegistry {
  return new LocaleFormatterRegistry(context, options);
}
