// Worker-host baseline: runs the benchmark suite off the main thread.
import { LAYOUT_BENCHMARK_SUITE, runLayoutBenchmark } from "../src/perf/layout_benchmarks.ts";

self.onmessage = () => {
  const results = LAYOUT_BENCHMARK_SUITE.map((spec) => runLayoutBenchmark(spec, { now: () => performance.now() }));
  (self as unknown as { postMessage(value: unknown): void }).postMessage(results);
};
