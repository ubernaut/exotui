// Regenerates budgets/layout_benchmarks.json: the checked-in comparison
// report. Deterministic fields (nodes/boxes/cache) gate in CI; timings
// are indicative and labeled with the environment that produced them.
import { LAYOUT_BENCHMARK_SUITE, runLayoutBenchmark } from "../src/perf/layout_benchmarks.ts";

const cases = LAYOUT_BENCHMARK_SUITE.map((spec) => {
  const result = runLayoutBenchmark(spec, { now: () => performance.now() });
  return {
    name: result.name,
    nodes: result.nodes,
    boxes: result.boxes,
    coldCacheMisses: result.coldCacheMisses,
    warmCacheHits: result.warmCacheHits,
    indicative: {
      coldMs: Number(result.coldMs.toFixed(2)),
      warmMs: Number(result.warmMs.toFixed(2)),
      speedup: Number((result.coldMs / Math.max(0.01, result.warmMs)).toFixed(2)),
    },
  };
});

const report = {
  note:
    "nodes/boxes/cache fields are deterministic and CI-gated; 'indicative' timings are environment-dependent and never asserted",
  environment: `${Deno.build.os}-${Deno.build.arch} deno ${Deno.version.deno}`,
  cases,
};
await Deno.writeTextFile("budgets/layout_benchmarks.json", JSON.stringify(report, null, 2) + "\n");
console.log(`report written for ${cases.length} cases`);
for (const entry of cases) {
  console.log(
    `  ${entry.name}: ${entry.nodes} nodes, ${entry.boxes} boxes, cold ${entry.indicative.coldMs}ms → warm ${entry.indicative.warmMs}ms (${entry.indicative.speedup}x)`,
  );
}
