// Copyright 2023 Im-Beast. MIT license.

// REM-008: adaptation is hysteretic, inspectable, and never changes
// logical layout.

import { assert, assertEquals } from "./deps.ts";
import { createAdaptiveQualityController, DEFAULT_QUALITY_LADDER } from "../mod.remote.ts";

const GOOD = { latencyMs: 40, bandwidthKbps: 5000 };
const BAD = { latencyMs: 900, bandwidthKbps: 5000 };

Deno.test("degrading needs a streak and upgrading needs a longer one", () => {
  const controller = createAdaptiveQualityController({ degradeAfter: 3, upgradeAfter: 6 });
  assertEquals(controller.level().name, "full");

  // Two bad samples: hysteresis holds.
  controller.report(BAD, 1);
  controller.report(BAD, 2);
  assertEquals(controller.level().name, "full");
  // Third consecutive bad sample degrades one step.
  controller.report(BAD, 3);
  assertEquals(controller.level().name, "smooth");

  // A good sample resets the bad streak; flapping cannot occur.
  controller.report(GOOD, 4);
  controller.report(BAD, 5);
  controller.report(BAD, 6);
  assertEquals(controller.level().name, "smooth");

  // Upgrading needs six consecutive good samples.
  for (let at = 7; at < 12; at += 1) controller.report(GOOD, at);
  assertEquals(controller.level().name, "smooth");
  controller.report(GOOD, 12);
  assertEquals(controller.level().name, "full");

  const transitions = controller.inspect().transitions;
  assertEquals(transitions.map((entry) => `${entry.from}->${entry.to}`), ["full->smooth", "smooth->full"]);
  assert(transitions.every((entry) => entry.reason.includes("samples")));
});

Deno.test("host floors clamp degradation from below", () => {
  const controller = createAdaptiveQualityController({
    degradeAfter: 1,
    floors: { minFrameRate: 15, minColorDepth: "ansi256" },
  });
  for (let at = 0; at < 20; at += 1) controller.report(BAD, at);
  // "lean" (15fps, ansi256) satisfies both floors; "thin" (10fps) does not.
  assertEquals(controller.level().name, "lean");
  assertEquals(controller.inspect().floor.name, "lean");
});

Deno.test("quality levels are presentation-only: no layout field exists", () => {
  for (const level of DEFAULT_QUALITY_LADDER) {
    const keys = Object.keys(level).sort();
    assertEquals(keys, ["colorDepth", "compression", "frameRate", "graphics", "name"]);
    assert(!("columns" in level) && !("rows" in level)); // structurally impossible
  }
  const controller = createAdaptiveQualityController({ degradeAfter: 1 });
  for (let at = 0; at < 30; at += 1) controller.report({ latencyMs: 999, bandwidthKbps: 1 }, at);
  assertEquals(controller.level().name, "minimal"); // fully degraded, still no layout
});
