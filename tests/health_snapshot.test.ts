// Copyright 2023 Im-Beast. MIT license.

// OBS-009: bounded health snapshots that succeed even while subsystems are
// degraded or their probes crash outright.

import { assert, assertEquals } from "./deps.ts";
import { createHealthMonitor } from "../mod.ts";

Deno.test("snapshots collect lifecycle, subsystems, failures, and capabilities", () => {
  const monitor = createHealthMonitor();
  monitor.setLifecycle("running");
  monitor.probe("render", () => ({ status: "ok", indicators: { backlogFrames: 0, saturationPct: 12 } }));
  monitor.probe("storage", () => ({ status: "degraded", detail: "quota at 92%", indicators: { usedPct: 92 } }));
  monitor.declareCapability("webgpu", true);
  monitor.declareCapability("kitty-graphics", false);
  monitor.reportFailure({ area: "worker", classification: "transient", at: 900, detail: "task timeout" });

  const snapshot = monitor.snapshot(1000);
  assertEquals(snapshot.lifecycle, "running");
  assertEquals(snapshot.subsystems.map((entry) => `${entry.name}:${entry.status}`), ["render:ok", "storage:degraded"]);
  assertEquals(snapshot.subsystems[0]!.indicators, { backlogFrames: 0, saturationPct: 12 });
  assertEquals(snapshot.capabilities, { webgpu: true, "kitty-graphics": false });
  assertEquals(snapshot.recentFailures, [
    { area: "worker", classification: "transient", at: 900, detail: "task timeout" },
  ]);
});

Deno.test("crashing probes degrade their entry; the snapshot always succeeds", () => {
  const monitor = createHealthMonitor();
  monitor.probe("gpu", () => {
    throw new Error("device lost mid-probe");
  });
  monitor.probe("input", () => ({ status: "ok" }));
  const snapshot = monitor.snapshot(0);
  assertEquals(snapshot.subsystems.length, 2);
  const gpu = snapshot.subsystems.find((entry) => entry.name === "gpu")!;
  assertEquals(gpu.status, "degraded");
  assert(gpu.detail?.includes("device lost"));
});

Deno.test("the failure ring and indicator lists stay bounded", () => {
  const monitor = createHealthMonitor();
  for (let index = 0; index < 40; index += 1) {
    monitor.reportFailure({ area: "io", classification: "unknown", at: index, detail: `f${index}` });
  }
  const manyIndicators = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`i${index}`, index]));
  monitor.probe("busy", () => ({ status: "ok", indicators: manyIndicators }));

  const snapshot = monitor.snapshot(100);
  assertEquals(snapshot.recentFailures.length, 16);
  assertEquals(snapshot.recentFailures[0]!.at, 24); // oldest evicted
  assertEquals(Object.keys(snapshot.subsystems[0]!.indicators!).length, 16);
});
