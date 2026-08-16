// Copyright 2023 Im-Beast. MIT license.

// DAT-006: hierarchical tag invalidation hits exactly the matching live
// entries, each once, in a single reactive transaction.

import { assert, assertEquals } from "./deps.ts";
import { batchSignalUpdates, createTaggedCacheIndex, Effect, Signal } from "../mod.ts";

Deno.test("hierarchical tags match descendants; unrelated entries stay live", () => {
  const index = createTaggedCacheIndex();
  const refreshed: string[] = [];
  index.register("user-42", ["user/42"], () => refreshed.push("user-42"));
  index.register("user-42-posts", ["user/42/posts"], () => refreshed.push("user-42-posts"));
  index.register("user-7", ["user/7"], () => refreshed.push("user-7"));
  index.register("settings", ["settings"], () => refreshed.push("settings"));

  const report = index.invalidate("user/42");
  assertEquals(report.entries, ["user-42", "user-42-posts"]);
  assertEquals(refreshed, ["user-42", "user-42-posts"]);
  assertEquals(report.matchedTags, ["user/42", "user/42/posts"]);
  // A sibling id prefix ("user/421") must NOT match "user/42".
  index.register("user-421", ["user/421"], () => refreshed.push("user-421"));
  assertEquals(index.invalidate("user/42").entries, ["user-42", "user-42-posts"]);
});

Deno.test("multi-tag entries refresh once; predicates and disposers work", () => {
  const index = createTaggedCacheIndex();
  let refreshes = 0;
  index.register("both", ["user/42", "feed/home"], () => refreshes += 1);
  const report = index.invalidateWhere((tags) => tags.some((tag) => tag.startsWith("user") || tag.startsWith("feed")));
  assertEquals(report.entries, ["both"]);
  assertEquals(refreshes, 1); // both tags matched, one refresh

  const dispose = index.register("gone", ["user/1"], () => refreshes += 100);
  dispose();
  index.invalidate("user/1");
  assertEquals(refreshes, 1);
  assertEquals(index.inspect().entries, 1);
});

Deno.test("an invalidation is one reactive transaction", async () => {
  const index = createTaggedCacheIndex();
  // Both entries bump one shared revision — the pattern reactive caches use.
  const revision = new Signal(0);
  index.register("a", ["data/x"], () => revision.value = revision.peek() + 1);
  index.register("b", ["data/y"], () => revision.value = revision.peek() + 1);

  let effectRuns = 0;
  const effect = new Effect(() => {
    void revision.value;
    effectRuns += 1;
  });
  await Promise.resolve(); // dependency tracking settles
  assertEquals(effectRuns, 1);

  index.invalidate("data");
  await Promise.resolve();
  // Both refreshes landed, but the batched write propagated exactly once.
  assertEquals(revision.peek(), 2);
  assertEquals(effectRuns, 2);
  effect.dispose();
  // Sanity: the batch helper is the exported one the index uses.
  assert(typeof batchSignalUpdates === "function");
});
