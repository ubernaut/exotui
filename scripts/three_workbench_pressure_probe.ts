import { runtimeHost } from "../src/runtime/host.ts";
import {
  prepareWorkbenchFrame,
  renderFrameRow,
  renderFrameSlice,
  Signal,
  WorkbenchAnsiScreenPainter,
  type WorkbenchFrame,
  writeFrame,
} from "../mod.ts";
import { ThreePanelFrameView, type ThreeSceneState } from "../app/three_panel.ts";
import { writeWorkbenchThreeGrid } from "../src/app/workbench_three_grid.ts";
import { createDefaultWorkbenchAsciiOptions } from "../src/app/workbench_ascii.ts";
import {
  API_WORKBENCH_THREE_FULLSCREEN_PRESSURE_POLICY,
  API_WORKBENCH_THREE_PRESSURE_POLICY,
  apiWorkbenchThreeFrameIntervalForCells,
  WORKBENCH_THREE_FULLSCREEN_MIN_CELLS,
  WORKBENCH_THREE_INITIAL_CELLS,
  WORKBENCH_THREE_READBACK_STRATEGY,
} from "../src/app/workbench_three_policy.ts";
import { delay } from "../src/three_ascii/probe.ts";
import {
  countWorkbenchThreeProbeChangedGridRows,
  formatWorkbenchThreePressureProbeSummaryLines,
  parseWorkbenchThreePressureProbeCliOptions,
  snapshotWorkbenchThreeProbeGridRowsInto,
  summarizeWorkbenchThreePressureProbe,
  validateWorkbenchThreePressureProbeSummary,
  type WorkbenchThreePressureProbeSample,
} from "../src/app/workbench_three_pressure_probe.ts";
import { type ThreeSceneMode, threeSceneModes } from "../app/types.ts";
import {
  createWorkbenchThreeTerminalPressureState,
  resolveWorkbenchThreeTerminalPressureUpdate,
} from "../src/app/workbench_three_terminal_pressure.ts";
import { WorkbenchThreeCadenceMeter } from "../src/app/workbench_three_runtime.ts";

const options = parseWorkbenchThreePressureProbeCliOptions<ThreeSceneMode>(runtimeHost.args, {
  initialCells: WORKBENCH_THREE_INITIAL_CELLS,
  readbackStrategy: WORKBENCH_THREE_READBACK_STRATEGY,
  mode: "studio",
  modes: threeSceneModes,
  frameIntervalForCells: (cells) => apiWorkbenchThreeFrameIntervalForCells(cells, { live: true }),
});
const {
  frames,
  frameWidth,
  frameHeight,
  panelWidth,
  panelHeight,
  maxCells,
  asciiCells,
  mode,
  glyphs,
  readbackStrategy,
  adaptive,
  fullscreen,
  check,
  minSteadyFrames,
  minGridUpdates,
  minAverageSourceChangedRows,
  minAverageObservedFps,
  minLatestCells,
  intervalMs,
} = options;
const pressurePolicy = fullscreen
  ? API_WORKBENCH_THREE_FULLSCREEN_PRESSURE_POLICY
  : API_WORKBENCH_THREE_PRESSURE_POLICY;
if (fullscreen && maxCells < WORKBENCH_THREE_FULLSCREEN_MIN_CELLS) {
  console.warn(
    `fullscreen probe max-cells ${maxCells} is below fullscreen default ${WORKBENCH_THREE_FULLSCREEN_MIN_CELLS}`,
  );
}

let bytesWritten = 0;
const painter = new WorkbenchAnsiScreenPainter({
  writeSync(data) {
    bytesWritten += data.byteLength;
    return data.byteLength;
  },
});
const frame: WorkbenchFrame = [];
const rowBuffer: string[] = [];
const sourceRowIndexes: number[] = [];
const sourceColumnIndexes: number[] = [];
const rectangle = new Signal({ column: 0, row: 0, width: panelWidth, height: panelHeight }, { deepObserve: true });
const scene = new Signal<ThreeSceneState | null>({
  mode,
  signal: { x: 0.45, y: 0.62, depth: 0.55, twist: 0.35, lift: 0.42, pulse: 0.75, active: true, pressed: false },
});
const ascii = new Signal({
  ...createDefaultWorkbenchAsciiOptions(),
  terminalGlyphStyle: glyphs,
  renderMaxCells: asciiCells,
});
const maxRenderCells = new Signal(maxCells);
const frameInterval = new Signal(intervalMs);
const terminalPressure = createWorkbenchThreeTerminalPressureState(maxCells);
const cadence = new WorkbenchThreeCadenceMeter();
let gridUpdates = 0;
const panel = new ThreePanelFrameView({
  rectangle,
  scene,
  ascii,
  maxRenderCells,
  frameInterval,
  readbackStrategy,
  onFrame: () => {
    gridUpdates += 1;
    cadence.record();
  },
});

const samples: WorkbenchThreePressureProbeSample[] = [];
const previousGrid: string[][] = [];

