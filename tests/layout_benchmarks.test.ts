// Copyright 2023 Im-Beast. MIT license.

// 036 T2: repeatable benchmarks — seed-deterministic trees, cold/warm
// separation by cache construction, and the checked-in comparison
// report gated on its deterministic fields.

import { assert, assertEquals } from "./deps.ts";
import { buildBenchmarkTree, LAYOUT_BENCHMARK_SUITE, runLayoutBenchmark } from "../mod.ts";

Deno.test("the same seed builds the identical tree, run after run", () => {
  const spec = LAYOUT_BENCHMARK_SUITE[1]!;
  const first = buildBenchmarkTree(spec);
  const second = buildBenchmarkTree(spec);
  assertEquals(first.nodes, second.nodes);
  assertEquals(JSON.stringify(first.root), JSON.stringify(second.root));
});

Deno.test("cold and warm are separated: cold misses, warm hits the primed cache", () => {
  let tick = 0;
  const result = runLayoutBenchmark(LAYOUT_BENCHMARK_SUITE[0]!, { now: () => tick++ });
  assert(result.coldCacheMisses > 0, "cold pass must populate the cache");
  assert(result.warmCacheHits > 0, "warm passes must hit the primed cache");
  assert(result.nodes > 0 && result.boxes === result.nodes);
});

Deno.test("the clock is caller-owned: a fake clock yields exact timings", () => {
  let tick = 0;
  const result = runLayoutBenchmark(
    {
      name: "clocked",
      seed: 7,
      depth: 2,
      breadth: 2,
      bounds: { column: 0, row: 0, width: 40, height: 12 },
      warmRuns: 2,
    },
    { now: () => tick++ * 10 },
  );
  assertEquals(result.coldMs, 10); // one solve = one tick pair
  assertEquals(result.warmMs, 5); // two runs across one 10ms window
});

Deno.test("the checked-in report matches the live deterministic numbers (CI gate)", async () => {
  const report = JSON.parse(await Deno.readTextFile(new URL("../budgets/layout_benchmarks.json", import.meta.url)));
  assertEquals(report.cases.length, LAYOUT_BENCHMARK_SUITE.length);
  for (const [index, spec] of LAYOUT_BENCHMARK_SUITE.entries()) {
    const recorded = report.cases[index]!;
    const live = runLayoutBenchmark(spec, { now: () => 0 });
    assertEquals(recorded.name, live.name);
    assertEquals(
      recorded.nodes,
      live.nodes,
      `${spec.name}: node count drifted — rerun scripts/run_layout_benchmarks.ts`,
    );
    assertEquals(recorded.boxes, live.boxes, `${spec.name}: box count drifted`);
    assertEquals(recorded.coldCacheMisses, live.coldCacheMisses, `${spec.name}: cache behavior drifted`);
    assertEquals(recorded.warmCacheHits, live.warmCacheHits, `${spec.name}: cache behavior drifted`);
    assert(typeof recorded.indicative.coldMs === "number"); // present, never asserted against live
  }
});
