// Copyright 2023 Im-Beast. MIT license.

// VIS-009: one interaction produces one revision across all linked views.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createChartLinkGroup, type LinkUpdate } from "../mod.ts";

Deno.test("one interaction = one revision delivered once to every view", () => {
  const group = createChartLinkGroup({ xDomain: [0, 100] });
  const received: Record<string, LinkUpdate[]> = { a: [], b: [], c: [] };
  for (const id of ["a", "b", "c"]) group.register(id, (update) => received[id]!.push(update));

  const revision = group.apply("a", { xDomain: [20, 80], cursor: { dataX: 50 } });
  assertEquals(revision, 1);
  for (const id of ["a", "b", "c"]) {
    assertEquals(received[id]!.length, 1); // exactly once, origin included
    assertEquals(received[id]![0]!.revision, 1);
    assertEquals(received[id]![0]!.state.xDomain, [20, 80]);
    assertEquals(received[id]![0]!.origin, "a");
  }

  group.apply("b", { brush: { x0: 30, x1: 60 } });
  assertEquals(group.revision(), 2);
  assertEquals(received["c"]![1]!.state.brush, { x0: 30, x1: 60 });
  assertEquals(received["c"]![1]!.state.xDomain, [20, 80]); // shared state persists

  group.apply("c", { selection: ["s1", "s2"] });
  assertEquals(received["a"]!.map((update) => update.revision), [1, 2, 3]); // monotone
});

Deno.test("cyclic updates throw instead of storming", () => {
  const group = createChartLinkGroup({ xDomain: [0, 100] });
  group.register("echoer", () => {
    group.apply("echoer", { cursor: { dataX: 1 } }); // a mis-wired listener
  });
  const error = assertThrows(() => group.apply("origin", { cursor: { dataX: 0 } }), Error);
  assert(error.message.includes("cyclic update"));
  // The group recovers: the flag is cleared and later applies work.
  group.register("quiet", () => {});
  const okGroup = createChartLinkGroup({ xDomain: [0, 1] });
  const seen: number[] = [];
  okGroup.register("v", (update) => seen.push(update.revision));
  okGroup.apply("v", { cursor: { dataX: 0.5 } });
  assertEquals(seen, [1]);
});

Deno.test("unsubscribed views stop receiving; state reads stay coherent", () => {
  const group = createChartLinkGroup({ xDomain: [0, 10] });
  const seen: number[] = [];
  const unsubscribe = group.register("v", (update) => seen.push(update.revision));
  group.apply("x", { cursor: { dataX: 3 } });
  unsubscribe();
  group.apply("x", { cursor: { dataX: 4 } });
  assertEquals(seen, [1]);
  assertEquals(group.state().cursor, { dataX: 4 });
  assertEquals(group.revision(), 2);
});
