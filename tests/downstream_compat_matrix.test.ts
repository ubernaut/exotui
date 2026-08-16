// Copyright 2023 Im-Beast. MIT license.

// QAL-008: public API/behavior changes produce a migration report before
// baseline updates — and pinned downstream adapter fixtures stay
// conformant.

import { assert, assertEquals } from "./deps.ts";
import { runBackendContract, runPluginContract, runSolverContract, runThemeContract } from "../mod.testing.ts";

// The pinned downstream adapter matrix: representative third-party
// implementations exercising the public contracts.
const ADAPTER_MATRIX = [
  {
    name: "buffer-backend",
    run: () => runBackendContract({ write: (data) => data.length, dispose: () => {} }),
  },
  {
    name: "throttled-backend",
    run: () => runBackendContract({ write: (data) => Math.min(data.length, 3), dispose: () => {} }),
  },
  {
    name: "passthrough-solver",
    run: () =>
      runSolverContract({
        solve: (tree) => ({ boxes: tree.children.map((child) => ({ width: child.width, height: child.height })) }),
      }),
  },
  {
    name: "plain-theme",
    run: () =>
      runThemeContract({
        tokens: Object.fromEntries(
          ["foreground", "muted", "accent", "success", "warning", "danger", "surface"]
            .map((token) => [token, (text: string) => text]),
        ),
      }),
  },
  {
    name: "minimal-plugin",
    run: () =>
      runPluginContract({
        manifestJson: JSON.stringify({
          schemaVersion: 1,
          id: "minimal",
          version: "1.0.0",
          hostApi: "^1.0.0",
          entrypoints: { main: "mod.ts" },
        }),
        plugin: { id: "minimal", contributions: [{ kind: "command", name: "minimal.go", value: 1 }] },
      }),
  },
];

Deno.test("every pinned downstream adapter fixture stays conformant", () => {
  for (const adapter of ADAPTER_MATRIX) {
    const report = adapter.run();
    assert(
      report.conformant,
      `${adapter.name}: ${
        report.checks.filter((check) => !check.passed).map((check) => `${check.name}: ${check.detail}`).join("; ")
      }`,
    );
  }
});

Deno.test("public API changes fail with a migration report until reviewed", async () => {
  const baseline: Record<string, string[]> = JSON.parse(
    await Deno.readTextFile(new URL("../budgets/public_api.json", import.meta.url)),
  );
  for (const [entrypoint, expected] of Object.entries(baseline)) {
    const module = await import(new URL(`../${entrypoint}`, import.meta.url).href);
    const live = Object.keys(module).sort();
    const before = new Set(expected);
    const after = new Set(live);
    const added = live.filter((name) => !before.has(name));
    const removed = expected.filter((name) => !after.has(name));
    assertEquals(
      { added, removed },
      { added: [], removed: [] },
      `${entrypoint}: public API changed — migration report required:\n` +
        added.map((name) => `  + ${name}`).concat(removed.map((name) => `  - ${name} (breaking)`)).join("\n") +
        "\nReview and regenerate via scripts/update_public_api_baseline.ts",
    );
  }
});
