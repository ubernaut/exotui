// Copyright 2023 Im-Beast. MIT license.

// PER-007: aggregate cache use respects its cap and active frame
// resources cannot be evicted.

import { assert, assertEquals } from "./deps.ts";
import { createCacheBudgetCoordinator } from "../mod.ts";

function makeCache(id: string, priority: number) {
  const evictions: number[] = [];
  return {
    id,
    priority,
    evictions,
    evict(cost: number) {
      evictions.push(cost);
      return cost; // sheds exactly what was asked
    },
  };
}

Deno.test("charges fit the cap by shedding lowest-priority unpinned cost", () => {
  const coordinator = createCacheBudgetCoordinator({ totalBudget: 100 });
  const glyphs = makeCache("glyphs", 1); // lowest priority: sheds first
  const layout = makeCache("layout", 5);
  const frames = makeCache("frames", 9);
  for (const cache of [glyphs, layout, frames]) coordinator.register(cache);

  assert(coordinator.charge("glyphs", 40).ok);
  assert(coordinator.charge("layout", 40).ok);
  assert(coordinator.charge("frames", 15).ok);
  assertEquals(coordinator.aggregate(), 95);

  // 20 more would overflow by 15: glyphs (priority 1) sheds it.
  const result = coordinator.charge("frames", 20);
  assert(result.ok);
  assertEquals(result.evicted, [{ id: "glyphs", freed: 15 }]);
  assertEquals(coordinator.aggregate(), 100); // exactly at the cap
  assertEquals(coordinator.used("glyphs"), 25);
  assertEquals(glyphs.evictions, [15]);
  assertEquals(layout.evictions, []); // higher priorities untouched
});

Deno.test("pinned caches are never asked to shed; refusal over frame damage", () => {
  const coordinator = createCacheBudgetCoordinator({ totalBudget: 50 });
  const frame = makeCache("frame", 1); // lowest priority BUT pinned
  const scratch = makeCache("scratch", 9);
  coordinator.register(frame);
  coordinator.register(scratch);
  assert(coordinator.charge("frame", 40).ok);
  coordinator.pin("frame");
  assert(coordinator.charge("scratch", 10).ok);

  // 20 more needs 20 freed; scratch can shed 10, frame is untouchable.
  const refused = coordinator.charge("scratch", 20);
  assert(!refused.ok && refused.reason.includes("pinned"));
  assertEquals(frame.evictions, []); // never called
  assert(coordinator.aggregate() <= 50);

  // Unpinning restores normal shedding.
  coordinator.unpin("frame");
  const allowed = coordinator.charge("scratch", 20);
  assert(allowed.ok);
  assert(frame.evictions.length > 0);
  assert(coordinator.aggregate() <= 50);
});

Deno.test("releases, oversized charges, and unknown caches are handled", () => {
  const coordinator = createCacheBudgetCoordinator({ totalBudget: 30 });
  const cache = makeCache("c", 1);
  coordinator.register(cache);
  assert(coordinator.charge("c", 30).ok);
  coordinator.release("c", 10);
  assertEquals(coordinator.used("c"), 20);
  coordinator.release("c", 999); // clamps at zero
  assertEquals(coordinator.used("c"), 0);

  const tooBig = coordinator.charge("c", 31);
  assert(!tooBig.ok && tooBig.reason.includes("whole budget"));
  assert(!coordinator.charge("ghost", 1).ok);
});
