// Copyright 2023 Im-Beast. MIT license.

// NAV-007: intent-driven prefetch under budget and cancellation, with
// activation reusing valid results exactly once.

import { assert, assertEquals } from "./deps.ts";
import { createRoutePrefetcher } from "../mod.ts";

function deferredFetcher() {
  const pending = new Map<string, (value: unknown) => void>();
  const calls: string[] = [];
  return {
    calls,
    fetch: (route: string, signal: AbortSignal) => {
      calls.push(route);
      return new Promise<unknown>((resolve, reject) => {
        pending.set(route, resolve);
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    },
    resolve: (route: string, value: unknown) => pending.get(route)?.(value),
  };
}

Deno.test("intent starts once; activation consumes the valid result exactly once", async () => {
  const server = deferredFetcher();
  const prefetcher = createRoutePrefetcher({ fetch: server.fetch, ttlMs: 1000 });
  assertEquals(prefetcher.intent("/users", 0), "started");
  assertEquals(prefetcher.intent("/users", 10), "in-flight");
  server.resolve("/users", { list: [1, 2] });
  await Promise.resolve();
  assertEquals(prefetcher.intent("/users", 20), "cached");
  assertEquals(server.calls, ["/users"]); // one fetch total

  assertEquals(prefetcher.activate("/users", 500), { list: [1, 2] });
  assertEquals(prefetcher.activate("/users", 500), undefined); // consumed
});

Deno.test("stale results miss; budget refuses; cancel aborts and re-arms", async () => {
  const server = deferredFetcher();
  const prefetcher = createRoutePrefetcher({ fetch: server.fetch, maxConcurrent: 2, ttlMs: 100 });
  prefetcher.intent("/a", 0);
  server.resolve("/a", "A");
  await Promise.resolve();
  assertEquals(prefetcher.activate("/a", 500), undefined); // past the TTL

  prefetcher.intent("/b", 0);
  prefetcher.intent("/c", 0);
  assertEquals(prefetcher.intent("/d", 0), "over-budget"); // explicit refusal

  assert(prefetcher.cancel("/b"));
  assertEquals(prefetcher.intent("/d", 0), "started"); // budget freed
  assertEquals(prefetcher.cancel("/b"), false);
  // A cancelled route can restart cleanly.
  assertEquals(prefetcher.intent("/b", 10), "over-budget"); // c and d fly
  server.resolve("/c", "C");
  await Promise.resolve();
  assertEquals(prefetcher.intent("/b", 20), "started");
  assertEquals([...prefetcher.inspect().inFlight].sort(), ["/b", "/d"]);
});
