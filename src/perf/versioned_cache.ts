// Copyright 2023 Im-Beast. MIT license.

// PER-002: measurement caches are BOUNDED and VERSION-KEYED. The LRU
// core exposes hit/miss/eviction counters, and every entry records the
// data/profile version it was computed under: a version bump makes every
// older entry unreachable — a lookup that finds one counts a miss,
// evicts it, and recomputes — so stale segmentation or width results
// structurally cannot survive a Unicode data or width-profile change.
// Domain wrappers memoize the real grapheme segmentation and emoji-aware
// width functions under a caller-declared version string.

import { segmentGraphemes } from "../unicode/grapheme.ts";
import { emojiAwareTextWidth } from "../unicode/emoji.ts";
import type { UnicodeTerminalWidthProfile } from "../unicode/width.ts";

/** Cache metrics. */
export interface CacheMetrics {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly staleInvalidations: number;
  readonly size: number;
}

/** A bounded LRU cache keyed by string with version stamping. */
export class VersionedCache<V> {
  readonly #entries = new Map<string, { value: V; version: string }>();
  readonly #capacity: number;
  #version: string;
  #hits = 0;
  #misses = 0;
  #evictions = 0;
  #stale = 0;

  constructor(options: { readonly capacity?: number; readonly version: string }) {
    this.#capacity = Math.max(1, options.capacity ?? 1024);
    this.#version = options.version;
  }

  /** The active data/profile version. */
  version(): string {
    return this.#version;
  }

  /** Bumps the version: every older entry becomes unreachable. */
  setVersion(version: string): void {
    this.#version = version;
  }

  /** Gets or computes under the ACTIVE version. */
  memoize(key: string, compute: () => V): V {
    const entry = this.#entries.get(key);
    if (entry && entry.version === this.#version) {
      this.#hits += 1;
      // LRU touch: reinsert at the back.
      this.#entries.delete(key);
      this.#entries.set(key, entry);
      return entry.value;
    }
    if (entry) {
      // Same key, older version: stale — structurally unusable.
      this.#entries.delete(key);
      this.#stale += 1;
    }
    this.#misses += 1;
    const value = compute();
    this.#entries.set(key, { value, version: this.#version });
    if (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next().value as string;
      this.#entries.delete(oldest);
      this.#evictions += 1;
    }
    return value;
  }

  metrics(): CacheMetrics {
    return {
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      staleInvalidations: this.#stale,
      size: this.#entries.size,
    };
  }
}

/** The memoized measurement surface. */
export interface MeasurementCaches {
  graphemes(text: string): readonly string[];
  width(text: string): number;
  formatNumber(value: number): string;
  /** Bumps the shared data/profile version. */
  setVersion(version: string): void;
  metrics(): { graphemes: CacheMetrics; width: CacheMetrics; format: CacheMetrics };
}

/** Creates version-keyed caches over the real measurement functions. */
export function createMeasurementCaches(options: {
  readonly version: string;
  readonly locale?: string;
  readonly widthProfile?: UnicodeTerminalWidthProfile;
  readonly capacity?: number;
}): MeasurementCaches {
  const graphemeCache = new VersionedCache<readonly string[]>(options);
  const widthCache = new VersionedCache<number>(options);
  const formatCache = new VersionedCache<string>(options);
  const formatter = new Intl.NumberFormat(options.locale ?? "en-US");
  return {
    graphemes: (text) => graphemeCache.memoize(text, () => segmentGraphemes(text).map((cluster) => cluster.segment)),
    width: (text) => widthCache.memoize(text, () => emojiAwareTextWidth(text, { profile: options.widthProfile })),
    formatNumber: (value) => formatCache.memoize(String(value), () => formatter.format(value)),
    setVersion(version) {
      graphemeCache.setVersion(version);
      widthCache.setVersion(version);
      formatCache.setVersion(version);
    },
    metrics: () => ({
      graphemes: graphemeCache.metrics(),
      width: widthCache.metrics(),
      format: formatCache.metrics(),
    }),
  };
}
