// 036 L2 evidence probe: browser import + GitHub Pages-style static
// bundling for the Taffy WASM candidate, plus the measurement gates —
// cold-load size/time, steady layout time, memory, and cross-boundary
// overhead. Writes budgets/taffy_spike.json. Needs a headless Chromium
// and network for the first npm fetch; run on demand, not in CI.
import { buildBenchmarkTree } from "../src/perf/layout_benchmarks.ts";
import { simpleLayoutSolver } from "../src/layout/solvers/simple.ts";

// --- cold load: module import + wasm init time, in a fresh process ---
const coldProbe = `
const importStart = performance.now();
const { taffyWasmLayoutSolver } = await import(${
  JSON.stringify(new URL("../src/layout/solvers/taffy_wasm.ts", import.meta.url).href)
});
const importMs = performance.now() - importStart;
console.log(JSON.stringify({ importMs: Number(importMs.toFixed(1)) }));
`;
const cold = new Deno.Command("deno", { args: ["eval", coldProbe], stdout: "piped", stderr: "piped" });
const coldOut = await cold.output();
if (!coldOut.success) throw new Error("cold probe failed: " + new TextDecoder().decode(coldOut.stderr));
const coldLoad = JSON.parse(new TextDecoder().decode(coldOut.stdout).trim().split("\n").pop()!);

// --- steady layout + memory + cross-boundary overhead ---
const { taffyWasmLayoutSolver } = await import("../src/layout/solvers/taffy_wasm.ts");
const spec = { name: "steady", seed: 23, depth: 4, breadth: 4, bounds: { column: 0, row: 0, width: 200, height: 60 } };
const taffySolver = taffyWasmLayoutSolver();
const simple = simpleLayoutSolver();
const warmups = 3;
for (let index = 0; index < warmups; index += 1) {
  taffySolver.solve({ root: buildBenchmarkTree(spec).root, bounds: spec.bounds });
  simple.solve({ root: buildBenchmarkTree(spec).root, bounds: spec.bounds });
}
const beforeMemory = Deno.memoryUsage().heapUsed;
const RUNS = 10;
const taffyStart = performance.now();
for (let index = 0; index < RUNS; index += 1) {
  taffySolver.solve({ root: buildBenchmarkTree(spec).root, bounds: spec.bounds });
}
const taffyMs = (performance.now() - taffyStart) / RUNS;
const simpleStart = performance.now();
for (let index = 0; index < RUNS; index += 1) {
  simple.solve({ root: buildBenchmarkTree(spec).root, bounds: spec.bounds });
}
const simpleMs = (performance.now() - simpleStart) / RUNS;
const memoryDeltaKb = Math.max(0, Math.round((Deno.memoryUsage().heapUsed - beforeMemory) / 1024));

// Cross-boundary overhead: per-node style construction + layout read,
// isolated from the algorithm by using a trivial 200-leaf flat tree.
const { createLayoutNode } = await import("../src/layout/solver.ts");
const { defaultComputedLayoutStyle } = await import("../src/layout/style.ts");
const flatChildren = Array.from({ length: 200 }, (_, index) => {
  const style = defaultComputedLayoutStyle();
  style.flexGrow = 1;
  return createLayoutNode({ id: `leaf-${index}`, tag: "panel", style });
});
const flatStyle = defaultComputedLayoutStyle();
flatStyle.display = "flex";
const flatRoot = createLayoutNode({ id: "root", tag: "window", style: flatStyle, children: flatChildren });
const boundaryStart = performance.now();
taffySolver.solve({ root: flatRoot, bounds: { column: 0, row: 0, width: 400, height: 10 } });
const boundaryMs = performance.now() - boundaryStart;

