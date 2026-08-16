// Copyright 2023 Im-Beast. MIT license.

// OBS-007: sampling decisions are stable per trace, parent-based decisions
// inherit, and exemplars attach only to sampled traces.

import { assert, assertEquals } from "./deps.ts";
import { createMetricExemplarHook, createTraceSampler } from "../mod.ts";

Deno.test("ratio sampling is deterministic per trace and across instances", () => {
  const first = createTraceSampler({ kind: "ratio", ratio: 0.5 });
  const second = createTraceSampler({ kind: "ratio", ratio: 0.5 });
  let sampled = 0;
  for (let index = 0; index < 200; index += 1) {
    const traceId = `trace-${index}`;
    const decision = first.shouldSample(traceId);
    assertEquals(first.shouldSample(traceId), decision); // stable per trace
    assertEquals(second.shouldSample(traceId), decision); // config-determined
    if (decision) sampled += 1;
  }
  assert(sampled > 60 && sampled < 140, `ratio ~0.5, got ${sampled}/200`);
  // Degenerate strategies behave.
  assert(createTraceSampler({ kind: "always" }).shouldSample("x"));
  assert(!createTraceSampler({ kind: "never" }).shouldSample("x"));
});

Deno.test("parent-based sampling inherits; roots fall back to the root strategy", () => {
  const sampler = createTraceSampler({ kind: "parent", root: { kind: "never" } });
  assertEquals(sampler.shouldSample("child-trace", true), true); // parent said yes
  assertEquals(sampler.shouldSample("other-child", false), false);
  assertEquals(sampler.shouldSample("root-trace"), false); // no parent: root strategy
});

Deno.test("exemplars attach only to sampled traces and stay bounded", () => {
  const sampler = createTraceSampler({ kind: "always" });
  const hook = createMetricExemplarHook(sampler, { perMetric: 2 });
  assert(hook.offer("tui.frame_duration", 16, "t1"));
  assert(hook.offer("tui.frame_duration", 48, "t2"));
  assert(hook.offer("tui.frame_duration", 12, "t3")); // evicts the oldest
  assertEquals(hook.exemplars("tui.frame_duration").map((exemplar) => exemplar.traceId), ["t2", "t3"]);

  const silent = createMetricExemplarHook(createTraceSampler({ kind: "never" }));
  assertEquals(silent.offer("tui.frames", 1, "t9"), false);
  assertEquals(silent.exemplars("tui.frames"), []);
});
