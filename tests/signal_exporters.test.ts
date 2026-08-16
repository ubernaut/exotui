// Copyright 2023 Im-Beast. MIT license.

// OBS-006: exporters declare permissions, buffer with counted backpressure,
// and shut down under a bounded deadline reporting stranded signals.

import { assert, assertEquals } from "./deps.ts";
import {
  createCallbackExporter,
  createConsoleExporter,
  createInMemoryExporter,
  createOtlpHttpExporter,
  SignalExporter,
} from "../mod.ts";

Deno.test("exporters declare their permissions up front", () => {
  assertEquals(createInMemoryExporter().exporter.declaration.permissions, []);
  const lines: string[] = [];
  assertEquals(createConsoleExporter((line) => lines.push(line)).declaration.permissions, ["stdout"]);
  const otlp = createOtlpHttpExporter("https://otel.example.com:4318/v1/traces", () => Promise.resolve());
  assertEquals(otlp.declaration.permissions, ["net:otel.example.com:4318"]);
  assertEquals(createCallbackExporter(() => {}).declaration.permissions, []);
});

Deno.test("bounded queues drop oldest under pressure and flush in batches", async () => {
  const { exporter, captured } = createInMemoryExporter();
  const small = new SignalExporter({
    declaration: { name: "tiny", permissions: [] },
    sink: (batch) => {
      captured.push(...batch);
      return Promise.resolve();
    },
    capacity: 2,
    batchSize: 2,
  });
  void exporter;
  small.offer({ kind: "log", payload: 1 });
  small.offer({ kind: "log", payload: 2 });
  small.offer({ kind: "log", payload: 3 }); // overflow: 1 drops, counted
  assertEquals(small.inspect().dropped, 1);
  await small.flush();
  assertEquals(captured.map((signal) => signal.payload), [2, 3]);
  assertEquals(small.inspect().exported, 2);
});

Deno.test("shutdown flushes inside the deadline and reports stranded signals", async () => {
  let clock = 0;
  let sinkCalls = 0;
  const slow = new SignalExporter({
    declaration: { name: "slow", permissions: [] },
    sink: () => {
      sinkCalls += 1;
      clock += 400; // each batch costs 400 virtual ms
      return Promise.resolve();
    },
    batchSize: 1,
  });
  for (let index = 0; index < 5; index += 1) slow.offer({ kind: "metric", payload: index });

  const report = await slow.shutdown({ now: () => clock, deadlineMs: 1000 });
  // Batches at t=0,400,800 fit; the deadline lapses before the rest.
  assertEquals(report.flushed, 3);
  assertEquals(report.stranded, 2);
  assertEquals(sinkCalls, 3);
  // After shutdown the exporter refuses new work.
  assertEquals(slow.offer({ kind: "log", payload: "late" }), false);
});
