// Copyright 2023 Im-Beast. MIT license.

// 036 T2: budgets exist only because terminal, worker, and browser
// baselines were actually collected; the gate checks structure,
// cross-host determinism, and budget consistency — never live timing.

import { assert, assertEquals } from "./deps.ts";
import { LAYOUT_BENCHMARK_SUITE, runLayoutBenchmark } from "../mod.ts";

const baselines = JSON.parse(
  await Deno.readTextFile(new URL("../budgets/perf_baselines.json", import.meta.url)),
);
const budgets = JSON.parse(
  await Deno.readTextFile(new URL("../budgets/perf_budgets.json", import.meta.url)),
);

Deno.test("all three representative hosts contributed a baseline", () => {
  for (const host of ["terminal", "worker", "browser"] as const) {
    assert(Array.isArray(baselines.hosts[host]), `${host} baseline missing`);
    assertEquals(baselines.hosts[host].length, LAYOUT_BENCHMARK_SUITE.length);
  }
  assert(baselines.environment.includes("browser:"));
});

Deno.test("deterministic fields agree across hosts and with a live run", () => {
  for (const [index, spec] of LAYOUT_BENCHMARK_SUITE.entries()) {
    const live = runLayoutBenchmark(spec, { now: () => 0 });
    for (const host of ["terminal", "worker", "browser"] as const) {
      const recorded = baselines.hosts[host][index];
      assertEquals(recorded.nodes, live.nodes, `${spec.name}/${host}: nodes drifted — rerun collect_perf_baselines`);
      assertEquals(recorded.boxes, live.boxes, `${spec.name}/${host}: boxes drifted`);
      assertEquals(recorded.coldCacheMisses, live.coldCacheMisses, `${spec.name}/${host}: cache behavior drifted`);
    }
  }
});

Deno.test("every case has a budget derived from its slowest collected host", () => {
  assertEquals(budgets.cases.length, LAYOUT_BENCHMARK_SUITE.length);
  for (const [index, entry] of budgets.cases.entries()) {
    const worst = Math.max(
      baselines.hosts.terminal[index].warmMs,
      baselines.hosts.worker[index].warmMs,
      baselines.hosts.browser[index].warmMs,
    );
    assert(entry.warmBudgetMs >= worst, `${entry.name}: budget below its own baseline`);
    assert(entry.warmBudgetMs <= worst * 4, `${entry.name}: budget headroom drifted from the documented 3x`);
  }
});
