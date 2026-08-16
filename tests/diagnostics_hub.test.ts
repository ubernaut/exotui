// Copyright 2023 Im-Beast. MIT license.

// 036 T2: invalidation reasons, solver capabilities, frame timing,
// cell-diff size, cache behavior, task ownership, and leak warnings on
// one reusable hub — no demo-local instrumentation.

import { assert, assertEquals } from "./deps.ts";
import { createDiagnosticsHub, LayoutMeasurementCache, SIMPLE_LAYOUT_SOLVER_CAPABILITIES } from "../mod.ts";

Deno.test("invalidations record reasons in a bounded journal", () => {
  const hub = createDiagnosticsHub({ maxInvalidations: 3 });
  for (let index = 0; index < 5; index += 1) {
    hub.recordInvalidation(index, "desktop", `reason-${index}`);
  }
  const snapshot = hub.snapshot(100);
  assertEquals(snapshot.invalidations.length, 3); // bounded
  assertEquals(snapshot.invalidations[0]!.reason, "reason-2"); // oldest dropped
});

Deno.test("frame timing and cell-diff stats roll on the caller's clock", () => {
  const hub = createDiagnosticsHub();
  hub.recordFrame(0, 10);
  hub.recordFrame(10, 40);
  hub.recordCellDiff(100);
  hub.recordCellDiff(500);
  const snapshot = hub.snapshot(50);
  assertEquals(snapshot.frameTiming, { frames: 2, lastMs: 30, averageMs: 20, worstMs: 30 });
  assertEquals(snapshot.cellDiff, { frames: 2, lastCells: 500, averageCells: 300, worstCells: 500 });
});

Deno.test("cache providers pull real stats; solver tallies come from real capabilities", () => {
  const hub = createDiagnosticsHub();
  const cache = new LayoutMeasurementCache({ maxEntries: 8 });
  hub.registerCache("layout-intrinsics", () => {
    const stats = cache.stats();
    return { hits: stats.hits, misses: stats.misses };
  });
  cache.get("k"); // one miss
  hub.setSolver("simple", SIMPLE_LAYOUT_SOLVER_CAPABILITIES.style);
  const snapshot = hub.snapshot(0);
  assertEquals(snapshot.caches["layout-intrinsics"], { hits: 0, misses: 1 });
  assertEquals(snapshot.solver!.id, "simple");
  assert(snapshot.solver!.supported > 0);
});

Deno.test("task providers surface ownership; resources past threshold warn as leaks", () => {
  const hub = createDiagnosticsHub({ leakThresholdMs: 100 });
  hub.registerTasks(() => [{ id: "job-1", owner: "settings-panel", state: "running" }]);
  const release = hub.acquireResource("pty-1", "session-list", 0);
  hub.acquireResource("timer-2", "background", 950);

  const early = hub.snapshot(50);
  assertEquals(early.leakWarnings, []); // nothing old enough yet
  assertEquals(early.tasks, [{ id: "job-1", owner: "settings-panel", state: "running" }]);

  const late = hub.snapshot(1000);
  assertEquals(late.leakWarnings, [{ id: "pty-1", owner: "session-list", aliveMs: 1000 }]);

  release(); // released resources never warn again
  assertEquals(hub.snapshot(5000).leakWarnings.map((warning) => warning.id), ["timer-2"]);
});
