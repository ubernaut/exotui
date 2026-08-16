// Copyright 2023 Im-Beast. MIT license.

// PKG-010: CI attributes every budget increase to a changed dependency
// or module path.

import { assert, assertEquals } from "./deps.ts";
import { type BudgetBaseline, compareEntrypointBudgets, inventoryFromDenoInfo } from "../mod.ts";

Deno.test("comparison attributes new, grown, and removed modules by path", () => {
  const baseline: BudgetBaseline = {
    "mod.ts": { modules: 2, bytes: 300, paths: { "src/a.ts": 100, "src/b.ts": 200 } },
  };
  const current: BudgetBaseline = {
    "mod.ts": { modules: 2, bytes: 350, paths: { "src/a.ts": 150, "src/c.ts": 200 } },
    "mod.new.ts": { modules: 1, bytes: 50, paths: { "mod.new.ts": 50 } },
  };
  const report = compareEntrypointBudgets(baseline, current);
  assert(!report.ok);
  const kinds = report.increases.map((increase) => `${increase.kind}:${increase.path}`).sort();
  assertEquals(kinds, ["grown-module:src/a.ts", "new-entrypoint:mod.new.ts", "new-module:src/c.ts"]);
  assertEquals(report.improvements, [
    { entrypoint: "mod.ts", kind: "removed-module", path: "src/b.ts", deltaBytes: 200 },
  ]);
  assert(report.summary.includes("grown-module src/a.ts (+50B)"));

  // Shrinkage alone is clean.
  const shrunk = compareEntrypointBudgets(baseline, {
    "mod.ts": { modules: 1, bytes: 100, paths: { "src/a.ts": 100 } },
  });
  assert(shrunk.ok);
  assertEquals(shrunk.summary, "All entrypoints within their checked-in budgets.");
});

Deno.test("deno info inventories keep only local modules", () => {
  const inventory = inventoryFromDenoInfo({
    modules: [
      { specifier: "file:///repo/mod.ts", size: 10 },
      { specifier: "file:///repo/src/a.ts", size: 20 },
      { specifier: "https://deno.land/std/x.ts", size: 999 },
      { specifier: "file:///elsewhere/y.ts", size: 999 },
    ],
  }, "file:///repo");
  assertEquals(inventory, { modules: 2, bytes: 30, paths: { "mod.ts": 10, "src/a.ts": 20 } });
});

Deno.test("the live entrypoints match the checked-in baseline (CI gate)", async () => {
  const baseline: BudgetBaseline = JSON.parse(
    await Deno.readTextFile(new URL("../budgets/entrypoints.json", import.meta.url)),
  );
  const repoRoot = new URL("..", import.meta.url).href.replace(/\/$/, "");
  const current: Record<string, unknown> = {};
  for (const entrypoint of Object.keys(baseline)) {
    const command = new Deno.Command("deno", {
      args: ["info", "--json", entrypoint],
      stdout: "piped",
      stderr: "null",
      cwd: new URL("..", import.meta.url).pathname,
    });
    const output = await command.output();
    assert(output.success, `deno info failed for ${entrypoint}`);
    current[entrypoint] = inventoryFromDenoInfo(
      JSON.parse(new TextDecoder().decode(output.stdout)),
      repoRoot,
    );
  }
  const report = compareEntrypointBudgets(baseline, current as BudgetBaseline);
  // Every increase must be attributed AND intentional: update the
  // baseline via scripts/update_entrypoint_budgets.ts in the same change.
  assert(report.ok, `entrypoint budgets exceeded:\n${report.summary}`);
});
