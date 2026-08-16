// Copyright 2023 Im-Beast. MIT license.

// OBS-004: structured log records with dual timestamps, resource, and
// trace context — legacy diagnostics map losslessly.

import { assert, assertEquals } from "./deps.ts";
import { createStructuredLogSource } from "../mod.ts";

Deno.test("records carry both timestamps, resource, and trace context", () => {
  let clock = 1000;
  const source = createStructuredLogSource({
    resource: { component: "renderer", session: "s-1" },
    now: () => clock,
    traceContext: () => ({ traceId: "trace-9", spanId: "span-3" }),
  });
  const record = source.emit({
    severity: "warn",
    event: "slow-frame",
    timestamp: 950, // happened earlier than it was observed
    attributes: { frameMs: 48 },
  });
  assertEquals(record, {
    timestamp: 950,
    observedTimestamp: 1000,
    severity: "warn",
    event: "slow-frame",
    resource: { component: "renderer", session: "s-1" },
    attributes: { frameMs: 48 },
    traceContext: { traceId: "trace-9", spanId: "span-3" },
  });
  clock = 2000;
  const second = source.emit({ severity: "info", event: "frame" });
  assertEquals([second.timestamp, second.observedTimestamp], [2000, 2000]);
  assertEquals(source.records().length, 2);
});

Deno.test("legacy diagnostic events map losslessly", () => {
  const source = createStructuredLogSource({ resource: { component: "gpu" }, now: () => 500 });
  const record = source.emitLegacy({
    type: "gpu-renderer",
    level: "warning",
    message: "readback stalled 30f",
    at: 420,
    data: { preset: "Goody - The Wild Vort", frames: 30, fallback: true, detail: { nested: 1 } },
  });
  assertEquals(record.event, "gpu-renderer");
  assertEquals(record.severity, "warn");
  assertEquals(record.timestamp, 420);
  assertEquals(record.observedTimestamp, 500);
  // Every legacy field has a defined place; complex extras stringify.
  assertEquals(record.attributes, {
    message: "readback stalled 30f",
    preset: "Goody - The Wild Vort",
    frames: 30,
    fallback: true,
    detail: '{"nested":1}',
  });
  // Unknown levels default to info rather than dropping the record.
  assertEquals(source.emitLegacy({ type: "odd", level: "bizarre" }).severity, "info");
  assert(source.records().length === 2);
});
