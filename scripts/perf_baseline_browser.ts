// Browser-host baseline: bundled and run in headless Chromium; results
// land in document.body for --dump-dom to carry back.
import { LAYOUT_BENCHMARK_SUITE, runLayoutBenchmark } from "../src/perf/layout_benchmarks.ts";

const results = LAYOUT_BENCHMARK_SUITE.map((spec) => runLayoutBenchmark(spec, { now: () => performance.now() }));
document.body.textContent = "BASELINE:" + JSON.stringify(results);
