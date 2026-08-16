// Copyright 2023 Im-Beast. MIT license.

// ASY-007: priority aging prevents starvation and priority inheritance
// lifts blockers only while the dependency exists.

import { assertEquals } from "./deps.ts";
import { createPriorityScheduler } from "../mod.ts";

Deno.test("aging surfaces low-priority work instead of starving it", () => {
  const scheduler = createPriorityScheduler({ agingPerSecond: 1 });
  scheduler.enqueue({ id: "background", priority: 1 }, 0);
  scheduler.enqueue({ id: "urgent-1", priority: 5 }, 0);
  assertEquals(scheduler.next(100), "urgent-1");

  // Fresh priority-5 tasks keep arriving, but the old background task has
  // aged past their base priority instead of starving behind them.
  scheduler.enqueue({ id: "urgent-2", priority: 5 }, 4500);
  assertEquals(scheduler.next(5000), "background"); // 1 + 5s aging = 6 > 5 + 0.5
  assertEquals(scheduler.next(5000), "urgent-2");
  assertEquals(scheduler.next(5000), undefined);
});

Deno.test("ties break by enqueue order deterministically", () => {
  const scheduler = createPriorityScheduler({ agingPerSecond: 0 });
  scheduler.enqueue({ id: "first", priority: 3 }, 0);
  scheduler.enqueue({ id: "second", priority: 3 }, 0);
  assertEquals(scheduler.next(0), "first");
  assertEquals(scheduler.next(0), "second");
});

Deno.test("inheritance lifts a blocker exactly while the dependency exists", () => {
  const scheduler = createPriorityScheduler({ agingPerSecond: 0 });
  scheduler.enqueue({ id: "io-task", priority: 1 }, 0);
  scheduler.enqueue({ id: "render", priority: 10 }, 0);
  scheduler.enqueue({ id: "medium", priority: 5 }, 0);

  // The render task depends on io-task: io-task inherits priority 10.
  scheduler.addDependency("io-task", "render");
  assertEquals(scheduler.effectivePriority("io-task", 0), 10);
  assertEquals(scheduler.inspect(0)[0]!.id, "io-task");

  // The dependency settles: the boost vanishes immediately.
  scheduler.settleDependency("io-task", "render");
  assertEquals(scheduler.effectivePriority("io-task", 0), 1);
  assertEquals(scheduler.next(0), "render");
  assertEquals(scheduler.next(0), "medium");
  assertEquals(scheduler.next(0), "io-task");
});
