// Copyright 2023 Im-Beast. MIT license.

// 036 R1: idle/live accounting, frame statistics, scheduler
// diagnostics, and the reusable debug overlay.

import { assert, assertEquals } from "./deps.ts";
import {
  createDiagnosticsHub,
  FilteredConsoleController,
  RenderAccounting,
  renderDebugOverlay,
  SchedulerDiagnostics,
} from "../mod.ts";

Deno.test("frames account as live or idle; painting consumes pending requests", () => {
  const accounting = new RenderAccounting();
  accounting.requestLive("keypress");
  accounting.requestLive("resize");
  accounting.beginFrame(0);
  accounting.endFrame(8, true); // live frame paints → pending consumed
  accounting.beginFrame(16);
  accounting.endFrame(17, false); // idle wake, nothing changed
  const stats = accounting.stats();
  assertEquals(stats.liveRequests, 2);
  assertEquals(stats.pendingLiveRequests, 0);
  assertEquals(stats.framesPainted, 1);
  assertEquals(stats.framesSkipped, 1);
  assertEquals(stats.idleFrames, 1);
  assertEquals(stats.lastFrameMs, 1);
  assertEquals(stats.worstFrameMs, 8);
  assertEquals(stats.recentReasons, ["keypress", "resize"]);
});

Deno.test("scheduler diagnostics pull queue depth from providers", () => {
  const scheduler = new SchedulerDiagnostics();
  let depth = 3;
  const unregister = scheduler.registerQueue("highlight", () => ({ depth, running: 1 }));
  assertEquals(scheduler.snapshot(), [{ name: "highlight", depth: 3, running: 1 }]);
  depth = 0;
  assertEquals(scheduler.snapshot()[0]!.depth, 0); // live, not cached
  unregister();
  assertEquals(scheduler.snapshot(), []);
});

Deno.test("the overlay renders accounting, queues, hub data, and console tail", () => {
  const accounting = new RenderAccounting();
  accounting.requestLive("wheel");
  accounting.beginFrame(0);
  accounting.endFrame(5, true);

  const scheduler = new SchedulerDiagnostics();
  scheduler.registerQueue("layout", () => ({ depth: 2, running: 0 }));

  const hub = createDiagnosticsHub({ leakThresholdMs: 1 });
  hub.recordCellDiff(1234);
  hub.registerCache("styles", () => ({ hits: 90, misses: 10 }));
  hub.acquireResource("worker-7", "syntax", 0);

  const console = new FilteredConsoleController();
  console.append({ atMs: 1, level: "warn", source: "gpu", text: "readback slow" });

  const rows = renderDebugOverlay({
    accounting,
    scheduler,
    diagnostics: () => hub.snapshot(100),
    consoleTail: () => console.visible(),
  }, 50);
  assert(rows.some((row) => row.includes("frames: 1 painted")));
  assert(rows.some((row) => row.includes("why: wheel")));
  assert(rows.some((row) => row.includes("queue layout: 2 waiting")));
  assert(rows.some((row) => row.includes("cell diff: last 1234")));
  assert(rows.some((row) => row.includes("cache styles: hits 90, misses 10")));
  assert(rows.some((row) => row.startsWith("LEAK worker-7")));
  assert(rows.some((row) => row.includes("[warn] gpu: readback slow")));
  assert(rows.every((row) => row.length <= 50)); // width respected
});
