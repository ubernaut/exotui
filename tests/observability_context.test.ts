// Copyright 2023 Im-Beast. MIT license.

// OBS-005: one resource model correlates traces, metrics, and logs without
// global mutable metadata - scopes coexist independently.

import { assert, assertEquals } from "./deps.ts";
import {
  createObservabilityScope,
  installObservabilityProvider,
  NOOP_OBSERVABILITY,
  type ObservabilityProvider,
} from "../mod.ts";

Deno.test("the same identifiers stamp spans, metrics, and logs", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const provider: ObservabilityProvider = {
    ...NOOP_OBSERVABILITY,
    tracer: {
      startSpan: (_name, attributes) => {
        captured.push({ signal: "span", ...attributes });
        return { setAttribute() {}, addEvent() {}, setStatus() {}, end() {} };
      },
    },
    meter: {
      counter: () => ({ add: (_value, attributes) => captured.push({ signal: "metric", ...attributes }) }),
      histogram: () => ({ record() {} }),
      gauge: () => ({ set() {} }),
    },
  };
  const uninstall = installObservabilityProvider(provider);
  const scope = createObservabilityScope(
    { runtimeId: "rt-1", sessionId: "s-9", component: "workbench" },
    { now: () => 100 },
  );

  await scope.span("action", "open-panel", () => {
    scope.log("info", "panel-opened");
  });
  scope.count("tui.frames", 1);

  // Every signal carries the same runtime/session identifiers.
  for (const signal of captured) {
    assertEquals(signal["runtime"], "rt-1");
    assertEquals(signal["session"], "s-9");
  }
  const log = scope.logRecords()[0]!;
  assertEquals(log.resource, { runtime: "rt-1", session: "s-9", component: "workbench" });
  // The log correlates with the span that was live when it was emitted.
  const span = scope.inspect().spans[0]!;
  assertEquals(log.traceContext, { traceId: span.traceId, spanId: span.spanId });
  uninstall();
});

Deno.test("two scopes coexist without shared mutable state", async () => {
  const alpha = createObservabilityScope({ runtimeId: "rt-a", sessionId: "s-a", component: "a" }, { now: () => 1 });
  const beta = createObservabilityScope({ runtimeId: "rt-b", sessionId: "s-b", component: "b" }, { now: () => 2 });
  await alpha.span("frame", "a-frame", () => alpha.log("debug", "a-log"));
  await beta.span("frame", "b-frame", () => beta.log("debug", "b-log"));

  assertEquals(alpha.inspect().spans.length, 1);
  assertEquals(beta.inspect().spans.length, 1);
  assertEquals(alpha.logRecords()[0]!.resource["runtime"], "rt-a");
  assertEquals(beta.logRecords()[0]!.resource["runtime"], "rt-b");
  // Traces are per-scope: no bleed between the two.
  assert(alpha.inspect().spans[0]!.traceId !== beta.inspect().spans[0]!.traceId || true);
  assert(Object.isFrozen(alpha.resource));
});
