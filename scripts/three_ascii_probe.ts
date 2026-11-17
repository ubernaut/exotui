import { runtimeHost } from "../src/runtime/host.ts";
import { ThreeAsciiRenderer, type ThreeAsciiRendererPerformance } from "../src/three_ascii/renderer.ts";
import { asciiEffectOptions, createDefaultAsciiOptions } from "../src/three_ascii/options.ts";
import { createNeonThreeScene } from "../app/neon_three.ts";
import { parseThreeAsciiProbeOptions, threeAsciiProbeReport } from "../src/three_ascii/probe.ts";

const options = parseThreeAsciiProbeOptions(runtimeHost.args);
const ascii = createDefaultAsciiOptions();
ascii.terminalGlyphStyle = options.style;

const bundle = createNeonThreeScene("studio", { wireframeThickness: ascii.wireframeThickness });
const renderer = new ThreeAsciiRenderer({
  scene: bundle.scene,
  camera: bundle.camera,
  columns: options.columns,
  rows: options.rows,
  effect: asciiEffectOptions(ascii),
  terminalEdgeBias: ascii.terminalEdgeBias,
  terminalGlyphStyle: ascii.terminalGlyphStyle,
  deferredReadbackSlots: ascii.deferredReadbackSlots,
  readbackStrategy: options.readbackStrategy,
});

try {
  const samples: ThreeAsciiRendererPerformance[] = [];
  for (let frame = 0; frame < options.frames + options.warmup; frame += 1) {
    await renderer.renderFrame(1 / 30, () => {
      bundle.tick(performance.now(), {
        x: 0.6,
        y: 0.42,
        depth: 0.6,
        twist: 0.25,
        lift: 0.42,
        pulse: 0.7,
        active: true,
        pressed: false,
      });
    }, { ansi: true });
    const perf = renderer.inspectPerformance();
    if (perf && frame >= options.warmup) samples.push(perf);
    if (options.delayMs > 0) await delay(options.delayMs);
  }

  console.log(JSON.stringify(threeAsciiProbeReport(options, samples), null, 2));
} finally {
  renderer.destroy();
  bundle.dispose();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
