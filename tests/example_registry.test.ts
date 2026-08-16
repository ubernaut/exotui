// Copyright 2023 Im-Beast. MIT license.

// PKG-004: docs embed only examples that compile against the current
// public entrypoint — the registry is the gate.

import { assert, assertEquals } from "./deps.ts";
import { buildExampleRegistry, entryForExample, type ExampleRegistry } from "../mod.ts";

Deno.test("entries parse declarations with launcher commands", () => {
  const declared = entryForExample(
    "examples/fancy.ts",
    "/** @example-capabilities charts, remote\n * @example-permissions --allow-net\n */\nexport {};",
  );
  assertEquals(declared.capabilities, ["charts", "remote"]);
  assertEquals(declared.permissions, ["--allow-net"]);
  assertEquals(declared.command, "deno run --allow-net examples/fancy.ts");

  const defaulted = entryForExample("examples/plain.ts", "export {};");
  assertEquals(defaulted.capabilities, ["demo"]);
  assertEquals(defaulted.command, "deno run -A examples/plain.ts");

  const registry = buildExampleRegistry([
    { path: "examples/b.ts", source: "" },
    { path: "examples/a.ts", source: "" },
  ]);
  assertEquals(registry.entries.map((entry) => entry.name), ["a", "b"]); // stable order
});

Deno.test("every registered example compiles against the current entrypoints", async () => {
  const registry: ExampleRegistry = JSON.parse(
    await Deno.readTextFile(new URL("../budgets/example_registry.json", import.meta.url)),
  );
  assert(registry.entries.length >= 30, "registry looks truncated");

  // One shared type-check pass over every registered path: any example
  // that stops compiling fails this gate and cannot be embedded in docs.
  const command = new Deno.Command("deno", {
    args: ["check", ...registry.entries.map((entry) => entry.path)],
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  const output = new TextDecoder().decode(result.stderr);
  assert(result.success, `registered examples no longer compile:\n${output}`);
});
