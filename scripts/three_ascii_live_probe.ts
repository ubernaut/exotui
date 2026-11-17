import { runtimeHost } from "../src/runtime/host.ts";
import { asciiEffectOptions, createDefaultAsciiOptions } from "../src/three_ascii/options.ts";
import { createNeonThreeScene } from "../app/neon_three.ts";
import { type ThreeSceneMode, threeSceneModes, type ThreeSceneSignal } from "../app/types.ts";
import { averageWhere, choiceArg, delay, formatFps, formatMs, numberArg, stringArg } from "../src/three_ascii/probe.ts";
import { ThreeAsciiRenderer } from "../src/three_ascii/renderer.ts";
import type { ThreeAsciiReadbackStrategy } from "../src/three_ascii/renderer_options.ts";

interface ProbeSample {
  index: number;
  elapsedMs: number;
  totalMs: number;
  initMs: number;
  sceneMs: number;
  readbackMs: number;
  assemblyMs: number;
  rows: number;
  columns: number;
}

const frames = numberArg(runtimeHost.args, "--frames", 24);
const columns = numberArg(runtimeHost.args, "--columns", 31);
const rows = numberArg(runtimeHost.args, "--rows", 15);
const intervalMs = numberArg(runtimeHost.args, "--interval", 55);
const mode = choiceArg(runtimeHost.args, "--mode", "studio" as ThreeSceneMode, threeSceneModes);
const readbackStrategy = choiceArg(
  runtimeHost.args,
  "--readback",
  "deferred" as ThreeAsciiReadbackStrategy,
  [
    "blocking",
    "deferred",
  ] as const,
);

const ascii = {
  ...createDefaultAsciiOptions("sharp"),
  terminalGlyphStyle: stringArg(runtimeHost.args, "--glyphs", "blocks") as ReturnType<
    typeof createDefaultAsciiOptions
  >["terminalGlyphStyle"],
};
const bundle = createNeonThreeScene(mode, { wireframeThickness: ascii.wireframeThickness });
const renderer = new ThreeAsciiRenderer({
  scene: bundle.scene,
  camera: bundle.camera,
  columns,
  rows,
  effect: asciiEffectOptions(ascii),
  terminalGlyphStyle: ascii.terminalGlyphStyle,
  terminalEdgeBias: ascii.terminalEdgeBias,
  readbackStrategy,
  deferredReadbackSlots: ascii.deferredReadbackSlots,
});

const samples: ProbeSample[] = [];

try {
  for (let index = 0; index < frames; index += 1) {
    const started = performance.now();
    const frame = await renderer.renderFrame(
      intervalMs / 1000,
      () => bundle.tick(performance.now(), signalForFrame(index, frames)),
      { ansi: true },
    );
    const elapsedMs = performance.now() - started;
    const performanceInfo = renderer.inspectPerformance();
    if (performanceInfo) {
      samples.push({
        index,
        elapsedMs,
        totalMs: performanceInfo.totalMs,
        initMs: performanceInfo.initMs,
        sceneMs: performanceInfo.sceneMs,
        readbackMs: performanceInfo.readbackMs,
        assemblyMs: performanceInfo.assemblyMs,
        rows: frame.grid?.length ?? 0,
        columns: frame.grid?.[0]?.length ?? 0,
      });
    }
    if (index < frames - 1) {
      await delay(intervalMs);
    }
  }
} finally {
  renderer.destroy();
  bundle.dispose();
}

const warmup = samples[0];
const isSteadyVisible = (sample: ProbeSample) => sample.index > 0 && sample.rows > 0 && sample.columns > 0;
const averageTotalMs = averageWhere(samples, (sample) => sample.totalMs, isSteadyVisible);
const averageInitMs = averageWhere(samples, (sample) => sample.initMs, isSteadyVisible);
const averageSceneMs = averageWhere(samples, (sample) => sample.sceneMs, isSteadyVisible);
const averageReadbackMs = averageWhere(samples, (sample) => sample.readbackMs, isSteadyVisible);
const averageAssemblyMs = averageWhere(samples, (sample) => sample.assemblyMs, isSteadyVisible);

console.log(`three-ascii live probe`);
console.log(
  `scene=${mode} glyphs=${ascii.terminalGlyphStyle} readback=${readbackStrategy} size=${columns}x${rows} frames=${frames}`,
);
console.log(`warmup=${formatMs(warmup?.totalMs)} steady=${formatMs(averageTotalMs)} fps=${formatFps(averageTotalMs)}`);
console.log(
  `init=${formatMs(averageInitMs)} scene=${formatMs(averageSceneMs)} readback=${formatMs(averageReadbackMs)} assembly=${
    formatMs(averageAssemblyMs)
  }`,
);
for (const sample of samples) {
  console.log(
    `${sample.index.toString().padStart(2, "0")} total=${formatMs(sample.totalMs)} init=${
      formatMs(sample.initMs)
    } elapsed=${formatMs(sample.elapsedMs)} grid=${sample.columns}x${sample.rows}`,
  );
}

function signalForFrame(index: number, total: number): ThreeSceneSignal {
  const pulse = total <= 1 ? 0 : index / (total - 1);
  return {
    x: 0.6 + pulse * 0.4,
    y: 0.35 + pulse * 0.25,
    depth: 0.7,
    twist: 0.45,
    lift: pulse,
    pulse,
    active: true,
    pressed: false,
  };
}
