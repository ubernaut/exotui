// Copyright 2023 Im-Beast. MIT license.

/**
 * PKG-010: regenerates the checked-in entrypoint budget baseline.
 *
 *   deno run -A scripts/update_entrypoint_budgets.ts
 *
 * Run this ONLY when a budget increase is intentional; the CI gate
 * (tests/entrypoint_budgets.test.ts) attributes every drift to a module
 * path until this baseline is updated in the same change.
 */

import { type BudgetBaseline, inventoryFromDenoInfo } from "../src/perf/entrypoint_budget.ts";

const ENTRYPOINTS = [
  "mod.ts",
  "mod.app.ts",
  "mod.remote.ts",
  "mod.testing.ts",
  "mod.terminal.ts",
  "mod.theme.ts",
  "mod.web.ts",
];

const repoRoot = new URL("..", import.meta.url).href.replace(/\/$/, "");
const baseline: Record<string, unknown> = {};
for (const entrypoint of ENTRYPOINTS) {
  const command = new Deno.Command("deno", { args: ["info", "--json", entrypoint], stdout: "piped" });
  const output = await command.output();
  if (!output.success) throw new Error(`deno info failed for ${entrypoint}`);
  const info = JSON.parse(new TextDecoder().decode(output.stdout));
  baseline[entrypoint] = inventoryFromDenoInfo(info, repoRoot);
}
await Deno.writeTextFile(
  new URL("../budgets/entrypoints.json", import.meta.url),
  JSON.stringify(baseline as BudgetBaseline, null, 2) + "\n",
);
console.log(`baseline written for ${ENTRYPOINTS.length} entrypoints`);
