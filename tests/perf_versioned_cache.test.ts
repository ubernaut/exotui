// Copyright 2023 Im-Beast. MIT license.

// PER-002: hit/miss/eviction metrics are exposed and version changes
// cannot reuse stale entries.

import { assert, assertEquals } from "./deps.ts";
import { createMeasurementCaches, VersionedCache } from "../mod.ts";

Deno.test("LRU bounds, metrics, and touch-on-hit ordering", () => {
  const cache = new VersionedCache<number>({ capacity: 2, version: "v1" });
  assertEquals(cache.memoize("a", () => 1), 1); // miss
  assertEquals(cache.memoize("a", () => 99), 1); // hit — no recompute
  cache.memoize("b", () => 2);
  cache.memoize("a", () => 0); // touch a
  cache.memoize("c", () => 3); // evicts b (least recent)
  assertEquals(cache.memoize("b", () => 42), 42); // recomputed after eviction
  const metrics = cache.metrics();
  assertEquals(metrics.hits, 2);
  assertEquals(metrics.evictions, 2);
  assertEquals(metrics.size, 2);
});

Deno.test("version bumps make same-key entries structurally stale", () => {
  const cache = new VersionedCache<string>({ capacity: 8, version: "unicode-16" });
  assertEquals(cache.memoize("x", () => "old-answer"), "old-answer");
  cache.setVersion("unicode-17");
  // Same key, new version: the old entry cannot be returned.
  assertEquals(cache.memoize("x", () => "new-answer"), "new-answer");
  assertEquals(cache.metrics().staleInvalidations, 1);
  // Reverting the version ALSO cannot resurrect the overwritten entry.
  cache.setVersion("unicode-16");
  assertEquals(cache.memoize("x", () => "recomputed"), "recomputed");
});

Deno.test("measurement caches agree with the real functions and count hits", () => {
  const caches = createMeasurementCaches({ version: "17.0.0", capacity: 64 });
  const family = "a👩‍👩‍👧b";
  const first = caches.graphemes(family);
  assertEquals(first, ["a", "👩‍👩‍👧", "b"]); // real segmentation
  assertEquals(caches.graphemes(family), first); // cached
  assertEquals(caches.width("中🙂x"), 5); // 2 + 2 + 1, real measurement
  caches.width("中🙂x");
  assertEquals(caches.formatNumber(1234567), "1,234,567");

  const metrics = caches.metrics();
  assertEquals(metrics.graphemes.hits, 1);
  assertEquals(metrics.width.hits, 1);
  assertEquals(metrics.format.misses, 1);

  // A data-version change recomputes rather than reusing stale entries.
  caches.setVersion("18.0.0");
  caches.graphemes(family);
  assertEquals(caches.metrics().graphemes.staleInvalidations, 1);
});