// --- browser + GitHub Pages-style static bundle ---
const scratch = await Deno.makeTempDir({ prefix: "taffy-pages-" });
const entry = `${scratch}/entry.ts`;
await Deno.writeTextFile(
  entry,
  `
import { loadTaffy, Style, TaffyTree, Display, FlexDirection } from "npm:taffy-layout@2.0.3";
await loadTaffy();
const tree = new TaffyTree();
const childStyle = new Style();
childStyle.flexGrow = 1;
const a = tree.newLeaf(childStyle);
const b = tree.newLeaf(childStyle);
const rootStyle = new Style();
rootStyle.display = Display.Flex;
rootStyle.flexDirection = FlexDirection.Row;
rootStyle.size = { width: 80, height: 24 };
const root = tree.newWithChildren(rootStyle, [a, b]);
tree.computeLayout(root, { width: 80, height: 24 });
const layout = tree.getLayout(b);
tree.free();
document.body.textContent = "TAFFY:" + JSON.stringify({ x: layout.x, width: layout.width });
`,
);
const bundle = new Deno.Command("deno", {
  args: ["bundle", entry, "-o", `${scratch}/bundle.js`],
  stdout: "piped",
  stderr: "piped",
});
const bundled = await bundle.output();
if (!bundled.success) throw new Error("bundle failed: " + new TextDecoder().decode(bundled.stderr));
// Pages-style hosting: static dir with the wasm asset next to the bundle.
const cache = new Deno.Command("deno", { args: ["info", "npm:taffy-layout@2.0.3"], stdout: "piped", stderr: "piped" });
await cache.output();
let wasmPath: string | undefined;
const npmDirCommand = new Deno.Command("deno", { args: ["info", "--json"], stdout: "piped" });
const npmInfo = JSON.parse(new TextDecoder().decode((await npmDirCommand.output()).stdout));
const npmCache = `${npmInfo.npmCache}/registry.npmjs.org/taffy-layout/2.0.3/pkg/taffy_wasm_bg.wasm`;
try {
  await Deno.stat(npmCache);
  wasmPath = npmCache;
} catch {
  throw new Error("wasm asset not found in npm cache: " + npmCache);
}
await Deno.copyFile(wasmPath, `${scratch}/taffy_wasm_bg.wasm`);
await Deno.writeTextFile(
  `${scratch}/index.html`,
  `<!doctype html><html><body></body><script type="module" src="./bundle.js"></script></html>`,
);
const server = Deno.serve({ port: 8137, hostname: "127.0.0.1", onListen: () => {} }, async (request) => {
  const path = new URL(request.url).pathname;
  const file = path === "/" ? "/index.html" : path;
  try {
    const body = await Deno.readFile(`${scratch}${file}`);
    const type = file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".js") ? "text/javascript" : "text/html";
    return new Response(body, { headers: { "content-type": type } });
  } catch {
    return new Response("not found", { status: 404 });
  }
});
let browserResult = "";
for (const binary of ["google-chrome", "chromium"]) {
  try {
    const run = new Deno.Command(binary, {
      args: [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=20000",
        "--dump-dom",
        "http://127.0.0.1:8137/",
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await run.output();
    const dom = new TextDecoder().decode(output.stdout);
    if (dom.includes("TAFFY:")) {
      browserResult = dom.slice(dom.indexOf("TAFFY:") + 6);
      browserResult = browserResult.slice(0, browserResult.indexOf("</body>"));
      break;
    }
  } catch {
    // try the next binary
  }
}
await server.shutdown();
if (!browserResult) throw new Error("browser probe produced no TAFFY marker");
const browserLayout = JSON.parse(browserResult);
if (browserLayout.x !== 40 || browserLayout.width !== 40) {
  throw new Error("browser layout wrong: " + browserResult);
}
const wasmSizeKb = Math.round((await Deno.stat(wasmPath)).size / 1024);

const evidence = {
  note:
    "L2 spike evidence for taffy-layout@2.0.3; run scripts/probe_taffy_wasm.ts to regenerate (needs headless Chromium)",
  environment: `${Deno.build.os}-${Deno.build.arch} deno ${Deno.version.deno}`,
  candidate: "npm:taffy-layout@2.0.3",
  coldLoad: { wasmSizeKb, importAndInitMs: coldLoad.importMs },
  steadyLayout: {
    trees: `depth 4 breadth 4 (${buildBenchmarkTree(spec).nodes} nodes)`,
    taffyMsPerSolve: Number(taffyMs.toFixed(2)),
    simpleMsPerSolve: Number(simpleMs.toFixed(2)),
  },
  memory: { heapDeltaKbOver10Solves: memoryDeltaKb },
  crossBoundary: { flat200LeafSolveMs: Number(boundaryMs.toFixed(2)) },
  browser: { pagesStyleStaticBundle: true, layout: browserLayout },
};
await Deno.writeTextFile("budgets/taffy_spike.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
