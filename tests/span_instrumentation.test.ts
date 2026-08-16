// Copyright 2023 Im-Beast. MIT license.

// OBS-002: correlated spans — parentage survives async boundaries, siblings
// stay separate, and attributes exclude content by default.

import { assert, assertEquals } from "./deps.ts";
import {
  createSpanInstrumentation,
  installObservabilityProvider,
  NOOP_OBSERVABILITY,
  type ObservabilityProvider,
} from "../mod.ts";

Deno.test("parentage survives awaits; parallel siblings share the parent", async () => {
  const spans = createSpanInstrumentation();
  await spans.withSpan("action", "save-document", async () => {
    await Promise.resolve(); // async boundary before children start
    await spans.withSpan("resource", "load-config", async () => {
      await Promise.resolve();
      await spans.withSpan("layout", "solve", () => {});
    });
    await Promise.all([
      spans.withSpan("worker", "left", async () => await Promise.resolve()),
      spans.withSpan("worker", "right", async () => await Promise.resolve()),
    ]);
  });

  const byName = new Map(spans.spans().map((span) => [span.name, span]));
  const root = byName.get("save-document")!;
  assertEquals(root.parentSpanId, undefined);
  assertEquals(byName.get("load-config")!.parentSpanId, root.spanId);
  assertEquals(byName.get("solve")!.parentSpanId, byName.get("load-config")!.spanId);
  // Parallel siblings: same parent, same trace, distinct ids.
  const left = byName.get("left")!;
  const right = byName.get("right")!;
  assertEquals([left.parentSpanId, right.parentSpanId], [root.spanId, root.spanId]);
  assertEquals(left.traceId, root.traceId);
  assert(left.spanId !== right.spanId);
  // A new root starts a new trace.
  await spans.withSpan("frame", "next-frame", () => {});
  assert(spans.spans().at(-1)!.traceId !== root.traceId);
});

Deno.test("attributes exclude content by default; errors set status", async () => {
  const emitted: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
  const provider: ObservabilityProvider = {
    ...NOOP_OBSERVABILITY,
    tracer: {
      startSpan: (name, attributes) => {
        emitted.push({ name, attributes: attributes as Record<string, unknown> });
        return { setAttribute() {}, addEvent() {}, setStatus() {}, end() {} };
      },
    },
  };
  const uninstall = installObservabilityProvider(provider);
  const spans = createSpanInstrumentation();

  await spans.withSpan("command", "fs.open", () => {});
  assertEquals(emitted[0], { name: "fs.open", attributes: { kind: "command" } }); // structure only

  await spans.withSpan("command", "fs.open", () => {}, { unsafeAttributes: { durationBucket: "fast" } });
  assertEquals(emitted[1]!.attributes, { kind: "command", durationBucket: "fast" }); // conscious opt-in

  const failed = await spans.withSpan("action", "boom", () => {
    throw new Error("action failed");
  }).catch(() => "caught");
  assertEquals(failed, "caught");
  assertEquals(spans.spans().at(-1)!.status, "error");
  uninstall();
});
