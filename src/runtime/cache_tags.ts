// Copyright 2023 Im-Beast. MIT license.

// DAT-006: hierarchical cache tags. Live entries register under
// slash-hierarchical tags ("user/42/posts"); invalidating a tag hits every
// entry tagged with it or with any descendant ("user/42" reaches
// "user/42/posts"), and predicate invalidation matches arbitrary tag shapes.
// Matching entries refresh exactly once per invalidation, inside one signal
// batch — so downstream reactive state observes a single transaction, not a
// stutter of per-entry updates.

import { batchSignalUpdates } from "../signals/signal.ts";

/** Report of one invalidation. */
export interface CacheInvalidationReport {
  /** Entry ids refreshed, in registration order. */
  readonly entries: readonly string[];
  /** Distinct tags those entries carried that matched. */
  readonly matchedTags: readonly string[];
}

interface CacheEntry {
  readonly id: string;
  readonly tags: readonly string[];
  readonly onInvalidate: () => void;
  disposed: boolean;
}

function tagMatches(query: string, tag: string): boolean {
  return tag === query || tag.startsWith(`${query}/`);
}

/** The tag index over live cache entries. */
export class TaggedCacheIndex {
  #entries: CacheEntry[] = [];

  /** Registers a live entry; returns its disposer. */
  register(id: string, tags: readonly string[], onInvalidate: () => void): () => void {
    const entry: CacheEntry = { id, tags: [...tags], onInvalidate, disposed: false };
    this.#entries.push(entry);
    return () => {
      entry.disposed = true;
      this.#entries = this.#entries.filter((candidate) => !candidate.disposed);
    };
  }

  /** Invalidates a tag and its whole hierarchy underneath. */
  invalidate(tag: string): CacheInvalidationReport {
    return this.#run((tags) => tags.some((candidate) => tagMatches(tag, candidate)));
  }

  /** Invalidates every entry whose tag set satisfies the predicate. */
  invalidateWhere(predicate: (tags: readonly string[]) => boolean): CacheInvalidationReport {
    return this.#run(predicate);
  }

  inspect(): { readonly entries: number; readonly tags: readonly string[] } {
    const tags = new Set<string>();
    for (const entry of this.#entries) for (const tag of entry.tags) tags.add(tag);
    return { entries: this.#entries.length, tags: [...tags].sort() };
  }

  #run(matches: (tags: readonly string[]) => boolean): CacheInvalidationReport {
    const hit: CacheEntry[] = [];
    const matchedTags = new Set<string>();
    for (const entry of this.#entries) {
      if (entry.disposed || !matches(entry.tags)) continue;
      hit.push(entry);
      for (const tag of entry.tags) matchedTags.add(tag);
    }
    // One transaction: every refresh runs inside a single signal batch, and
    // each matching entry is notified exactly once.
    batchSignalUpdates(() => {
      for (const entry of hit) entry.onInvalidate();
    });
    return { entries: hit.map((entry) => entry.id), matchedTags: [...matchedTags].sort() };
  }
}

/** Creates a tagged cache index. */
export function createTaggedCacheIndex(): TaggedCacheIndex {
  return new TaggedCacheIndex();
}
