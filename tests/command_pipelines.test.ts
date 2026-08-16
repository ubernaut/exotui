// Copyright 2023 Im-Beast. MIT license.

// AUT-005: typed pipelines — incompatible edges fail at construction and
// cancellation reaches every active branch.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createCommandPipeline, createTypedCommandRegistry } from "../mod.ts";

function registryFixture() {
  const registry = createTypedCommandRegistry();
  registry.register<number, number>({ id: "double", run: (input) => input * 2 });
  registry.register<number, number>({ id: "inc", run: (input) => input + 1 });
  registry.register<number, string>({ id: "text", run: (input) => `value=${input}` });
  return registry;
}

Deno.test("unknown command edges fail at construction, before any run", () => {
  const registry = registryFixture();
  assertThrows(
    () =>
      createCommandPipeline(registry, {
        kind: "sequential",
        steps: [{ kind: "command", id: "double" }, { kind: "command", id: "missing.step" }],
      }),
    Error,
    "missing.step",
  );
});

Deno.test("sequential, parallel, conditional, and fan-out compose", async () => {
  const registry = registryFixture();
  const pipeline = createCommandPipeline(registry, {
    kind: "sequential",
    steps: [
      { kind: "command", id: "double" }, // 3 -> 6
      {
        kind: "conditional",
        predicate: (input) => (input as number) > 5,
        whenTrue: { kind: "command", id: "inc" }, // 6 -> 7
        whenFalse: { kind: "command", id: "double" },
      },
      {
        kind: "fan-out",
        targets: [{ kind: "command", id: "text" }, { kind: "command", id: "double" }],
      },
    ],
  });
  const outcome = await pipeline.run(3);
  assertEquals(outcome, { status: "succeeded", result: ["value=7", 14] });

  const parallel = createCommandPipeline(registry, {
    kind: "parallel",
    branches: [{ kind: "command", id: "inc" }, { kind: "command", id: "text" }],
  });
  assertEquals(await parallel.run(1), { status: "succeeded", result: [2, "value=1"] });
});

Deno.test("failures carry the step; cancellation reaches every active branch", async () => {
  const registry = registryFixture();
  registry.register({
    id: "boom",
    run: () => {
      throw new Error("step exploded");
    },
  });
  const failing = createCommandPipeline(registry, {
    kind: "sequential",
    steps: [{ kind: "command", id: "inc" }, { kind: "command", id: "boom" }],
  });
  const failed = await failing.run(1);
  assert(failed.status === "failed" && failed.step === "boom");

  // Two hanging branches; one abort cancels both.
  const cancellations: string[] = [];
  registry.register<string, void>({
    id: "hang",
    run: (label, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener("abort", () => {
          cancellations.push(label);
          reject(new Error("aborted"));
        });
      }),
  });
  const hanging = createCommandPipeline(registry, {
    kind: "parallel",
    branches: [
      { kind: "command", id: "hang", mapInput: () => "left" },
      { kind: "command", id: "hang", mapInput: () => "right" },
    ],
  });
  const controller = new AbortController();
  const pending = hanging.run("x", controller.signal);
  await Promise.resolve();
  controller.abort();
  assertEquals(await pending, { status: "cancelled" });
  assertEquals(cancellations.sort(), ["left", "right"]); // both branches saw it
});
