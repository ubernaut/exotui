// Copyright 2023 Im-Beast. MIT license.

// OBS-003: metric names/units are a frozen catalog and unbounded IDs can
// never become attribute values.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  CORE_METRICS,
  createCoreMetrics,
  installObservabilityProvider,
  NOOP_OBSERVABILITY,
  type ObservabilityProvider,
} from "../mod.ts";

function capturingProvider() {
  const captured: string[] = [];
  const provider: ObservabilityProvider = {
    ...NOOP_OBSERVABILITY,
    meter: {
      counter: (name, unit) => ({
        add: (value, attributes) => captured.push(`count ${name}(${unit}) +${value} ${JSON.stringify(attributes)}`),
      }),
      histogram: (name, unit) => ({
        record: (value) => captured.push(`hist ${name}(${unit}) ${value}`),
      }),
      gauge: (name, unit) => ({ set: (value) => captured.push(`gauge ${name}(${unit}) ${value}`) }),
    },
  };
  return { provider, captured };
}

Deno.test("catalog names and units flow through; the catalog is frozen", () => {
  const { provider, captured } = capturingProvider();
  const uninstall = installObservabilityProvider(provider);
  const metrics = createCoreMetrics({ strict: true });
  metrics.count("tui.frames", 1, { renderer: "gpu" });
  metrics.record("tui.frame_duration", 16.6);
  metrics.set("tui.queue_depth", 4, { queue: "render" });
  assertEquals(captured, [
    'count tui.frames(1) +1 {"renderer":"gpu"}',
    "hist tui.frame_duration(ms) 16.6",
    "gauge tui.queue_depth(1) 4",
  ]);
  assert(Object.isFrozen(CORE_METRICS));
  uninstall();
});

Deno.test("unbounded IDs and undeclared attributes are rejected", () => {
  const metrics = createCoreMetrics({ strict: true });
  // An unenumerated value (a window id) can never become an attribute.
  assertThrows(() => metrics.set("tui.queue_depth", 1, { queue: "window-42" }), Error, "unenumerated");
  // Undeclared attribute keys are refused outright.
  assertThrows(() => metrics.count("tui.cell_diffs", 1, { windowId: "w9" }), Error, "does not declare");
  // Kind mismatches are structural errors too.
  assertThrows(() => metrics.count("tui.frame_duration", 1), Error, "histogram");
});

Deno.test("lax posture drops violating signals instead of widening them", () => {
  const { provider, captured } = capturingProvider();
  const uninstall = installObservabilityProvider(provider);
  const metrics = createCoreMetrics(); // lax
  metrics.count("tui.errors", 1, { area: "render" }); // valid: emits
  metrics.count("tui.errors", 1, { area: "/home/cos/secret-path" }); // dropped
  assertEquals(captured.length, 1);
  uninstall();
});
