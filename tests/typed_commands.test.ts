// Copyright 2023 Im-Beast. MIT license.

// AUT-001: typed commands — registry inspection exposes descriptors and
// invocation rejects incompatible input before executing.

import { assert, assertEquals } from "./deps.ts";
import { createTypedCommandRegistry } from "../mod.ts";

Deno.test("descriptors are inspectable and invalid input never executes", async () => {
  const registry = createTypedCommandRegistry();
  let executions = 0;
  registry.register<{ path: string }, string>({
    id: "file.open",
    title: "Open file",
    inputSummary: "{ path: string }",
    resultSummary: "the opened path",
    validateInput: (input) =>
      typeof (input as { path?: unknown })?.path === "string" ? undefined : "input.path must be a string",
    run: (input) => {
      executions += 1;
      return `opened ${input.path}`;
    },
  });
  registry.register({ id: "app.quit", run: () => "bye" });

  assertEquals(registry.descriptors().map((descriptor) => descriptor.id), ["app.quit", "file.open"]);
  assertEquals(registry.descriptors()[1]!.inputSummary, "{ path: string }");

  const rejected = await registry.invoke("file.open", { path: 42 });
  assertEquals(rejected, { status: "rejected", reason: "input.path must be a string" });
  assertEquals(executions, 0); // the gate ran, the body never did

  const succeeded = await registry.invoke<string>("file.open", { path: "/tmp/x" });
  assertEquals(succeeded, { status: "succeeded", result: "opened /tmp/x" });
  assertEquals(executions, 1);
});

Deno.test("failures, unknown commands, and disposal behave", async () => {
  const registry = createTypedCommandRegistry();
  const dispose = registry.register({
    id: "boom",
    run: () => {
      throw new Error("kaput");
    },
  });
  const failed = await registry.invoke("boom", undefined);
  assert(failed.status === "failed" && (failed.error as Error).message === "kaput");

  assertEquals(await registry.invoke("missing", {}), { status: "unknown-command", id: "missing" });
  dispose();
  assertEquals(registry.has("boom"), false);
});

Deno.test("cancellation releases owned resources and can never become success (AUT-004)", async () => {
  const registry = createTypedCommandRegistry();
  const released: string[] = [];
  let resolveBody!: (value: string) => void;
  registry.register<undefined, string>({
    id: "long.task",
    run: (_input, context) => {
      context.own(() => released.push("temp-file"));
      context.own(() => released.push("lock"));
      return new Promise((resolve) => resolveBody = resolve);
    },
  });

  const handle = registry.start<string>("long.task", undefined);
  await Promise.resolve(); // the body has started and owns its resources
  handle.cancel("user pressed escape");
  const outcome = await handle.settled;
  assertEquals(outcome, { status: "cancelled", reason: "user pressed escape" });
  assertEquals(released, ["lock", "temp-file"]); // reverse-order scope teardown

  // A late body resolution cannot rewrite the outcome to success.
  resolveBody("too late");
  await Promise.resolve();
  assertEquals(await handle.settled, { status: "cancelled", reason: "user pressed escape" });
});

Deno.test("deadlines cancel via the caller's clock; signals observe (AUT-004)", async () => {
  const registry = createTypedCommandRegistry();
  let sawAbort = false;
  registry.register({
    id: "slow",
    run: (_input, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener("abort", () => {
          sawAbort = true;
          reject(new Error("aborted"));
        });
      }),
  });
  const handle = registry.start("slow", undefined, { deadlineMs: 500 });
  await Promise.resolve(); // the body starts and registers its abort listener
  assertEquals(registry.advance(400), 0);
  assertEquals(registry.advance(500), 1);
  assertEquals(await handle.settled, { status: "cancelled", reason: "deadline" });
  assert(sawAbort);
});
