// Copyright 2023 Im-Beast. MIT license.

// AUT-009: bounded invocation history — sensitive fields redact, safe
// fields persist, and unclassified complex inputs default to omitted.

import { assert, assertEquals } from "./deps.ts";
import { createCommandInvocationHistory } from "../mod.ts";

Deno.test("classification governs what persists; unclassified complexity is omitted", () => {
  const history = createCommandInvocationHistory();
  history.classify("auth.login", { safe: ["username"], sensitive: ["password"] });

  const record = history.record({
    id: "auth.login",
    status: "succeeded",
    input: {
      username: "cos",
      password: "hunter2",
      session: { token: "secret-token", nested: true }, // unclassified complex
      attempts: 3, // unclassified primitive
    },
    startedAt: 100,
    settledAt: 350,
  });
  assertEquals(record.args, {
    username: "cos",
    password: "[redacted]",
    attempts: "[number]",
  });
  assertEquals(record.durationMs, 250);
  assert(!("session" in record.args), "unclassified complex inputs must be omitted");

  const serialized = history.serialize();
  assert(!serialized.includes("hunter2") && !serialized.includes("secret-token"));
});

Deno.test("unclassified commands persist type summaries only; the history is bounded", () => {
  const history = createCommandInvocationHistory({ maxRecords: 2 });
  history.record({ id: "raw", status: "succeeded", input: "a string arg", startedAt: 0, settledAt: 1 });
  assertEquals(history.records()[0]!.args, { input: "[string]" });

  history.record({
    id: "unclassified",
    status: "failed",
    input: { note: "hello", blob: { secret: true } },
    startedAt: 5,
    settledAt: 9,
  });
  assertEquals(history.records()[1]!.args, { note: "[string]" }); // value never persists

  history.record({ id: "third", status: "succeeded", input: {}, startedAt: 10, settledAt: 11 });
  assertEquals(history.records().length, 2); // bounded oldest-first
  assertEquals(history.records()[0]!.id, "unclassified");
});
