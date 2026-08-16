// Copyright 2023 Im-Beast. MIT license.

// DAT-007: infinite queries — stable page order in both directions,
// duplicate-cursor suppression (repeat and concurrent), and eviction that
// records scroll anchors so the evicted side restores with one fetch.

import { assert, assertEquals } from "./deps.ts";
import { createInfiniteQueryController, type InfiniteQueryPage } from "../mod.ts";

// A window over the integers: page N holds [N*3 .. N*3+2].
function windowFetcher(calls: string[]) {
  return (cursor: number | undefined, direction: "forward" | "backward") => {
    const page = cursor ?? 0;
    calls.push(`${direction}:${page}`);
    const base = page * 3;
    return Promise.resolve<InfiniteQueryPage<number, number>>({
      cursor,
      items: [base, base + 1, base + 2],
      nextCursor: page + 1,
      previousCursor: page > -3 ? page - 1 : undefined,
    });
  };
}

Deno.test("pages keep stable reading order in both directions", async () => {
  const calls: string[] = [];
  const query = createInfiniteQueryController<number, number>({ fetchPage: windowFetcher(calls) });
  await query.fetchInitial();
  await query.fetchNext();
  await query.fetchPrevious();
  assertEquals(query.items, [-3, -2, -1, 0, 1, 2, 3, 4, 5]);
  assertEquals(calls, ["forward:0", "forward:1", "backward:-1"]);
});

Deno.test("duplicate cursors are suppressed, repeated and concurrent", async () => {
  const calls: string[] = [];
  const query = createInfiniteQueryController<number, number>({ fetchPage: windowFetcher(calls) });
  await query.fetchInitial();
  assertEquals(await query.fetchInitial(), false); // already fetched
  const [a, b] = await Promise.all([query.fetchNext(), query.fetchNext()]);
  assertEquals([a, b].filter(Boolean).length, 1); // concurrent coalesced
  assertEquals(calls, ["forward:0", "forward:1"]);
  assertEquals(query.items.length, 6);
});

Deno.test("eviction keeps the window and anchors restore the evicted side", async () => {
  const calls: string[] = [];
  const query = createInfiniteQueryController<number, number>({ fetchPage: windowFetcher(calls), maxPages: 2 });
  await query.fetchInitial(); // page 0
  await query.fetchNext(); // page 1
  await query.fetchNext(); // page 2 -> evicts page 0
  assertEquals(query.items, [3, 4, 5, 6, 7, 8]);
  assertEquals(query.inspect().pages, 2);

  // The evicted front is anchored; fetching previous restores it.
  assert(query.anchors().start !== undefined);
  assert(await query.fetchPrevious());
  assertEquals(query.items, [0, 1, 2, 3, 4, 5]); // page 2 evicted off the end
  assert(query.anchors().end !== undefined);
  assert(await query.fetchNext()); // and the end restores too
  assertEquals(query.items, [3, 4, 5, 6, 7, 8]);
});
