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
