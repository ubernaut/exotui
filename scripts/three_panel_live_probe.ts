import { runtimeHost } from "../src/runtime/host.ts";
import { createDefaultAsciiOptions } from "../src/three_ascii/options.ts";
import {
  apiWorkbenchThreeFrameIntervalForCells,
  WORKBENCH_THREE_INITIAL_CELLS,
  WORKBENCH_THREE_READBACK_STRATEGY,
} from "../src/app/workbench_three_policy.ts";
import { ThreePanelFrameView, type ThreeSceneState } from "../app/three_panel.ts";
import { Signal } from "../src/signals/mod.ts";
import {
  choiceArg,
  delay,
  formatThreePanelProbeLines,
  numberArg,
  stringArg,
  summarizeThreePanelProbe,
  type ThreePanelProbeSample,
  validateThreePanelProbeSummary,
} from "../src/three_ascii/probe.ts";
import type { ThreeAsciiRendererPerformance } from "../src/three_ascii/renderer.ts";
import type { ThreeAsciiReadbackStrategy } from "../src/three_ascii/renderer_options.ts";
import { type ThreeSceneMode, threeSceneModes, type ThreeSceneSignal } from "../app/types.ts";

const frames = numberArg(runtimeHost.args, "--frames", 36);
const width = numberArg(runtimeHost.args, "--width", 80);
const height = numberArg(runtimeHost.args, "--height", 24);
const resizeWidth = optionalNumberArg(runtimeHost.args, "--resize-width");
const resizeHeight = optionalNumberArg(runtimeHost.args, "--resize-height");
const resizeFrame = numberArg(runtimeHost.args, "--resize-frame", Math.max(1, Math.floor(frames / 2)));
const maxCells = numberArg(runtimeHost.args, "--max-cells", WORKBENCH_THREE_INITIAL_CELLS);
const intervalMs = numberArg(
  runtimeHost.args,
  "--interval",
  apiWorkbenchThreeFrameIntervalForCells(maxCells, { live: true }),
);
const mode = choiceArg(runtimeHost.args, "--mode", "studio" as ThreeSceneMode, threeSceneModes);
const check = runtimeHost.args.includes("--check");
const minSteadyFrames = numberArg(runtimeHost.args, "--min-steady-frames", 3);
const minGridUpdates = numberArg(runtimeHost.args, "--min-grid-updates", 2);
const minResizedCells = optionalNumberArg(runtimeHost.args, "--min-resized-cells");
const maxAverageTotalMs = numberArg(runtimeHost.args, "--max-average-ms", Math.max(80, intervalMs * 1.8));
const glyphs = stringArg(runtimeHost.args, "--glyphs", "blocks") as ReturnType<
  typeof createDefaultAsciiOptions
>["terminalGlyphStyle"];
const readbackStrategy = choiceArg(
  runtimeHost.args,
  "--readback",
  WORKBENCH_THREE_READBACK_STRATEGY as ThreeAsciiReadbackStrategy,
  [
    "blocking",
    "deferred",
  ] as const,
);

const rectangle = new Signal({ column: 0, row: 0, width, height }, { deepObserve: true });
const ascii = new Signal({
  ...createDefaultAsciiOptions("sharp"),
  renderMaxCells: maxCells,
  terminalGlyphStyle: glyphs,
});
const maxRenderCells = new Signal(maxCells);
const frameInterval = new Signal(intervalMs);
const scene = new Signal<ThreeSceneState | null>({
  mode,
  signal: signalForFrame(0, frames),
});

let updates = 0;
const panel = new ThreePanelFrameView({
  rectangle,
  scene,
  ascii,
  frameInterval,
  maxRenderCells,
  readbackStrategy,
  onFrame: () => {
    updates += 1;
  },
});

const samples: ThreePanelProbeSample[] = [];
const probeStart = performance.now();
let firstGridElapsedMs: number | undefined;

try {
  for (let index = 0; index < frames; index += 1) {
    const started = performance.now();
    if (index === resizeFrame && resizeWidth !== undefined && resizeHeight !== undefined) {
      rectangle.value = { column: 0, row: 0, width: resizeWidth, height: resizeHeight };
    }
    scene.value = { mode, signal: signalForFrame(index, frames) };
    await delay(intervalMs);
    const performanceInfo = panel.inspectPerformance();
    const grid = panel.grid.peek();
    if (firstGridElapsedMs === undefined && grid.length > 0 && (grid[0]?.length ?? 0) > 0) {
      firstGridElapsedMs = performance.now() - probeStart;
    }
    if (performanceInfo) {
      samples.push(samplePanel(index, performance.now() - started, performanceInfo));
    }
  }
} finally {
  panel.dispose();
  rectangle.dispose();
  ascii.dispose();
  maxRenderCells.dispose();
  frameInterval.dispose();
  scene.dispose();
}