try {
  for (let index = 1; index <= frames; index += 1) {
    scene.value = {
      mode,
      signal: {
        x: 0.35 + (index % 7) / 20,
        y: 0.5 + (index % 5) / 18,
        depth: 0.48 + (index % 3) / 14,
        twist: 0.25 + (index % 9) / 16,
        lift: 0.35 + (index % 6) / 15,
        pulse: 0.65 + (index % 4) / 12,
        active: true,
        pressed: index % 8 === 0,
      },
    };
    await delay(frameInterval.peek());
    samples.push(drawSample(index));
  }
} finally {
  panel.dispose();
  rectangle.dispose();
  scene.dispose();
  ascii.dispose();
  maxRenderCells.dispose();
  frameInterval.dispose();
}

const summary = summarizeWorkbenchThreePressureProbe(samples);
console.log(
  formatWorkbenchThreePressureProbeSummaryLines(
    {
      mode,
      glyphs,
      readback: readbackStrategy,
      frameWidth,
      frameHeight,
      panelWidth,
      panelHeight,
      maxCells,
      adaptive,
      fullscreen,
      intervalMs: frameInterval.peek(),
      totalBytes: bytesWritten,
    },
    samples,
    summary,
  ).join("\n"),
);

if (check) {
  const validation = validateWorkbenchThreePressureProbeSummary(summary, {
    minSteadyFrames,
    minGridUpdates,
    minAverageSourceChangedRows,
    minAverageObservedFps,
    minLatestCells,
  });
  if (!validation.ok) {
    console.error(`three-workbench pressure probe check failed: ${validation.errors.join("; ")}`);
    runtimeHost.exit(1);
  }
}

function drawSample(index: number): WorkbenchThreePressureProbeSample {
  const prepared = prepareWorkbenchFrame(frame, frameHeight);
  writeFrame(
    prepared,
    frameWidth,
    0,
    0,
    `\x1b[38;2;242;236;255;48;2;32;17;47mTHREE WORKBENCH PRESSURE ${index.toString().padStart(2, "0")}\x1b[0m`,
  );
  const grid = panel.grid.peek();
  const projection = writeWorkbenchThreeGrid(
    prepared,
    { column: 4, row: 3, width: panelWidth, height: panelHeight },
    grid,
    "\x1b[48;2;9;4;15m \x1b[0m",
    {
      scale: "down",
      rowBuffer,
      sourceColumns: grid[0]?.length ?? 0,
      sourceRowIndexes,
      sourceColumnIndexes,
    },
  );
  const stats = painter.flush(prepared, frameWidth, frameHeight, renderFrameRow, renderFrameSlice);
  const performance = panel.inspectPerformance();
  const sourceChangedRows = countWorkbenchThreeProbeChangedGridRows(previousGrid, grid);
  snapshotWorkbenchThreeProbeGridRowsInto(previousGrid, grid);
  const cellsBeforePressureUpdate = maxRenderCells.peek();
  const sampleDurationMs = frameInterval.peek();
  const cadenceInspection = cadence.inspect();
  if (adaptive) {
    const next = resolveWorkbenchThreeTerminalPressureUpdate(terminalPressure, {
      ...pressurePolicy,
      currentCells: cellsBeforePressureUpdate,
      renderedThreeGrids: projection ? 1 : 0,
      renderedThreeRows: projection?.targetHeight ?? 0,
      changedRows: stats.changed,
      bytes: stats.bytes,
      durationMs: stats.durationMs,
      sampleDurationMs,
      observedFps: cadenceInspection.measuredFps,
      observedFrameCount: cadenceInspection.updates,
      targetFps: 1000 / sampleDurationMs,
    });
    terminalPressure.currentCells = next.currentCells;
    terminalPressure.highFrames = next.highFrames;
    terminalPressure.lowFrames = next.lowFrames;
    if (next.changed) {
      maxRenderCells.value = next.currentCells;
      frameInterval.value = apiWorkbenchThreeFrameIntervalForCells(next.currentCells, { live: true });
    }
  }
  return {
    index,
    maxCells: cellsBeforePressureUpdate,
    sampleDurationMs,
    rendererMs: performance?.totalMs ?? 0,
    initMs: performance?.initMs ?? 0,
    sceneMs: performance?.sceneMs ?? 0,
    sceneUpdateMs: performance?.sceneUpdateMs,
    sceneRenderMs: performance?.sceneRenderMs,
    readbackMs: performance?.readbackMs ?? 0,
    assemblyMs: performance?.assemblyMs ?? 0,
    flushMs: stats.durationMs,
    bytes: stats.bytes,
    changedRows: stats.changed,
    sourceChangedRows,
    observedFps: cadenceInspection.measuredFps,
    observedFrameCount: cadenceInspection.updates,
    gridUpdates,
    columns: performance?.columns ?? grid[0]?.length ?? 0,
    rows: performance?.rows ?? grid.length,
    cells: performance?.cells ?? (grid[0]?.length ?? 0) * grid.length,
  };
}
