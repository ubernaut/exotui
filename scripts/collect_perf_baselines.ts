// Collects representative TERMINAL, WORKER, and BROWSER baselines for
// the benchmark suite, then derives the performance budgets. The
// deterministic fields must agree across hosts (same seeds, same
// trees); indicative timings are per-host. Budgets are defined per
// case from the slowest host's warm timing with 3x headroom — a bound
// meant to catch order-of-magnitude regressions on any host, not to
// flake on scheduler noise. Timings never gate CI directly; the gate
// checks structure, cross-host agreement, and budget consistency.
import {
  LAYOUT_BENCHMARK_SUITE,
  type LayoutBenchmarkResult,
  runLayoutBenchmark,
} from "../src/perf/layout_benchmarks.ts";

function indicative(result: LayoutBenchmarkResult) {
  return {
    name: result.name,
    nodes: result.nodes,
    boxes: result.boxes,
    coldCacheMisses: result.coldCacheMisses,
    warmCacheHits: result.warmCacheHits,
    coldMs: Number(result.coldMs.toFixed(2)),
    warmMs: Number(result.warmMs.toFixed(2)),
  };
}

// Terminal host: this process.
const terminal = LAYOUT_BENCHMARK_SUITE.map((spec) =>
  indicative(runLayoutBenchmark(spec, { now: () => performance.now() }))
);

// Worker host.
const worker = await new Promise<ReturnType<typeof indicative>[]>((resolve, reject) => {
  const instance = new Worker(new URL("./perf_baseline_worker.ts", import.meta.url), { type: "module" });
  instance.onmessage = (event) => {
    resolve((event.data as LayoutBenchmarkResult[]).map(indicative));
    instance.terminate();
  };
  instance.onerror = (event) => reject(new Error(event.message));
  instance.postMessage("run");
});

// Browser host: bundle, wrap in a page, run headless, read the DOM.
const scratch = await Deno.makeTempDir({ prefix: "exotui-perf-" });
const bundleOut = `${scratch}/browser_baseline.js`;
const bundle = new Deno.Command("deno", {
  args: ["bundle", new URL("./perf_baseline_browser.ts", import.meta.url).pathname, "-o", bundleOut],
  stdout: "piped",
  stderr: "piped",
});
const bundled = await bundle.output();
if (!bundled.success) {
  throw new Error(`browser bundle failed: ${new TextDecoder().decode(bundled.stderr)}`);
}
const pagePath = `${scratch}/baseline.html`;
await Deno.writeTextFile(
  pagePath,
  `<!doctype html><html><body></body><script type="module">${await Deno.readTextFile(bundleOut)}</script></html>`,
);
const browsers = ["google-chrome", "chromium", "chromium-browser"];
let browserOutput: string | undefined;
let browserBinary: string | undefined;
for (const binary of browsers) {
  try {
    const run = new Deno.Command(binary, {
      args: [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=30000",
        "--dump-dom",
        `file://${pagePath}`,
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await run.output();
    const dom = new TextDecoder().decode(output.stdout);
    if (dom.includes("BASELINE:")) {
      browserOutput = dom;
      browserBinary = binary;
      break;
    }
  } catch {
    // try the next binary
  }
}
if (!browserOutput) throw new Error("no headless browser produced a baseline");
const browserJson = browserOutput.slice(browserOutput.indexOf("BASELINE:") + "BASELINE:".length);
const browser = (JSON.parse(browserJson.slice(0, browserJson.indexOf("</body>"))) as LayoutBenchmarkResult[]).map(
  indicative,
);

// Cross-host agreement on the deterministic fields.
for (const [index, spec] of LAYOUT_BENCHMARK_SUITE.entries()) {
  for (const host of [worker[index]!, browser[index]!]) {
    if (host.nodes !== terminal[index]!.nodes || host.boxes !== terminal[index]!.boxes) {
      throw new Error(`${spec.name}: deterministic fields disagree across hosts`);
    }
  }
}

const baselines = {
  note:
    "representative host baselines for the benchmark suite; timings are indicative per host and never gate CI directly",
  environment: `${Deno.build.os}-${Deno.build.arch} deno ${Deno.version.deno}; browser: ${browserBinary}`,
  hosts: { terminal, worker, browser },
};
await Deno.writeTextFile("budgets/perf_baselines.json", JSON.stringify(baselines, null, 2) + "\n");

// Budgets: slowest host's warm timing with 3x headroom, per case.
const budgets = {
  note:
    "warm-path budgets derived from the slowest collected host baseline with 3x headroom; catches order-of-magnitude regressions, not scheduler noise",
  derivedFrom: "budgets/perf_baselines.json",
  cases: LAYOUT_BENCHMARK_SUITE.map((spec, index) => {
    const worst = Math.max(terminal[index]!.warmMs, worker[index]!.warmMs, browser[index]!.warmMs);
    return { name: spec.name, warmBudgetMs: Number((worst * 3).toFixed(2)) };
  }),
};
await Deno.writeTextFile("budgets/perf_budgets.json", JSON.stringify(budgets, null, 2) + "\n");

console.log(`baselines: terminal + worker + browser (${browserBinary})`);
for (const [index, spec] of LAYOUT_BENCHMARK_SUITE.entries()) {
  console.log(
    `  ${spec.name}: terminal ${terminal[index]!.warmMs}ms, worker ${worker[index]!.warmMs}ms, browser ${
      browser[index]!.warmMs
    }ms → budget ${budgets.cases[index]!.warmBudgetMs}ms`,
  );
}