console.log(
  formatThreePanelProbeLines(
    { mode, glyphs, readback: readbackStrategy, width, height, maxCells, intervalMs },
    samples,
    firstGridElapsedMs,
  )
    .join("\n"),
);

if (check) {
  const resizedErrors = validateResizeSamples(samples, {
    resizeFrame,
    resizeWidth,
    resizeHeight,
    minResizedCells,
  });
  const validation = validateThreePanelProbeSummary(summarizeThreePanelProbe(samples), {
    minSteadyFrames,
    minGridUpdates,
    maxAverageTotalMs,
  });
  if (!validation.ok || resizedErrors.length > 0) {
    console.error(`three-panel live probe check failed: ${[...validation.errors, ...resizedErrors].join("; ")}`);
    runtimeHost.exit(1);
  }
}

function samplePanel(
  index: number,
  elapsedMs: number,
  performanceInfo: ThreeAsciiRendererPerformance,
): ThreePanelProbeSample {
  const grid = panel.grid.peek();
  const lifecycle = panel.inspectLifecycle().state;
  const rows = grid.length;
  const columns = grid[0]?.length ?? 0;
  return {
    index,
    elapsedMs,
    totalMs: performanceInfo.totalMs,
    initMs: performanceInfo.initMs,
    sceneMs: performanceInfo.sceneMs,
    sceneUpdateMs: performanceInfo.sceneUpdateMs,
    sceneRenderMs: performanceInfo.sceneRenderMs,
    readbackMs: performanceInfo.readbackMs,
    assemblyMs: performanceInfo.assemblyMs,
    columns,
    rows,
    cells: performanceInfo.cells,
    updates,
    deferredPending: performanceInfo.deferredReadbackPending,
    deferredUnresolved: performanceInfo.deferredReadbackUnresolved,
    deferredResolved: performanceInfo.deferredReadbackResolved,
    deferredSaturated: performanceInfo.deferredReadbackSaturated,
    lifecycle,
  };
}

function signalForFrame(index: number, total: number): ThreeSceneSignal {
  const pulse = total <= 1 ? 0 : index / (total - 1);
  return {
    x: 0.55 + pulse * 0.35,
    y: 0.45 + Math.sin(pulse * Math.PI * 2) * 0.2,
    depth: 0.75,
    twist: 0.25 + pulse * 0.5,
    lift: pulse,
    pulse,
    active: true,
    pressed: index % 8 < 4,
  };
}

function optionalNumberArg(args: readonly string[], name: string): number | undefined {
  const value = numberArg(args, name, Number.NaN);
  return Number.isFinite(value) ? value : undefined;
}

function validateResizeSamples(
  samples: readonly ThreePanelProbeSample[],
  options: {
    resizeFrame: number;
    resizeWidth?: number;
    resizeHeight?: number;
    minResizedCells?: number;
  },
): string[] {
  if (options.resizeWidth === undefined || options.resizeHeight === undefined) return [];
  const afterResize = samples.filter((sample) => sample.index >= options.resizeFrame + 1);
  const latest = afterResize.at(-1);
  const errors: string[] = [];
  if (!latest) {
    errors.push("no samples after resize");
    return errors;
  }
  if (latest.columns <= 0 || latest.rows <= 0) {
    errors.push("resized grid is empty");
  }
  const minCells = options.minResizedCells;
  if (minCells !== undefined && latest.columns * latest.rows < minCells) {
    errors.push(`resized grid cells ${latest.columns * latest.rows} < ${minCells}`);
  }
  if (options.resizeWidth > width && latest.columns <= (samples[0]?.columns ?? 0)) {
    errors.push(`resized grid columns did not grow: ${latest.columns}`);
  }
  if (options.resizeHeight > height && latest.rows <= (samples[0]?.rows ?? 0)) {
    errors.push(`resized grid rows did not grow: ${latest.rows}`);
  }
  return errors;
}
