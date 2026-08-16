// Copyright 2023 Im-Beast. MIT license.

// OBS-008: schema allowlists, redaction, hashing, truncation, and
// cardinality limits - adversarial secrets are absent from what exporters
// can ever see.

import { assert, assertEquals } from "./deps.ts";
import { createSignalRedactionPipeline } from "../mod.ts";

Deno.test("deny-by-default: unallowlisted attributes never exist downstream", () => {
  const pipeline = createSignalRedactionPipeline();
  pipeline.declare("command.invoked", { allow: ["commandId", "durationMs"] });

  // Adversarial fixture: secrets smuggled beside legitimate attributes.
  const result = pipeline.process("command.invoked", {
    commandId: "fs.open",
    durationMs: 12,
    password: "hunter2",
    AWS_SECRET_ACCESS_KEY: "AKIA-nope",
  });
  assertEquals(result.attributes, { commandId: "fs.open", durationMs: 12 });
  assertEquals([...result.dropped].sort(), ["AWS_SECRET_ACCESS_KEY", "password"]);
  const exported = JSON.stringify(result);
  assert(!exported.includes("hunter2") && !exported.includes("AKIA-nope"));

  // Undeclared signals drop EVERYTHING.
  const unknown = pipeline.process("mystery.signal", { token: "secret" });
  assertEquals(unknown.attributes, {});
  assert(!JSON.stringify(unknown).includes("secret"));
});

Deno.test("redaction markers, stable hashing, and truncation apply in place", () => {
  const pipeline = createSignalRedactionPipeline();
  pipeline.declare("auth.event", {
    allow: ["username", "sessionToken", "note"],
    redact: ["sessionToken"],
    hash: ["username"],
    maxLength: 10,
  });
  const first = pipeline.process("auth.event", {
    username: "collin.schroeder",
    sessionToken: "tok-123",
    note: "a note that is definitely too long",
  });
  assertEquals(first.attributes["sessionToken"], "[redacted]");
  const hashed = first.attributes["username"] as string;
  assert(hashed.startsWith("h") && !hashed.includes("collin"));
  assertEquals(first.attributes["note"], "a note tha…");
  // Hashing is stable: the same input correlates across signals.
  const second = pipeline.process("auth.event", { username: "collin.schroeder" });
  assertEquals(second.attributes["username"], hashed);
});

Deno.test("cardinality limits collapse runaway values to [overflow]", () => {
  const pipeline = createSignalRedactionPipeline();
  pipeline.declare("frame", { allow: ["windowId"], maxCardinality: 3 });
  for (let index = 0; index < 3; index += 1) {
    assertEquals(pipeline.process("frame", { windowId: `w-${index}` }).attributes["windowId"], `w-${index}`);
  }
  assertEquals(pipeline.process("frame", { windowId: "w-99" }).attributes["windowId"], "[overflow]");
  // Already-seen values still pass (the set is a budget, not a rotation).
  assertEquals(pipeline.process("frame", { windowId: "w-1" }).attributes["windowId"], "w-1");
});
