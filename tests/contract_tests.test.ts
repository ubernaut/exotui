// Copyright 2023 Im-Beast. MIT license.

// PKG-005: adapters receive a stable conformance report without
// importing internal tests.

import { assert, assertEquals } from "./deps.ts";
import { runBackendContract, runPluginContract, runSolverContract, runThemeContract } from "../mod.testing.ts";

Deno.test("conforming adapters pass with the stable report shape", () => {
  const backend = runBackendContract({ write: (data) => data.length, dispose: () => {} });
  assert(backend.conformant);
  assertEquals(Object.keys(backend).sort(), ["checks", "conformant", "failed", "passed", "subject"]);

  const solver = runSolverContract({
    solve: (tree) => ({ boxes: tree.children.map((child) => ({ width: child.width, height: child.height })) }),
  });
  assert(solver.conformant);
  assertEquals(solver.passed, 3);

  const theme = runThemeContract({
    tokens: Object.fromEntries(
      ["foreground", "muted", "accent", "success", "warning", "danger", "surface"]
        .map((token) => [token, (text: string) => `<${token}>${text}</${token}>`]),
    ),
  });
  assert(theme.conformant);

  const plugin = runPluginContract({
    manifestJson: JSON.stringify({
      schemaVersion: 1,
      id: "adapter",
      version: "1.0.0",
      hostApi: "^1.0.0",
      entrypoints: { main: "mod.ts" },
    }),
    plugin: { id: "adapter", contributions: [{ kind: "command", name: "adapter.run", value: 1 }] },
  });
  assert(plugin.conformant);
});

Deno.test("violations are named per check and never hide each other", () => {
  const backend = runBackendContract({
    write: () => -1, // violates the count contract
    dispose: () => {
      throw new Error("dispose crashes");
    },
  });
  assert(!backend.conformant);
  assertEquals(backend.failed, 3); // every violated check reported
  assert(backend.checks[0]!.detail!.includes("-1"));
  assert(backend.checks[2]!.detail!.includes("dispose crashes"));

  const solver = runSolverContract({
    solve: (tree) => ({ boxes: tree.children.map(() => ({ width: 0.5, height: -1 })) }),
  });
  const boxCheck = solver.checks.find((check) => check.name.includes("finite"))!;
  assert(!boxCheck.passed && boxCheck.detail!.includes("0.5"));

  const theme = runThemeContract({ tokens: { foreground: (text: string) => text } });
  const missing = theme.checks[0]!;
  assert(!missing.passed && missing.detail!.includes("muted"));

  const plugin = runPluginContract({
    manifestJson: "{broken",
    plugin: { id: "x", contributions: [] },
  });
  assert(!plugin.conformant);
  assert(plugin.checks[0]!.detail!.includes("PluginManifestError"));
});

Deno.test("the contract module never imports internal tests", async () => {
  const source = await Deno.readTextFile(new URL("../src/testing/contract_tests.ts", import.meta.url));
  assert(!source.includes("../../tests/"), "must not import from tests/");
  assert(!source.includes('from "./deps'), "must not use test deps");
});
