import type { RuntimeSystemMemoryInfo } from "../src/runtime/host.ts";
import {
  AnsiCanvasSink,
  AsyncScheduler,
  type BenchmarkCase,
  blitWorkbenchFrameCells,
  BoxObject,
  Canvas,
  CommandRegistry,
  commandSurfaceItems,
  createCommandSearchIndex,
  createMouseInteractionRouter,
  createRenderLoop,
  createStandardComponentThemeDefinitions,
  createTerminalWorkspaceController,
  createThemeProvider,
  createThemeProviderReport,
  cropToWidth,
  decodeBuffer,
  DirtyRegion,
  emptyStyle,
  filterDataRows,
  flexRects,
  getMultiCodePointCharacters,
  MemoryCanvasSink,
  prepareWorkbenchFrame,
  queryLocalData,
  renderFrameRow,
  renderFrameSlice,
  renderSparkline,
  runTaskBatch,
  searchCommandSearchIndex,
  searchCommandSurfaceItems,
  Signal,
  standardThemeComponentNames,
  TableController,
  terminalWorkspacePaneRects,
  TextObject,
  textWidth,
  tileRects,
  updateWorkbenchLineSignals,
  updateWorkbenchStringLineSignals,
  visibleListRows,
  WindowManagerController,
  WorkbenchAnsiScreenPainter,
  type WorkbenchFrame,
  type WorkbenchFrameBoxLine,
  workbenchTerminalCopyRowsInto,
  type WorkbenchTerminalPaneProjection,
  workbenchTerminalPaneTitleRenderCommandsInto,
  workbenchVisibleWindowRectsInto,
  wrapTextBoxLinesInto,
  writeFrame,
  writeFrameCells,
  writeStringFrameRow,
} from "../mod.ts";
import { ThreeAsciiObject } from "../mod.three_ascii.ts";
import { createHtmlCssLayoutDemo } from "../src/markup/demo_fixtures.ts";
import { AudioRegistry, resolveSourceFramesInto } from "../app/sources.ts";
import {
  type RowStyle,
  type ThreeHeaderPerformance,
  threeHeaderRowsInto,
  type WorkbenchRowTheme,
} from "../src/app/workbench_rows.ts";
import {
  type WorkbenchFrameRenderCommand,
  workbenchFrameRenderCommandsInto,
} from "../src/app/workbench_frame_render.ts";
import {
  currentWorkspaceVisualizationIdsInto,
  currentWorkspaceWindowsInto,
} from "../src/app/workbench_workspace_menu.ts";
import {
  createWorkbenchThreeTerminalPressureState,
  resolveWorkbenchThreeTerminalPressureBudget,
} from "../src/app/workbench_three_terminal_pressure.ts";
import { writeWorkbenchThreeGrid } from "../src/app/workbench_three_grid.ts";
import {
  scaleThreePanelGridToSize,
  scaleThreePanelGridToSizeInto,
  ThreePanelGridPublicationCache,
  ThreePanelGridScaleCache,
} from "../src/app/three_panel_core.ts";
import {
  API_WORKBENCH_THREE_FULLSCREEN_PRESSURE_POLICY,
  apiWorkbenchThreeFrameIntervalForCells,
  WORKBENCH_THREE_FULLSCREEN_MAX_CELLS,
  WORKBENCH_THREE_FULLSCREEN_MIN_CELLS,
  WORKBENCH_THREE_FULLSCREEN_PRESSURE_FLOOR_CELLS,
} from "../src/app/workbench_three_policy.ts";
import { resolveThreePanelAdaptiveRenderBudget } from "../src/app/three_panel_policy.ts";
import { LayoutMeasurementCache, simpleLayoutSolver } from "../src/layout/mod.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { SystemMonitor } from "../app/system_metrics.ts";
import type {
  SystemMetricsCommandOutput,
  SystemMetricsDirEntry,
  SystemMetricsNetworkInterface,
  SystemMetricsProvider,
} from "../app/system_metrics.ts";
import { syntheticWorkbenchSystem } from "../app/visualization_primitives.ts";
import { cpuHexTileLayoutInto } from "../app/visualization_system.ts";
import {
  queueRerenderCellInto,
  queueRerenderRangeInto,
  queueRerenderRangeOnlyInto,
} from "../src/canvas/rerender_queue.ts";
import { threeAsciiBenchmarkCases } from "./benchmark_three_ascii.ts";

const sparklineValues = Array.from({ length: 200 }, (_, index) => Math.sin(index / 8));
const ansiSinkStyledRangeValues = Array.from(
  { length: 160 },
  () => "\x1b[38;2;242;236;255;48;2;66;37;95m█\x1b[0m\x1b[0m",
);
const ansiSinkTruecolorBackgroundValues = Array.from({ length: 160 }, (_, index) => {
  const red = (index * 17) % 256;
  const green = (64 + index * 13) % 256;
  const blue = (160 + index * 7) % 256;
  return `\x1b[48;2;${red};${green};${blue}m \x1b[0m`;
});
const ansiStyledSplitRow = "\x1b[38;2;242;236;255;48;2;66;37;95m".concat(" ".repeat(160), "\x1b[0m\x1b[0m");
const plainAsciiSplitRow = "api-workbench plain ascii row ".concat(".".repeat(132));
const plainWorkbenchFrameRow = Array.from(
  { length: 168 },
  (_, index) => "api-workbench-status-bar-and-menu-row"[index % 37] ?? " ",
);
const ansiSinkStyledRangeStats = {
  updatedObjects: 0,
  renderedObjects: 0,
  rerenderedObjects: 0,
  intersectionUpdates: 0,
  intersectionCandidateChecks: 0,
  intersectionsDirty: false,
  dirtyRectangles: 0,
  dirtyRowRanges: 1,
  dirtyRows: 1,
  dirtyCells: ansiSinkStyledRangeValues.length,
  fullRedraws: 0,
  flushedCells: ansiSinkStyledRangeValues.length,
};
const ansiSinkTruecolorBackgroundStats = {
  ...ansiSinkStyledRangeStats,
  dirtyCells: ansiSinkTruecolorBackgroundValues.length,
  flushedCells: ansiSinkTruecolorBackgroundValues.length,
};
let ansiSinkBytes = 0;
let ansiStyledSplitChecksum = 0;
let plainAsciiSplitChecksum = 0;
let plainWorkbenchRowChecksum = 0;
let blankWorkbenchRowChecksum = 0;
const ansiSink = new AnsiCanvasSink({
  stdout: {
    writeSync(data) {
      ansiSinkBytes += data.length;
      return data.length;
    },
  },
});
const textObjectFullRowCanvasBenchmark = createTextObjectFullRowCanvasBenchmark({ columns: 220, rows: 70 });
const workbenchThreeGridSourceColumns = 109;
const workbenchThreeGridSourceRows = 34;
const workbenchThreeGridTargetColumns = 220;
const workbenchThreeGridTargetRows = 70;
const workbenchThreeGridFrame: WorkbenchFrame = [];
const workbenchThreeGridRowBuffer: string[] = [];
const workbenchThreeGridSourceRowIndexes: number[] = [];
const workbenchThreeGridSourceColumnIndexes: number[] = [];
const workbenchThreeGridSource = Array.from(
  { length: workbenchThreeGridSourceRows },
  (_, row) =>
    Array.from({ length: workbenchThreeGridSourceColumns }, (_, column) => {
      const red = (row * 17 + column * 11) % 256;
      const green = (64 + row * 7 + column * 13) % 256;
      const blue = (160 + row * 5 + column * 3) % 256;
      return `\x1b[48;2;${red};${green};${blue}m \x1b[0m`;
    }),
);
const workbenchThreeGridSparseSource = Array.from(
  { length: workbenchThreeGridSourceRows },
  (_, row) => row % 3 === 0 ? workbenchThreeGridSource[row] : undefined,
);
let workbenchThreeGridChecksum = 0;
const threePanelScaleSourceGrid = Array.from(
  { length: 34 },
  (_, row) =>
    Array.from({ length: 109 }, (_, column) => {
      const red = (row * 17 + column * 11) % 256;
      const green = (64 + row * 7 + column * 13) % 256;
      const blue = (160 + row * 5 + column * 3) % 256;
      return `\x1b[48;2;${red};${green};${blue}m \x1b[0m`;
    }),
);
const threePanelScaleTargetGrid: string[][] = [];
const threePanelScaleCache = new ThreePanelGridScaleCache();
const threePanelPublicationCache = new ThreePanelGridPublicationCache();
let threePanelPublicationRevision = 0;
let threePanelScaleChecksum = 0;
const workbenchThreeBlockFrameWidth = 168;
const workbenchThreeBlockFrameRows = 54;
const workbenchThreeBlockPanelColumn = 96;
const workbenchThreeBlockPanelRow = 12;
const workbenchThreeBlockPanelWidth = 40;
const workbenchThreeBlockPanelRows = 24;
const workbenchThreeBlockFrame: WorkbenchFrame = [];
const workbenchThreeBlockPanelCells = new Array<string>(workbenchThreeBlockPanelWidth);
let workbenchThreeBlockWave = 0;
let workbenchThreeBlockChecksum = 0;
let workbenchThreeBlockBytesWritten = 0;
const workbenchThreeBlockPainter = new WorkbenchAnsiScreenPainter({
  writeSync(data) {
    workbenchThreeBlockBytesWritten += data.byteLength;
    return data.byteLength;
  },
});
const ansiRichRows = Array.from({ length: 250 }, (_, index) => {
  const red = (index * 17) % 256;
  const green = (index * 29) % 256;
  const blue = (index * 47) % 256;
  const label = `process-${index.toString().padStart(4, "0")}`;
  return `\x1b[38;2;${red};${green};${blue}m${label}\x1b[0m ` +
    `\x1b[48;2;${blue};${red};${green}m ${"█".repeat((index % 18) + 1)} \x1b[0m ` +
    `cpu=${(index * 7) % 100}% mem=${(index * 13) % 100}%`;
});
const textBoxWrapRows = Array.from({ length: 250 }, (_, index) => [
  `note-${index.toString().padStart(3, "0")} alpha beta gamma delta epsilon zeta eta theta`,
  `wrapped control row ${index % 11} with keyboard mouse and theme state`,
  index % 5 === 0 ? "" : `tail segment ${index} tracks cursor projection and viewport stability`,
]).flat();
const textBoxWrapVisualLines: ReturnType<typeof wrapTextBoxLinesInto> = [];
const workbenchThreeHeaderTheme: WorkbenchRowTheme = {
  buttonActiveText: "#09040f",
  buttonActiveBg: "#9cff4f",
  muted: "#b7a4c8",
  panelSoft: "#2f1b44",
  soft: "#d9c8f0",
  surface: "#42255f",
};
const workbenchThreeHeaderModes = ["BLOCKS", "GLYPHS", "MIXED", "KITTY"];
const workbenchThreeHeaderWidths = [30, 48, 80, 132];
const workbenchThreeHeaderPerformance: ThreeHeaderPerformance = {
  totalMs: 17.4,
  initMs: 0,
  sceneMs: 12.2,
  readbackMs: 4.1,
  assemblyMs: 1.3,
  cells: 1_920,
  sourceMaxCells: 3_840,
  targetFps: 14.2,
  deferredReadbackSlots: 6,
  deferredReadbackUnresolved: 2,
};
const workbenchThreeHeaderRows: RowStyle[] = [];
const workbenchThreePressureLevels = [120, 240, 480, 960] as const;
const workbenchThreePressureState = createWorkbenchThreeTerminalPressureState(960);
const workbenchThreeFullscreenPressureState = createWorkbenchThreeTerminalPressureState(
  WORKBENCH_THREE_FULLSCREEN_MIN_CELLS,
);
let workbenchThreePressureChecksum = 0;
let workbenchThreeFullscreenPressureChecksum = 0;
let threePanelAdaptiveChecksum = 0;
const terminalInputEncoder = new TextEncoder();
const terminalInputDecodeBatch = terminalInputEncoder.encode(
  [
    "api-workbench",
    "\x1b[A",
    "\x1b[B",
    "\x1b[<0;7;5M",
    "\x1b[<0;7;5m",
    "\x1b[I",
    "\x1b[O",
    "\x1b[200~deno task test\nprintf '\\x1b[32mok\\x1b[0m'\x1b[201~",
    "x",
  ].join(""),
);
const terminalScreenTranscript = [
  "\x1b]0;cos@old-donkey:~/projects/deno_tui\x07",
  "\x1b[?25l",
  "cos@old-donkey:~/projects/deno_tui$ deno task health\r\n",
  "\x1b[38;5;34mTask\x1b[0m health deno run -A ./scripts/health.ts\r\n",
  "Checked 523 files\r\n",
  "\x1b[38;2;120;200;255mok\x1b[0m benchmark summary: 23 cases, 0 failed\r\n",
  "\x1b[?1049h\x1b[1;1H\x1b[1;32mFULLSCREEN APP\x1b[0m\r\n\x1b[6 q",
  "\x1b[4hinsert\x1b[4l replace\x1b[2;1H\x1b[2Kready",
  "\x1b[?1049l\x1b[?25h",
  "\x1b]8;id=docs;https://example.test/docs\x1b\\docs\x1b]8;;\x1b\\\r\n",
];
const terminalScreenChunks = terminalScreenTranscript.map((chunk) => new TextEncoder().encode(chunk));
const terminalCopyVisibleRows = Array.from(
  { length: 96 },
  (_, index) => `scrollback ${index.toString().padStart(3, "0")} ${"terminal copy projection ".repeat(3)}`,
);
const terminalCopyRowBuffer: ReturnType<typeof workbenchTerminalCopyRowsInto> = [];
const terminalPaneTitleProjections: WorkbenchTerminalPaneProjection[] = Array.from({ length: 60 }, (_, index) => {
  const width = 18 + (index % 9) * 3;
  const column = (index % 6) * 36;
  const row = Math.floor(index / 6) * 5;
  const active = index % 7 === 0;
  return {
    paneId: `pane-${index}`,
    sessionId: `shell-${index}`,
    rect: { column, row, width, height: 4 },
    contentRect: { column, row: row + 1, width, height: 3 },
    active,
    zoomed: false,
    titleVisible: true,
    title: `${active ? ">" : " "} Shell ${index}`,
  };
});
const terminalPaneTitleBuffer: ReturnType<typeof workbenchTerminalPaneTitleRenderCommandsInto> = [];

class BenchmarkLineSignal {
  writes = 0;

  constructor(private current: string) {}

  peek(): string {
    return this.current;
  }

  set value(value: string) {
    this.writes += 1;
    this.current = value;
  }
}

interface TextObjectFullRowCanvasBenchmark {
  run(): void;
}

function createTextObjectFullRowCanvasBenchmark(options: {
  columns: number;
  rows: number;
}): TextObjectFullRowCanvasBenchmark {
  const columns = Math.max(1, Math.floor(options.columns));
  const rows = Math.max(1, Math.floor(options.rows));
  let sinkBytes = 0;
  const sink = new AnsiCanvasSink({
    stdout: {
      writeSync(data) {
        sinkBytes += data.length;
        return data.length;
      },
    },
  });
  const canvas = new Canvas({
    sink,
    size: { columns, rows },
  });
  const frameRows = Array.from({ length: rows }, (_, row) => {
    const baseRed = (row * 11) % 256;
    const baseGreen = (64 + row * 7) % 256;
    const baseBlue = (130 + row * 5) % 256;
    return [
      `\x1b[38;2;242;236;255;48;2;${baseRed};${baseGreen};${baseBlue}m${" ".repeat(columns)}\x1b[0m`,
      `\x1b[38;2;242;236;255;48;2;${(baseRed + 37) % 256};${(baseGreen + 53) % 256};${(baseBlue + 71) % 256}m${
        "█".repeat(columns)
      }\x1b[0m`,
    ] satisfies [string, string];
  });
  const lineSignals = frameRows.map((lines, row) => {
    const signal = new Signal<string>(lines[0]);
    new TextObject({
      canvas,
      rectangle: { column: 0, row, width: columns },
      value: signal,
      overwriteRectangle: true,
      multiCodePointSupport: true,
      style: (text) => text,
      zIndex: 1,
    }).draw();
    return signal;
  });
  canvas.render();
  let frameIndex = 0;

  return {
    run() {
      frameIndex = 1 - frameIndex;
      sinkBytes = 0;
      for (let row = 0; row < rows; row += 1) {
        lineSignals[row]!.value = frameRows[row]![frameIndex];
      }
      canvas.render();
      if (sinkBytes <= rows * columns) {
        throw new Error("text object canvas workload did not flush styled full rows");
      }
    },
  };
}

const workbenchSparseFrame: WorkbenchFrame = [];
const workbenchStringFrame: string[] = [];
const workbenchLineSignalFrame: WorkbenchFrame = [];
const workbenchAnsiScreenFrame: WorkbenchFrame = [];
const workbenchAnsiSpanFrame: WorkbenchFrame = [];
const workbenchCellBlitSourceFrame: WorkbenchFrame = [];
const workbenchCellBlitTargetFrame: WorkbenchFrame = [];
const workbenchFrameRows = 54;
const workbenchFrameWidth = 168;
const workbenchFrameRenderTheme = {
  background: "#09040f",
  panel: "#1a1027",
  panelSoft: "#2f1b44",
  border: "#6d4a8b",
  borderStrong: "#9b78c8",
  accent: "#9cff4f",
};
const workbenchFrameRenderLines: WorkbenchFrameBoxLine[] = [];
const workbenchFrameRenderCommands: WorkbenchFrameRenderCommand[] = [];
const workbenchVisibleWindowSource = new Map<string, { column: number; row: number; width: number; height: number }>();
const workbenchVisibleWindowTarget = new Map<string, { column: number; row: number; width: number; height: number }>();
for (let index = 0; index < 60; index += 1) {
  workbenchVisibleWindowSource.set(`window-${index}`, {
    column: (index % 3) * 56,
    row: Math.floor(index / 3) * 18,
    width: 54,
    height: 16,
  });
}
const workbenchLineSignals = Array.from(
  { length: workbenchFrameRows + 10 },
  () => new BenchmarkLineSignal(""),
);
let workbenchAnsiScreenBytes = 0;
const workbenchAnsiScreenPainter = new WorkbenchAnsiScreenPainter({
  writeSync(data) {
    workbenchAnsiScreenBytes += data.byteLength;
    return data.byteLength;
  },
});
let workbenchAnsiSpanBytes = 0;
const workbenchAnsiSpanPainter = new WorkbenchAnsiScreenPainter({
  writeSync(data) {
    workbenchAnsiSpanBytes += data.byteLength;
    return data.byteLength;
  },
});
let workbenchFrameChecksum = 0;
let workbenchLineSignalFrameIndex = 0;
let workbenchCellBlitWave = 0;
const workbenchPrefilledBlitSource = prepareWorkbenchFrame([], workbenchFrameRows);
const workbenchPrefilledBlitTarget = prepareWorkbenchFrame([], workbenchFrameRows);
for (let row = 0; row < workbenchFrameRows; row += 1) {
  const line = workbenchPrefilledBlitSource[row]!;
  for (let column = 0; column < workbenchFrameWidth + 40; column += 1) {
    const red = (row * 7 + column * 5) % 256;
    const green = (40 + row * 11 + column * 2) % 256;
    const blue = (120 + row * 3 + column * 13) % 256;
    line[column] = `\x1b[48;2;${red};${green};${blue}m \x1b[0m`;
  }
}
const largeListItems = Array.from({ length: 50_000 }, (_, index) => `process-${index.toString().padStart(5, "0")}`);
const largeTable = new TableController({ rowCount: 100_000, viewportHeight: 44 });
const largeDataRows = Array.from({ length: 25_000 }, (_, index) => ({
  id: index,
  name: `process-${index.toString().padStart(5, "0")}`,
  state: index % 7 === 0 ? "running" : index % 5 === 0 ? "sleeping" : "idle",
  owner: index % 3 === 0 ? "system" : "user",
  cpu: (index * 17) % 100,
}));
const largeDataColumns = [
  { id: "id", width: 8 },
  { id: "name", width: 18 },
  { id: "state", width: 10 },
  { id: "owner", width: 10 },
  { id: "cpu", width: 6 },
] as const;
const benchmarkAudioRegistry = new AudioRegistry([]);
const benchmarkSourceSystem = syntheticWorkbenchSystem(42, "Monitor", { cpuCoreCount: 88, timestamp: 1_000 });
const benchmarkSourceIds = ["sys:cpu", "sys:gpu", "sys:memory", "sys:network", "sys:alerts"];
const benchmarkSourceFrameBuffer: ReturnType<typeof resolveSourceFramesInto> = [];
const benchmarkCpuHexTileBuffer: ReturnType<typeof cpuHexTileLayoutInto> = [];
const benchmarkWorkspaceWindowIds = Array.from(
  { length: 80 },
  (_, index) => index % 4 === 0 ? `panel-${index}` : `viz:${index}`,
);
const benchmarkWorkspaceVisualizationIds = Object.fromEntries(
  benchmarkWorkspaceWindowIds
    .filter((id) => id.startsWith("viz:") && Number(id.slice(4)) % 7 !== 0)
    .map((id) => [id, `source-${id.slice(4)}`]),
) as Partial<Record<string, string>>;
const benchmarkWorkspaceWindows: ReturnType<typeof currentWorkspaceWindowsInto<string, { preset: string }>> = [];
const benchmarkWorkspaceVisualizationIdBuffer: string[] = [];
let benchmarkWorkspaceChecksum = 0;
const commandSearchRegistry = new CommandRegistry();
for (let index = 0; index < 1_000; index += 1) {
  commandSearchRegistry.register({
    id: `workspace.${index % 25}.service.${index}`,
    label: `${index % 3 === 0 ? "Restart" : index % 3 === 1 ? "Inspect" : "Open"} ${
      index % 2 === 0 ? "GPU" : "Monitor"
    } Service ${index}`,
    group: index % 5 === 0 ? "system" : "workspace",
    description: `Synthetic command ${index}`,
    keywords: [
      index % 2 === 0 ? "gpu" : "cpu",
      index % 7 === 0 ? "critical" : "normal",
      `service-${index % 40}`,
    ],
    disabled: index % 37 === 0,
  });
}
const commandSearchIndex = createCommandSearchIndex(commandSurfaceItems(commandSearchRegistry));
const resizeBounds = Array.from({ length: 96 }, (_, index) => ({
  column: 0,
  row: 0,
  width: 72 + (index % 12) * 12,
  height: 24 + (index % 8) * 4,
}));
const windowManagerBenchmarkBounds = resizeBounds.slice(0, 24);
const benchmarkWindowManager = new WindowManagerController({
  activeId: "bench-0",
  tileOptions: { minTileWidth: 28, minTileHeight: 8, allowVerticalOverflow: true },
  windows: Array.from({ length: 18 }, (_, index) => ({
    id: `bench-${index}`,
    title: `Bench ${index}`,
    minWidth: 24 + index % 6,
    minHeight: 7 + index % 4,
  })),
});
let windowManagerBenchmarkStep = 0;
const terminalWorkspaceBenchmark = createTerminalWorkspaceController({ now: () => 1_000 });
for (let index = 0; index < 24; index += 1) {
  terminalWorkspaceBenchmark.add({
    id: `shell-${index}`,
    title: `Shell ${index}`,
    kind: "command",
    command: "bash",
    cwd: `/tmp/work-${index % 4}`,
  });
  if (index > 0) {
    terminalWorkspaceBenchmark.splitActive(index % 2 === 0 ? "row" : "column", `shell-${index}`);
  }
}
let terminalWorkspaceBenchmarkStep = 0;
const mouseRouter = createMouseInteractionRouter();
const dirtyRegionRectangles = Array.from({ length: 400 }, (_, index) => ({
  column: (index * 7) % 180,
  row: (index * 5) % 70,
  width: 8 + (index % 17),
  height: 2 + (index % 9),
}));
const dirtyRegionProbeRectangles = Array.from({ length: 300 }, (_, index) => ({
  column: (index * 11) % 190,
  row: (index * 3) % 76,
  width: 4 + (index % 23),
  height: 1 + (index % 11),
}));

for (let index = 0; index < 500; index += 1) {
  mouseRouter.register({
    id: `target-${index}`,
    bounds: {
      column: (index % 25) * 6,
      row: Math.floor(index / 25) * 2,
      width: 5,
      height: 2,
    },
    zIndex: index % 7,
    onPress: () => true,
  });
}

function runCanvasOverlapWorkload(): void {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 160, rows: 48 },
  });

  for (let index = 0; index < 72; index += 1) {
    const box = new BoxObject({
      canvas,
      style: emptyStyle,
      zIndex: index,
      rectangle: {
        column: (index * 9) % 132,
        row: (index * 5) % 36,
        width: 18 + (index % 7),
        height: 6 + (index % 5),
      },
      filler: String.fromCharCode(65 + (index % 26)),
    });
    box.draw();
  }

  canvas.render();
  sink.clear();

  const modal = new BoxObject({
    canvas,
    style: emptyStyle,
    zIndex: 500,
    rectangle: { column: 30, row: 8, width: 82, height: 24 },
    filler: "#",
  });
  modal.draw();
  canvas.render();

  for (let step = 0; step < 6; step += 1) {
    modal.rectangle.value = {
      column: 24 + step * 4,
      row: 6 + (step % 3),
      width: 82,
      height: 24,
    };
    canvas.render();
  }

  modal.erase();
  canvas.render();

  const finalStats = sink.lastStats;
  if ((finalStats?.flushedCells ?? 0) === 0) {
    throw new Error("canvas overlap workload did not flush any cells");
  }
  if ((finalStats?.fullRedraws ?? 0) > 0 || (finalStats?.flushedCells ?? Number.POSITIVE_INFINITY) >= 160 * 48) {
    throw new Error("canvas overlap workload regressed to full-screen redraw");
  }
}

function runDirtyRegionWorkload(): void {
  const region = DirtyRegion.fromRectangles(dirtyRegionRectangles);
  let intersections = 0;
  for (const rectangle of dirtyRegionProbeRectangles) {
    intersections += region.intersections(rectangle).length;
  }
  if (region.isEmpty() || intersections <= 0) {
    throw new Error("dirty region workload did not produce intersections");
  }
}

function runTextBoxWrapWorkload(): void {
  const rows = wrapTextBoxLinesInto(textBoxWrapVisualLines, textBoxWrapRows, 31, { wordWrap: true });
  let checksum = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    checksum += row.text.length + row.lineIndex + row.startColumn + (row.continuation ? 1 : 0);
  }
  if (rows.length < textBoxWrapRows.length || checksum <= 0) {
    throw new Error("textbox wrap workload produced no wrapped rows");
  }
}

function runSourceFrameResolutionWorkload(): void {
  let checksum = 0;
  for (let step = 0; step < 24; step += 1) {
    const frames = resolveSourceFramesInto(
      benchmarkSourceFrameBuffer,
      benchmarkSourceIds,
      benchmarkSourceSystem,
      benchmarkAudioRegistry,
      step,
    );
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index]!;
      checksum += frame.id.length + frame.detailLines.length + Math.round(frame.value * 100);
    }
  }
  if (benchmarkSourceFrameBuffer.length !== benchmarkSourceIds.length || checksum <= 0) {
    throw new Error("source frame resolution workload produced invalid frames");
  }
}

function runCpuHexTileLayoutWorkload(): void {
  let checksum = 0;
  for (let step = 0; step < 48; step += 1) {
    const width = 48 + (step % 6) * 12;
    const height = 8 + (step % 4) * 3;
    const tiles = cpuHexTileLayoutInto(benchmarkCpuHexTileBuffer, benchmarkSourceSystem.cpuCores, width, height);
    for (let index = 0; index < tiles.length; index += 1) {
      const tile = tiles[index]!;
      checksum += tile.column + tile.row + tile.width + tile.height + tile.label.length;
    }
  }
  if (benchmarkCpuHexTileBuffer.length !== benchmarkSourceSystem.cpuCores.length || checksum <= 0) {
    throw new Error("CPU hex tile layout workload produced invalid tiles");
  }
}

function runWindowManagerChurnWorkload(): void {
  for (let index = 0; index < windowManagerBenchmarkBounds.length; index += 1) {
    const step = windowManagerBenchmarkStep + index;
    const id = `bench-${step % 18}`;
    switch (step % 6) {
      case 0:
        benchmarkWindowManager.focus(id);
        break;
      case 1:
        benchmarkWindowManager.fullscreen(id);
        break;
      case 2:
        benchmarkWindowManager.minimize(id);
        break;
      case 3:
        benchmarkWindowManager.restore(id);
        break;
      case 4:
        benchmarkWindowManager.move(id, step % 2 === 0 ? 1 : -1);
        break;
      default:
        benchmarkWindowManager.upsert({ id, title: `Bench ${id}`, state: "normal" });
        break;
    }
    const layout = benchmarkWindowManager.layout({ bounds: windowManagerBenchmarkBounds[index]! });
    if (layout.zOrder.length > 0 && layout.zOrder.at(-1)?.closed) {
      throw new Error("window manager churn exposed a closed top window");
    }
  }
  windowManagerBenchmarkStep = (windowManagerBenchmarkStep + windowManagerBenchmarkBounds.length) % 10_000;
}

function runTerminalWorkspaceLayoutWorkload(): void {
  const sessionId = `shell-${terminalWorkspaceBenchmarkStep % 24}`;
  terminalWorkspaceBenchmark.activate(sessionId);
  if (terminalWorkspaceBenchmarkStep % 5 === 0) {
    terminalWorkspaceBenchmark.toggleZoomPane();
  } else if (terminalWorkspaceBenchmark.inspectLayout().zoomedPaneId) {
    terminalWorkspaceBenchmark.toggleZoomPane();
  }
  if (terminalWorkspaceBenchmarkStep % 3 === 0) {
    terminalWorkspaceBenchmark.resizeActiveSplit(terminalWorkspaceBenchmarkStep % 2 === 0 ? 0.04 : -0.04);
  }
  const bounds = resizeBounds[terminalWorkspaceBenchmarkStep % resizeBounds.length]!;
  const rects = terminalWorkspacePaneRects(terminalWorkspaceBenchmark.inspectLayout(), bounds, {
    gap: terminalWorkspaceBenchmarkStep % 2,
  });
  if (rects.length === 0 || rects.some((entry) => entry.rect.width < 0 || entry.rect.height < 0)) {
    throw new Error("terminal workspace pane projection produced invalid rectangles");
  }
  terminalWorkspaceBenchmarkStep = (terminalWorkspaceBenchmarkStep + 1) % 10_000;
}

function runApiWorkbenchFrameWorkload(): void {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 168, rows: 52 },
  });

  drawWorkbenchText(canvas, "API WORKBENCH  [File] View Layout Theme Help", 0, 0, 168);
  drawWorkbenchText(canvas, "F10 menu  N new  Shift+T themes  G config  Q quit", 0, 50, 168);

  const panes = [
    { title: "INSPECTOR", column: 1, row: 2, width: 70, height: 21 },
    { title: "DATA TABLE", column: 73, row: 2, width: 94, height: 21 },
    { title: "CONTROLS", column: 1, row: 24, width: 70, height: 22 },
    { title: "LOGS", column: 73, row: 24, width: 94, height: 22 },
  ];

  for (const [paneIndex, pane] of panes.entries()) {
    new BoxObject({
      canvas,
      style: emptyStyle,
      zIndex: paneIndex,
      rectangle: pane,
      filler: " ",
    }).draw();
    drawWorkbenchText(canvas, `[${pane.title}]`, pane.column + 2, pane.row, Math.min(18, pane.width - 4), 20);
    drawWorkbenchText(canvas, "[-] [□] [↻] [x]", pane.column + pane.width - 18, pane.row, 17, 20);
  }

  for (let row = 0; row < 15; row += 1) {
    drawWorkbenchText(
      canvas,
      `${row === 0 ? ">" : " "} Surface ${row.toString().padStart(2, "0")}  ${
        ["runtime", "layout", "data", "theme"][row % 4]
      }  ${["ready", "active", "queued", "tracked"][row % 4]}  ${row * 7}ms`,
      75,
      5 + row,
      88,
      30,
    );
  }

  const controlRows = [
    "[ Run Action ] presses=0",
    "Slider     ████████░░░░░░  6/10",
    "Checkbox   ✓ live   x compact",
    "Radio      > Fast",
    "Combo      Unit-01 Signal",
    "Dropdown   [ Diagnostics v]",
    "Input      deno task health",
    "Textbox    Editable notes / click controls or type here",
    "Progress   ███████░░░░ 42%",
  ];
  for (const [index, text] of controlRows.entries()) {
    drawWorkbenchText(canvas, text, 4, 27 + index, 64, 30);
  }

  for (let row = 0; row < 18; row += 1) {
    drawWorkbenchText(
      canvas,
      `log ${row.toString().padStart(2, "0")} workbench controller rendered synthetic row with wrapped diagnostics`,
      75,
      27 + row,
      88,
      30,
    );
  }

  canvas.render();
  sink.clear();

  drawWorkbenchText(canvas, "recent action: render tick updated table selection", 4, 18, 64, 40);
  drawWorkbenchText(canvas, "> Surface 07  data     selected  49ms", 75, 12, 88, 40);
  canvas.render();

  const modal = new BoxObject({
    canvas,
    style: emptyStyle,
    zIndex: 1_000,
    rectangle: { column: 45, row: 14, width: 78, height: 16 },
    filler: " ",
  });
  modal.draw();
  drawWorkbenchText(canvas, "HELP", 48, 15, 12, 1_001);
  drawWorkbenchText(
    canvas,
    "Keyboard: arrows move focus, Tab cycles windows, Enter activates controls.",
    48,
    18,
    72,
    1_001,
  );
  drawWorkbenchText(canvas, "Mouse: click rows, drag sliders, wheel scrolls active windows.", 48, 20, 72, 1_001);
  drawWorkbenchText(canvas, "[ Cancel ]  [ Apply ]  [ OK ]", 68, 27, 34, 1_001);
  canvas.render();
  modal.erase();
  canvas.render();

  if ((sink.lastStats?.flushedCells ?? 0) === 0) {
    throw new Error("API Workbench frame workload did not flush any cells");
  }
}

const rerenderQueueBenchmarkSize = { columns: 160, rows: 50 };
const rerenderQueueBenchmarkView = { column: 12, row: 4, width: 100, height: 32 };
const rerenderQueueCellQueue: Array<Set<number> | undefined> = [];
const rerenderQueueRangeQueue: Array<Array<{ row: number; startColumn: number; endColumn: number }> | undefined> = [];
const threeAsciiRangeFrameRow: string[] = [];
const threeAsciiRangeOutputRow = Array.from(
  { length: 160 },
  (_, column) => `\x1b[48;2;${column % 256};${(120 + column * 3) % 256};${(220 + column * 7) % 256}m \x1b[0m`,
);
const threeAsciiRangeSegments = [
  { row: 8, startColumn: 12, endColumn: 84 },
  { row: 8, startColumn: 90, endColumn: 148 },
];
const threeAsciiRangeCanvas = new Canvas({
  sink: new MemoryCanvasSink(),
  size: { columns: 160, rows: 20 },
});
const threeAsciiRangeObject = new ThreeAsciiObject({
  canvas: threeAsciiRangeCanvas,
  rectangle: { column: 4, row: 8, width: 150, height: 1 },
  scene: {} as never,
  camera: {} as never,
  style: emptyStyle,
  zIndex: 1,
  rendererFactory: () => ({
    scene: {} as never,
    camera: {} as never,
    setSize: () => {},
    setEffectOptions: () => {},
    getTerminalEdgeBias: () => 1,
    setTerminalEdgeBias: () => {},
    getTerminalGlyphStyle: () => "blocks" as const,
    setTerminalGlyphStyle: () => {},
    renderToAnsiGrid: () => Promise.resolve([]),
    destroy: () => {},
  }),
});
let threeAsciiRangeChecksum = 0;

function runDenseRerenderRangeQueueWorkload(): void {
  for (let step = 0; step < 50; step += 1) {
    const row = step % rerenderQueueBenchmarkSize.rows;
    queueRerenderRangeOnlyInto(rerenderQueueRangeQueue, row, 0, rerenderQueueBenchmarkSize.columns, {
      columns: rerenderQueueBenchmarkSize.columns,
      rows: rerenderQueueBenchmarkSize.rows,
    });
  }
  clearRerenderRangeBenchmarkQueue();
}

function runSparseRerenderCellQueueWorkload(): void {
  for (let step = 0; step < 1_000; step += 1) {
    queueRerenderCellInto(
      rerenderQueueCellQueue,
      step % rerenderQueueBenchmarkSize.rows,
      (step * 17) % rerenderQueueBenchmarkSize.columns,
      rerenderQueueBenchmarkSize,
    );
  }
  clearRerenderCellBenchmarkQueue();
}

function runClippedRerenderRangeQueueWorkload(): void {
  for (let step = 0; step < 120; step += 1) {
    queueRerenderRangeInto(
      rerenderQueueCellQueue,
      step % rerenderQueueBenchmarkSize.rows,
      -8 + step % 19,
      rerenderQueueBenchmarkSize.columns + 8,
      rerenderQueueBenchmarkSize,
      rerenderQueueBenchmarkView,
    );
  }
  clearRerenderCellBenchmarkQueue();
}

function runFractionalRerenderCellQueueWorkload(): void {
  for (let step = 0; step < 1_000; step += 1) {
    queueRerenderCellInto(
      rerenderQueueCellQueue,
      step % rerenderQueueBenchmarkSize.rows,
      ((step * 13) % rerenderQueueBenchmarkSize.columns) + 0.75,
      rerenderQueueBenchmarkSize,
      rerenderQueueBenchmarkView,
    );
  }
  clearRerenderCellBenchmarkQueue();
}

function clearRerenderCellBenchmarkQueue(): void {
  for (let row = 0; row < rerenderQueueCellQueue.length; row += 1) {
    rerenderQueueCellQueue[row]?.clear();
  }
}

function clearRerenderRangeBenchmarkQueue(): void {
  for (let row = 0; row < rerenderQueueRangeQueue.length; row += 1) {
    const ranges = rerenderQueueRangeQueue[row];
    if (ranges) ranges.length = 0;
  }
}

function runThreeAsciiRangeApplyWorkload(): void {
  threeAsciiRangeCanvas.frameBuffer[8] = threeAsciiRangeFrameRow;
  threeAsciiRangeCanvas.rerenderRanges.length = 0;
  threeAsciiRangeCanvas.rerenderQueue.length = 0;
  threeAsciiRangeObject.grid = [threeAsciiRangeOutputRow];
  threeAsciiRangeObject.rerenderRanges[8] = [...threeAsciiRangeSegments];
  threeAsciiRangeObject.rerender();
  const directRanges = threeAsciiRangeCanvas.rerenderRanges[8] ?? [];
  threeAsciiRangeChecksum = (threeAsciiRangeChecksum +
    (threeAsciiRangeFrameRow[12]?.length ?? 0) +
    (threeAsciiRangeFrameRow[147]?.length ?? 0) +
    directRanges.length) % 1_000_000;
  if (directRanges.length !== 2 || !Number.isFinite(threeAsciiRangeChecksum)) {
    throw new Error("Three ASCII range apply workload failed");
  }
}

function drawWorkbenchText(
  canvas: Canvas,
  value: string,
  column: number,
  row: number,
  width: number,
  zIndex = 10,
): void {
  new TextObject({
    canvas,
    style: emptyStyle,
    zIndex,
    value: cropToWidth(value.padEnd(width), width),
    overwriteRectangle: true,
    rectangle: { column, row, width },
  }).draw();
}

function runWorkbenchSparseFrameWorkload(): void {
  const frame = prepareWorkbenchFrame(workbenchSparseFrame, workbenchFrameRows);
  for (let row = 0; row < workbenchFrameRows; row += 1) {
    writeFrame(
      frame,
      workbenchFrameWidth,
      row,
      0,
      `\x1b[48;2;18;8;32m ${row.toString().padStart(2, "0")} \x1b[0m`,
    );
    writeFrame(
      frame,
      workbenchFrameWidth,
      row,
      8,
      `\x1b[38;2;180;255;120mmetric-${row % 9}\x1b[0m ` +
        `value=${((row * 13) % 101).toString().padStart(3, "0")} ` +
        "█".repeat((row % 22) + 1),
    );
    if (row % 4 === 0) {
      writeFrame(frame, workbenchFrameWidth, row, 92, "[ Config ] [ Focus ] [ Close ]");
    }
  }

  let total = 0;
  for (let row = 0; row < workbenchFrameRows; row += 1) {
    total += renderFrameRow(frame[row] ?? [], workbenchFrameWidth).length;
    total += renderFrameSlice(frame[row] ?? [], 18, 72).length;
  }
  workbenchFrameChecksum = (workbenchFrameChecksum + total) % 1_000_000;
  if (!Number.isFinite(workbenchFrameChecksum)) {
    throw new Error("workbench sparse frame checksum failed");
  }
}

function runWorkbenchStringFrameFullRowWorkload(): void {
  workbenchStringFrame.length = workbenchFrameRows;
  for (let row = 0; row < workbenchFrameRows; row += 1) {
    workbenchStringFrame[row] = "\x1b[48;2;4;4;8m".concat(" ".repeat(workbenchFrameWidth), "\x1b[0m");
  }

  let total = 0;
  for (let row = 0; row < workbenchFrameRows; row += 1) {
    const accent = 80 + (row % 120);
    writeStringFrameRow(
      workbenchStringFrame,
      workbenchFrameWidth,
      row,
      0,
      `\x1b[48;2;12;8;28m\x1b[38;2;${accent};255;180m${row.toString().padStart(2, "0")} ${
        "▰".repeat(workbenchFrameWidth - 3)
      }\x1b[0m`,
    );
    total += workbenchStringFrame[row]!.length;
  }
  workbenchFrameChecksum = (workbenchFrameChecksum + total) % 1_000_000;
  if (!Number.isFinite(workbenchFrameChecksum)) {
    throw new Error("workbench string frame checksum failed");
  }
}

function runWorkbenchFrameRenderCommandWorkload(): void {
  let checksum = 0;
  for (let index = 0; index < 96; index += 1) {
    const width = 28 + (index % 8) * 9;
    const height = 6 + (index % 5);
    const commands = workbenchFrameRenderCommandsInto(workbenchFrameRenderCommands, workbenchFrameRenderLines, {
      rect: {
        column: (index % 4) * 3,
        row: index % 7,
        width,
        height,
      },
      title: `Panel ${index % 11}`,
      active: index % 3 === 0,
      theme: workbenchFrameRenderTheme,
    });
    checksum += commands.length;
    for (let commandIndex = 0; commandIndex < commands.length; commandIndex += 1) {
      const command = commands[commandIndex]!;
      checksum += command.kind === "fill"
        ? command.rect.width + command.rect.height + command.bg.length
        : command.row + command.column + command.text.length + (command.style.bold ? 1 : 0);
    }
  }
  workbenchFrameChecksum = (workbenchFrameChecksum + checksum) % 1_000_000;
  if (checksum <= 0 || !Number.isFinite(workbenchFrameChecksum)) {
    throw new Error("workbench frame render command workload failed");
  }
}

function runWorkbenchLineSignalDiffWorkload(): void {
  workbenchLineSignalFrameIndex = 1 - workbenchLineSignalFrameIndex;
  const frame = prepareWorkbenchFrame(workbenchLineSignalFrame, workbenchFrameRows);
  for (let row = 0; row < workbenchFrameRows; row += 1) {
    const accent = 80 + ((row + workbenchLineSignalFrameIndex * 31) % 120);
    writeFrame(
      frame,
      workbenchFrameWidth,
      row,
      0,
      `\x1b[48;2;12;8;28m\x1b[38;2;${accent};255;180m${row.toString().padStart(2, "0")} ${
        "▰".repeat(workbenchFrameWidth - 3)
      }\x1b[0m`,
    );
  }

  const first = updateWorkbenchLineSignals(workbenchLineSignals, frame, workbenchFrameWidth, workbenchFrameRows);
  const second = updateWorkbenchLineSignals(workbenchLineSignals, frame, workbenchFrameWidth, workbenchFrameRows);
  workbenchFrameChecksum = (workbenchFrameChecksum + first.changed + first.cleared + second.changed + second.cleared) %
    1_000_000;
  if (first.changed !== workbenchFrameRows || second.changed !== 0 || !Number.isFinite(workbenchFrameChecksum)) {
    throw new Error("workbench line signal diff workload failed");
  }
}

function runWorkbenchStringLineSignalDiffWorkload(): void {
  workbenchLineSignalFrameIndex = 1 - workbenchLineSignalFrameIndex;
  workbenchStringFrame.length = workbenchFrameRows;
  for (let row = 0; row < workbenchFrameRows; row += 1) {
    const accent = 80 + ((row + workbenchLineSignalFrameIndex * 31) % 120);
    workbenchStringFrame[row] = `\x1b[48;2;12;8;28m\x1b[38;2;${accent};255;180m${row.toString().padStart(2, "0")} ${
      "▰".repeat(workbenchFrameWidth - 3)
    }\x1b[0m`;
  }

  const first = updateWorkbenchStringLineSignals(
    workbenchLineSignals,
    workbenchStringFrame,
    workbenchFrameWidth,
    workbenchFrameRows,
  );
  const second = updateWorkbenchStringLineSignals(
    workbenchLineSignals,
    workbenchStringFrame,
    workbenchFrameWidth,
    workbenchFrameRows,
  );
  workbenchFrameChecksum = (workbenchFrameChecksum + first.changed + first.cleared + second.changed + second.cleared) %
    1_000_000;
  if (first.changed !== workbenchFrameRows || second.changed !== 0 || !Number.isFinite(workbenchFrameChecksum)) {
    throw new Error("workbench string line signal diff workload failed");
  }
}

function runWorkbenchAnsiScreenFlushWorkload(): void {
  workbenchLineSignalFrameIndex = 1 - workbenchLineSignalFrameIndex;
  const frame = prepareWorkbenchFrame(workbenchAnsiScreenFrame, workbenchFrameRows);
  for (let row = 0; row < workbenchFrameRows; row += 1) {
    const accent = 80 + ((row + workbenchLineSignalFrameIndex * 31) % 120);
    writeFrame(
      frame,
      workbenchFrameWidth,
      row,
      0,
      `\x1b[1;38;2;${accent};255;180;48;2;12;8;28m${row.toString().padStart(2, "0")} ${
        "API WORKBENCH ".repeat(13)
      }\x1b[0m`,
    );
  }

  const first = workbenchAnsiScreenPainter.flush(frame, workbenchFrameWidth, workbenchFrameRows, renderFrameRow);
  const second = workbenchAnsiScreenPainter.flush(frame, workbenchFrameWidth, workbenchFrameRows, renderFrameRow);
  workbenchFrameChecksum = (workbenchFrameChecksum + first.changed + first.bytes + second.changed + second.bytes) %
    1_000_000;
  if (
    first.changed !== workbenchFrameRows ||
    first.bytes <= 0 ||
    second.changed !== 0 ||
    second.bytes !== 0 ||
    !Number.isFinite(workbenchFrameChecksum + workbenchAnsiScreenBytes)
  ) {
    throw new Error("workbench ANSI screen flush workload failed");
  }
}

function runWorkbenchAnsiScreenSpanFlushWorkload(): void {
  workbenchLineSignalFrameIndex = 1 - workbenchLineSignalFrameIndex;
  const frame = prepareWorkbenchFrame(workbenchAnsiSpanFrame, workbenchFrameRows);
  for (let row = 0; row < workbenchFrameRows; row += 1) {
    writeFrame(
      frame,
      workbenchFrameWidth,
      row,
      0,
      `\x1b[38;2;210;220;235;48;2;8;6;18m${"WORKBENCH ".repeat(17)}\x1b[0m`,
    );
  }

  const panelColumn = 96;
  const panelWidth = 58;
  const panelRow = 9;
  const panelRows = 29;
  const panelCells = new Array<string>(panelWidth);
  for (let row = 0; row < panelRows; row += 1) {
    const outputRow = panelRow + row;
    for (let column = 0; column < panelWidth; column += 1) {
      const red = (40 + row * 4 + workbenchLineSignalFrameIndex * 30) % 256;
      const green = (120 + column * 3 + workbenchLineSignalFrameIndex * 45) % 256;
      const blue = (220 + row + column * 2) % 256;
      panelCells[column] = `\x1b[48;2;${red};${green};${blue}m \x1b[0m`;
    }
    writeFrameCells(frame[outputRow]!, panelColumn, panelCells);
  }

  const first = workbenchAnsiSpanPainter.flush(
    frame,
    workbenchFrameWidth,
    workbenchFrameRows,
    renderFrameRow,
    renderFrameSlice,
  );
  const second = workbenchAnsiSpanPainter.flush(
    frame,
    workbenchFrameWidth,
    workbenchFrameRows,
    renderFrameRow,
    renderFrameSlice,
  );
  workbenchFrameChecksum = (workbenchFrameChecksum + first.changed + first.bytes + second.changed + second.bytes) %
    1_000_000;
  if (
    (first.changed !== panelRows && first.changed !== workbenchFrameRows) ||
    first.bytes <= 0 ||
    (first.changed === panelRows && first.bytes >= workbenchFrameRows * workbenchFrameWidth * 12) ||
    second.changed !== 0 ||
    second.bytes !== 0 ||
    !Number.isFinite(workbenchFrameChecksum + workbenchAnsiSpanBytes)
  ) {
    throw new Error("workbench ANSI screen span flush workload failed");
  }
}

function runWorkbenchCellBlitWorkload(): void {
  workbenchCellBlitWave = (workbenchCellBlitWave + 1) % 96;
  const source = prepareWorkbenchFrame(workbenchCellBlitSourceFrame, workbenchFrameRows);
  const target = prepareWorkbenchFrame(workbenchCellBlitTargetFrame, workbenchFrameRows);
  const sourceWidth = workbenchFrameWidth + 40;
  const viewportWidth = 96;
  const viewportHeight = 32;
  const viewportColumn = 36;
  const viewportRow = 11;
  const columnOffset = (workbenchCellBlitWave % 20) * 2;
  const rowOffset = workbenchCellBlitWave % 8;

  for (let row = 0; row < workbenchFrameRows; row += 1) {
    const line = source[row]!;
    for (let column = 0; column < sourceWidth; column += 1) {
      const red = (row * 7 + column * 5 + workbenchCellBlitWave * 3) % 256;
      const green = (40 + row * 11 + column * 2 + workbenchCellBlitWave * 7) % 256;
      const blue = (120 + row * 3 + column * 13 + workbenchCellBlitWave) % 256;
      line[column] = `\x1b[48;2;${red};${green};${blue}m \x1b[0m`;
    }
  }

  blitWorkbenchFrameCells(
    target,
    source,
    { column: viewportColumn, row: viewportRow, width: viewportWidth, height: viewportHeight },
    { columns: columnOffset, rows: rowOffset },
  );

  let total = 0;
  for (let row = viewportRow; row < viewportRow + viewportHeight; row += 1) {
    total += renderFrameRow(target[row] ?? [], workbenchFrameWidth).length;
  }
  workbenchFrameChecksum = (workbenchFrameChecksum + total) % 1_000_000;
  if (!Number.isFinite(workbenchFrameChecksum)) {
    throw new Error("workbench cell blit checksum failed");
  }
}

function runWorkbenchPrefilledCellBlitWorkload(): void {
  const target = prepareWorkbenchFrame(workbenchPrefilledBlitTarget, workbenchFrameRows);
  const columnOffset = (workbenchCellBlitWave % 20) * 2;
  const rowOffset = workbenchCellBlitWave % 8;
  workbenchCellBlitWave = (workbenchCellBlitWave + 1) % 96;

  blitWorkbenchFrameCells(
    target,
    workbenchPrefilledBlitSource,
    { column: 36, row: 11, width: 96, height: 32 },
    { columns: columnOffset, rows: rowOffset },
  );

  let total = 0;
  for (let row = 11; row < 43; row += 1) {
    total += renderFrameRow(target[row] ?? [], workbenchFrameWidth).length;
  }
  workbenchFrameChecksum = (workbenchFrameChecksum + total) % 1_000_000;
  if (!Number.isFinite(workbenchFrameChecksum)) {
    throw new Error("prefilled workbench cell blit checksum failed");
  }
}

function runWorkbenchVisibleWindowRectsWorkload(): void {
  const offset = (workbenchFrameChecksum % 18) * 2;
  const result = workbenchVisibleWindowRectsInto(workbenchVisibleWindowTarget, workbenchVisibleWindowSource, {
    viewport: { column: 0, row: offset, width: workbenchFrameWidth, height: workbenchFrameRows },
  });
  workbenchFrameChecksum = (workbenchFrameChecksum + result.size + offset) % 1_000_000;
  if (result.size <= 0 || result.size >= workbenchVisibleWindowSource.size || result !== workbenchVisibleWindowTarget) {
    throw new Error("workbench visible window rect workload failed");
  }
}

function runWorkbenchWorkspaceSnapshotProjectionWorkload(): void {
  const offset = benchmarkWorkspaceChecksum % benchmarkWorkspaceWindowIds.length;
  const ids = benchmarkWorkspaceWindowIds.slice(offset).concat(benchmarkWorkspaceWindowIds.slice(0, offset));
  const windows = currentWorkspaceWindowsInto(benchmarkWorkspaceWindows, {
    windowIds: ids,
    isVisualizationWindow: (id) => id.startsWith("viz:"),
    visualizationIdForWindow: (id) => benchmarkWorkspaceVisualizationIds[id],
    asciiForWindow: (id) => ({ preset: Number(id.slice(4)) % 2 === 0 ? "blocks" : "glyphs" }),
  });
  const visualizationIds = currentWorkspaceVisualizationIdsInto(benchmarkWorkspaceVisualizationIdBuffer, windows);
  benchmarkWorkspaceChecksum = (benchmarkWorkspaceChecksum + windows.length + visualizationIds.join("").length) %
    10_000;
  if (
    windows.length === 0 || visualizationIds.length !== windows.length ||
    windows.some((window) => window.ascii?.preset.length === 0)
  ) {
    throw new Error("workbench workspace snapshot projection lost window metadata");
  }
}

function runWorkbenchThreeHeaderTelemetryWorkload(): void {
  let checksum = 0;
  for (const mode of workbenchThreeHeaderModes) {
    for (const width of workbenchThreeHeaderWidths) {
      const rows = threeHeaderRowsInto(
        workbenchThreeHeaderRows,
        mode,
        width,
        workbenchThreeHeaderTheme,
        workbenchThreeHeaderPerformance,
      );
      checksum += rows[0]?.text.length ?? 0;
      checksum += rows[1]?.text.length ?? 0;
    }
  }
  if (checksum <= 0) {
    throw new Error("Three workbench header telemetry produced no rows");
  }
}

function runWorkbenchThreePressurePolicyWorkload(): void {
  for (let index = 0; index < 64; index += 1) {
    const heavy = index % 11 === 0;
    const low = index % 7 === 0;
    const next = resolveWorkbenchThreeTerminalPressureBudget(workbenchThreePressureState, {
      renderedThreeGrids: 1,
      bytes: heavy ? 120_000 : low ? 800 : 2_200,
      durationMs: heavy ? 65 : 0.2,
      levels: workbenchThreePressureLevels,
      highBytes: 240_000,
      lowBytes: 35_000,
      highBytesPerGrid: 96_000,
      lowBytesPerGrid: 1_500,
      highBytesPerSecond: 35_000,
      lowBytesPerSecond: 7_000,
      highDurationMs: 50,
      sampleDurationMs: 1000 / 30,
      highFrameThreshold: 1,
      lowFrameThreshold: 45,
    });
    workbenchThreePressureState.currentCells = next.currentCells;
    workbenchThreePressureState.highFrames = next.highFrames;
    workbenchThreePressureState.lowFrames = next.lowFrames;
    workbenchThreePressureChecksum = (workbenchThreePressureChecksum + next.currentCells + next.highFrames) %
      1_000_000;
  }
  if (!Number.isFinite(workbenchThreePressureChecksum)) {
    throw new Error("workbench Three pressure policy workload failed");
  }
}

function runWorkbenchThreeFullscreenPressurePolicyWorkload(): void {
  const frameIntervalMs = apiWorkbenchThreeFrameIntervalForCells(
    workbenchThreeFullscreenPressureState.currentCells,
    { live: true },
  );
  for (let index = 0; index < 64; index += 1) {
    const quiet = index % 17 === 0;
    const next = resolveWorkbenchThreeTerminalPressureBudget(workbenchThreeFullscreenPressureState, {
      ...API_WORKBENCH_THREE_FULLSCREEN_PRESSURE_POLICY,
      renderedThreeGrids: 1,
      bytes: quiet ? 12_000 : 30_000 + (index % 9) * 2_000,
      durationMs: 0.35,
      sampleDurationMs: frameIntervalMs,
    });
    workbenchThreeFullscreenPressureState.currentCells = next.currentCells;
    workbenchThreeFullscreenPressureState.highFrames = next.highFrames;
    workbenchThreeFullscreenPressureState.lowFrames = next.lowFrames;
    if (next.currentCells < WORKBENCH_THREE_FULLSCREEN_PRESSURE_FLOOR_CELLS) {
      throw new Error("fullscreen Three pressure collapsed below the visual floor");
    }
    workbenchThreeFullscreenPressureChecksum = (
      workbenchThreeFullscreenPressureChecksum + next.currentCells + next.highFrames + next.lowFrames
    ) % 1_000_000;
  }
  if (
    !Number.isFinite(workbenchThreeFullscreenPressureChecksum) ||
    workbenchThreeFullscreenPressureState.currentCells > WORKBENCH_THREE_FULLSCREEN_MAX_CELLS
  ) {
    throw new Error("workbench fullscreen Three pressure policy workload failed");
  }
}

function runThreePanelAdaptiveBudgetWorkload(): void {
  let currentMaxCells: number | undefined;
  let slowFrames = 0;
  let fastFrames = 0;
  for (let index = 0; index < 240; index += 1) {
    const phase = index % 80;
    const requestedMaxCells = phase < 40 ? 3_840 : phase < 60 ? 960 : 240;
    const frameMs = phase % 17 === 0 ? 180 : phase < 30 ? 18 : 42;
    const next = resolveThreePanelAdaptiveRenderBudget({
      requestedMaxCells,
      currentMaxCells,
      frameMs,
      targetMs: 1000 / 20,
      slowFrames,
      fastFrames,
      sampleFrames: index,
    });
    currentMaxCells = next.maxCells;
    slowFrames = next.slowFrames;
    fastFrames = next.fastFrames;
    threePanelAdaptiveChecksum = (threePanelAdaptiveChecksum + (currentMaxCells ?? requestedMaxCells) + slowFrames) %
      1_000_000;
  }
  if (!Number.isFinite(threePanelAdaptiveChecksum)) {
    throw new Error("Three panel adaptive budget workload failed");
  }
}

function runThreePanelGridScaleWorkload(): void {
  const scaled = scaleThreePanelGridToSize(threePanelScaleSourceGrid, 220, 70);
  threePanelScaleChecksum = (
    threePanelScaleChecksum + scaled.length + (scaled[0]?.length ?? 0) + (scaled[69]?.[219]?.length ?? 0)
  ) % 1_000_000;
  if (scaled.length !== 70 || scaled[0]?.length !== 220 || !Number.isFinite(threePanelScaleChecksum)) {
    throw new Error("three panel grid scale workload failed");
  }
}

function runThreePanelGridScaleIntoWorkload(): void {
  const scaled = scaleThreePanelGridToSizeInto(threePanelScaleTargetGrid, threePanelScaleSourceGrid, 220, 70);
  threePanelScaleChecksum = (
    threePanelScaleChecksum + scaled.length + (scaled[0]?.length ?? 0) + (scaled[69]?.[219]?.length ?? 0)
  ) % 1_000_000;
  if (scaled !== threePanelScaleTargetGrid || scaled.length !== 70 || scaled[0]?.length !== 220) {
    throw new Error("three panel retained grid scale workload failed");
  }
}

function runThreePanelGridScaleCachedWorkload(): void {
  const scaled = threePanelScaleCache.scale(threePanelScaleSourceGrid, 220, 70);
  threePanelScaleChecksum = (
    threePanelScaleChecksum + scaled.length + (scaled[0]?.length ?? 0) + (scaled[69]?.[219]?.length ?? 0)
  ) % 1_000_000;
  if (scaled !== threePanelScaleCache.target || scaled.length !== 70 || scaled[0]?.length !== 220) {
    throw new Error("three panel cached grid scale workload failed");
  }
}

function runThreePanelGridRevisionPublicationWorkload(): void {
  if (threePanelPublicationRevision === 0) {
    threePanelPublicationRevision = 1;
    threePanelPublicationCache.shouldPublish({
      grid: threePanelScaleSourceGrid,
      revision: threePanelPublicationRevision,
    });
  }
  const publish = threePanelPublicationCache.shouldPublish({
    grid: threePanelScaleSourceGrid,
    revision: threePanelPublicationRevision,
  });
  const duplicate = threePanelPublicationCache.shouldPublish({
    grid: threePanelScaleSourceGrid,
    revision: threePanelPublicationRevision,
  });
  threePanelScaleChecksum = (threePanelScaleChecksum + threePanelPublicationRevision + (publish ? 1 : 0)) % 1_000_000;
  if (publish || duplicate || !Number.isFinite(threePanelScaleChecksum)) {
    throw new Error("three panel revision publication workload failed");
  }
}

function runWorkbenchThreeBlockFlushWorkload(): void {
  workbenchThreeBlockWave = (workbenchThreeBlockWave + 1) % 64;
  const prepared = prepareWorkbenchFrame(workbenchThreeBlockFrame, workbenchThreeBlockFrameRows);
  for (let row = 0; row < workbenchThreeBlockFrameRows; row += 1) {
    writeFrame(
      prepared,
      workbenchThreeBlockFrameWidth,
      row,
      0,
      `\x1b[38;2;210;220;235;48;2;8;6;18m${"WORKBENCH ".repeat(17)}\x1b[0m`,
    );
  }

  for (let row = 0; row < workbenchThreeBlockPanelRows; row += 1) {
    const outputRow = workbenchThreeBlockPanelRow + row;
    for (let column = 0; column < workbenchThreeBlockPanelWidth; column += 1) {
      const red = (column * 9 + row * 5 + workbenchThreeBlockWave * 7) % 256;
      const green = (96 + column * 3 + row * 11 + workbenchThreeBlockWave * 13) % 256;
      const blue = (180 + column * 7 + row * 2 + workbenchThreeBlockWave * 5) % 256;
      workbenchThreeBlockPanelCells[column] = `\x1b[48;2;${red};${green};${blue}m \x1b[0m`;
    }
    writeFrameCells(prepared[outputRow]!, workbenchThreeBlockPanelColumn, workbenchThreeBlockPanelCells);
  }

  const first = workbenchThreeBlockPainter.flush(
    prepared,
    workbenchThreeBlockFrameWidth,
    workbenchThreeBlockFrameRows,
    renderFrameRow,
    renderFrameSlice,
  );
  const second = workbenchThreeBlockPainter.flush(
    prepared,
    workbenchThreeBlockFrameWidth,
    workbenchThreeBlockFrameRows,
    renderFrameRow,
    renderFrameSlice,
  );
  workbenchThreeBlockChecksum = (workbenchThreeBlockChecksum + first.changed + first.bytes + second.changed +
    second.bytes) % 1_000_000;
  if (
    (first.changed !== workbenchThreeBlockPanelRows && first.changed !== workbenchThreeBlockFrameRows) ||
    first.bytes <= 0 ||
    first.bytes >= workbenchThreeBlockFrameRows * workbenchThreeBlockFrameWidth * 12 ||
    second.changed !== 0 ||
    second.bytes !== 0 ||
    !Number.isFinite(workbenchThreeBlockChecksum + workbenchThreeBlockBytesWritten)
  ) {
    throw new Error("workbench Three block span flush workload failed");
  }
}

function runWorkbenchThreeGridScaledWorkload(): void {
  const preparedFrame = prepareWorkbenchFrame(workbenchThreeGridFrame, workbenchThreeGridTargetRows);
  writeWorkbenchThreeGrid(
    preparedFrame,
    { column: 0, row: 0, width: workbenchThreeGridTargetColumns, height: workbenchThreeGridTargetRows },
    workbenchThreeGridSource,
    " ",
    {
      scale: true,
      rowBuffer: workbenchThreeGridRowBuffer,
      sourceColumns: workbenchThreeGridSourceColumns,
      sourceRowIndexes: workbenchThreeGridSourceRowIndexes,
      sourceColumnIndexes: workbenchThreeGridSourceColumnIndexes,
    },
  );
  checksumWorkbenchThreeGridFrame("workbench scaled Three grid checksum failed");
}

function runWorkbenchThreeGridCappedWorkload(): void {
  const preparedFrame = prepareWorkbenchFrame(workbenchThreeGridFrame, workbenchThreeGridTargetRows);
  writeWorkbenchThreeGrid(
    preparedFrame,
    { column: 0, row: 0, width: workbenchThreeGridTargetColumns, height: workbenchThreeGridTargetRows },
    workbenchThreeGridSource,
    "\x1b[48;2;8;6;18m \x1b[0m",
    {
      scale: "down",
      rowBuffer: workbenchThreeGridRowBuffer,
      sourceColumns: workbenchThreeGridSourceColumns,
      sourceRowIndexes: workbenchThreeGridSourceRowIndexes,
      sourceColumnIndexes: workbenchThreeGridSourceColumnIndexes,
    },
  );
  checksumWorkbenchThreeGridFrame("workbench capped Three grid checksum failed");
}

function runWorkbenchThreeGridVerticalOnlyWorkload(): void {
  const preparedFrame = prepareWorkbenchFrame(workbenchThreeGridFrame, workbenchThreeGridTargetRows);
  writeWorkbenchThreeGrid(
    preparedFrame,
    { column: 0, row: 0, width: workbenchThreeGridSourceColumns, height: workbenchThreeGridTargetRows },
    workbenchThreeGridSource,
    " ",
    {
      scale: true,
      rowBuffer: workbenchThreeGridRowBuffer,
      sourceColumns: workbenchThreeGridSourceColumns,
      sourceRowIndexes: workbenchThreeGridSourceRowIndexes,
    },
  );
  checksumWorkbenchThreeGridFrame(
    "workbench vertical-only Three grid checksum failed",
    workbenchThreeGridSourceColumns,
    workbenchThreeGridTargetRows,
  );
}

function runWorkbenchThreeGridSparseFallbackWorkload(): void {
  const preparedFrame = prepareWorkbenchFrame(workbenchThreeGridFrame, workbenchThreeGridTargetRows);
  writeWorkbenchThreeGrid(
    preparedFrame,
    { column: 0, row: 0, width: workbenchThreeGridTargetColumns, height: workbenchThreeGridTargetRows },
    workbenchThreeGridSparseSource,
    "\x1b[48;2;8;6;18m \x1b[0m",
    {
      scale: true,
      rowBuffer: workbenchThreeGridRowBuffer,
      sourceColumns: workbenchThreeGridSourceColumns,
      sourceRowIndexes: workbenchThreeGridSourceRowIndexes,
      sourceColumnIndexes: workbenchThreeGridSourceColumnIndexes,
    },
  );
  checksumWorkbenchThreeGridFrame("workbench sparse Three grid checksum failed");
}

function checksumWorkbenchThreeGridFrame(
  errorMessage: string,
  width = workbenchThreeGridTargetColumns,
  rows = workbenchThreeGridTargetRows,
): void {
  let total = 0;
  for (let row = 0; row < rows; row += 1) {
    total += renderFrameRow(workbenchThreeGridFrame[row] ?? [], width).length;
  }
  workbenchThreeGridChecksum = (workbenchThreeGridChecksum + total) % 1_000_000;
  if (!Number.isFinite(workbenchThreeGridChecksum)) {
    throw new Error(errorMessage);
  }
}

function runAnsiStyledCharacterSplitWorkload(): void {
  const cells = getMultiCodePointCharacters(ansiStyledSplitRow);
  if (cells.length !== 160) {
    throw new Error(`ANSI styled split produced ${cells.length} cells`);
  }
  ansiStyledSplitChecksum = (ansiStyledSplitChecksum + cells.length + cells[0]!.length) % 1_000_000;
  if (!Number.isFinite(ansiStyledSplitChecksum)) {
    throw new Error("ANSI styled split checksum failed");
  }
}

function runPlainAsciiCharacterSplitWorkload(): void {
  const cells = getMultiCodePointCharacters(plainAsciiSplitRow);
  if (cells.length !== plainAsciiSplitRow.length) {
    throw new Error(`Plain ASCII split produced ${cells.length} cells`);
  }
  plainAsciiSplitChecksum = (plainAsciiSplitChecksum + cells.length + cells[0]!.charCodeAt(0)) % 1_000_000;
  if (!Number.isFinite(plainAsciiSplitChecksum)) {
    throw new Error("Plain ASCII split checksum failed");
  }
}

function runPlainWorkbenchFrameRowAssemblyWorkload(): void {
  const row = renderFrameRow(plainWorkbenchFrameRow, plainWorkbenchFrameRow.length);
  plainWorkbenchRowChecksum = (plainWorkbenchRowChecksum + row.length + row.charCodeAt(0)) % 1_000_000;
  if (row.length !== plainWorkbenchFrameRow.length || !Number.isFinite(plainWorkbenchRowChecksum)) {
    throw new Error("plain workbench frame row assembly checksum failed");
  }
}

function runBlankWorkbenchFrameRowAssemblyWorkload(): void {
  const row = renderFrameRow([], workbenchFrameWidth);
  const slice = renderFrameSlice(plainWorkbenchFrameRow, plainWorkbenchFrameRow.length, workbenchFrameWidth);
  blankWorkbenchRowChecksum = (blankWorkbenchRowChecksum + row.length + slice.length + row.charCodeAt(0)) % 1_000_000;
  if (
    row.length !== workbenchFrameWidth ||
    slice.length !== workbenchFrameWidth ||
    row.trim() !== "" ||
    slice.trim() !== "" ||
    !Number.isFinite(blankWorkbenchRowChecksum)
  ) {
    throw new Error("blank workbench frame row assembly checksum failed");
  }
}

class BenchmarkMetricsProvider implements SystemMetricsProvider {
  step = 0;
  processStatReads = 0;
  readonly pids: number[];

  constructor(pidCount = 150) {
    this.pids = Array.from({ length: pidCount }, (_, index) => 1_000 + index);
  }

  advance(): void {
    this.step += 1;
  }

  resetCounters(): void {
    this.processStatReads = 0;
  }

  now(): number {
    return 1_000 + this.step * 11_000;
  }

  hostname(): string {
    return "bench-host";
  }

  osRelease(): string {
    return "bench-os";
  }

  hardwareConcurrency(): number {
    return 16;
  }

  systemMemoryInfo(): RuntimeSystemMemoryInfo {
    return {
      total: 64 * 1024 ** 3,
      free: 16 * 1024 ** 3,
      available: 24 * 1024 ** 3,
      buffers: 0,
      cached: 8 * 1024 ** 3,
      swapTotal: 8 * 1024 ** 3,
      swapFree: 6 * 1024 ** 3,
    };
  }

  loadavg(): [number, number, number] {
    return [2.5, 2.25, 2];
  }

  networkInterfaces(): SystemMetricsNetworkInterface[] {
    return [{ name: "eth0", address: "192.0.2.20" }];
  }

  readTextFile(path: string): Promise<string> {
    if (path === "/proc/stat") return Promise.resolve(benchmarkProcStat(this.step));
    if (path === "/proc/uptime") return Promise.resolve(`${10_000 + this.step}.00 0.00\n`);
    if (path === "/proc/net/dev") return Promise.resolve(benchmarkProcNetDev(this.step));
    if (path.startsWith("/proc/") && path.endsWith("/stat")) {
      const pid = Number(path.split("/")[2] ?? 0);
      this.processStatReads += 1;
      return Promise.resolve(benchmarkProcessStat(pid, this.step));
    }
    if (path === "/sys/class/thermal/thermal_zone0/type") return Promise.resolve("bench_pkg\n");
    if (path === "/sys/class/thermal/thermal_zone0/temp") return Promise.resolve("61000\n");
    return Promise.reject(new Error(`missing benchmark fixture: ${path}`));
  }

  async *readDir(path: string): AsyncIterable<SystemMetricsDirEntry> {
    if (path === "/proc") {
      for (const pid of this.pids) {
        yield { name: String(pid), isDirectory: true };
      }
      return;
    }
    if (path === "/sys/class/thermal") {
      yield { name: "thermal_zone0", isDirectory: true };
    }
  }

  command(command: string, _args: string[]): Promise<SystemMetricsCommandOutput> {
    if (command === "df") {
      return Promise.resolve(commandOutput([
        "Filesystem 1B-blocks Used Available Use% Mounted on",
        "/dev/nvme0n1p2 1000000000 610000000 390000000 61% /",
        "/dev/nvme1n1p1 2000000000 900000000 1100000000 45% /data",
      ].join("\n")));
    }
    if (command === "nvidia-smi") {
      return Promise.resolve(commandOutput("Bench GPU, 82, 8192, 24576, 71, 220, 2100, 10500\n"));
    }
    return Promise.resolve({ success: false, stdout: new Uint8Array() });
  }
}

function commandOutput(output: string): SystemMetricsCommandOutput {
  return {
    success: true,
    stdout: new TextEncoder().encode(output),
  };
}

function benchmarkProcStat(step: number): string {
  const busy = 1_000 + step * 80;
  const idle = 8_000 + step * 120;
  const rows = [`cpu ${busy} 0 ${busy} ${idle} 0 0 0 0 0 0`];
  for (let core = 0; core < 16; core += 1) {
    rows.push(`cpu${core} ${busy + core * 7} 0 ${busy + core * 3} ${idle + core * 11} 0 0 0 0 0 0`);
  }
  return rows.join("\n");
}

function benchmarkProcNetDev(step: number): string {
  const rxBytes = 1_000_000 + step * 1_500_000;
  const txBytes = 2_000_000 + step * 900_000;
  return [
    "Inter-|   Receive                                                |  Transmit",
    " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
    `  eth0: ${rxBytes} 0 0 0 0 0 0 0 ${txBytes} 0 0 0 0 0 0 0`,
  ].join("\n");
}

function benchmarkProcessStat(pid: number, step: number): string {
  const tail = Array.from({ length: 37 }, () => "0");
  tail[0] = "R";
  tail[11] = String(pid * 10 + step * ((pid % 9) + 1));
  tail[12] = String(step * ((pid % 5) + 1));
  tail[21] = String(256 + (pid % 4096));
  tail[36] = String(pid % 16);
  return `${pid} (bench-${pid}) ${tail.join(" ")}`;
}

const metricsProvider = new BenchmarkMetricsProvider();
const metricsMonitor = new SystemMonitor({
  historyLength: 16,
  provider: metricsProvider,
  processLimit: 100,
  processScanLimit: 120,
});
const largeMetricsProvider = new BenchmarkMetricsProvider(1_200);
const largeMetricsMonitor = new SystemMonitor({
  historyLength: 16,
  provider: largeMetricsProvider,
  processLimit: 100,
  processScanLimit: 1_000,
});
const markupLayoutCache = new LayoutMeasurementCache();
const markupLayoutSolver = simpleLayoutSolver({ intrinsicMeasurementCache: markupLayoutCache });

/** High-volume UI, runtime, and rendering benchmark workloads used by the benchmark CLI. */
export const benchmarkCases: BenchmarkCase[] = [
  {
    name: "layout/flex-rects-3-pane",
    category: "layout",
    description: "Solve a three-pane row flex layout into terminal rectangles.",
    tags: ["layout", "rects", "resize"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: () => {
      flexRects({ column: 0, row: 0, width: 120, height: 40 }, "row", [
        { id: "a", basis: 20, grow: 1 },
        { id: "b", basis: 40, grow: 2 },
        { id: "c", basis: 10, grow: 1 },
      ], 1);
    },
  },
  {
    name: "layout/tile-rects-resize-wall",
    category: "layout",
    description: "Re-score a responsive multi-window tile layout across frequent terminal resize bounds.",
    tags: ["layout", "resize", "windows"],
    iterations: 300,
    maxAverageMs: 6,
    run: () => {
      for (const bounds of resizeBounds) {
        tileRects(bounds, {
          itemCount: 24,
          minTileWidth: 24,
          minTileHeight: 8,
          maxColumns: 6,
          gap: 1,
          allowVerticalOverflow: true,
        });
      }
    },
  },
  {
    name: "layout/window-manager-churn",
    category: "layout",
    description: "Churn window focus, fullscreen, minimize, restore, ordering, and resize layouts.",
    tags: ["layout", "windows", "resize", "state"],
    iterations: 150,
    maxAverageMs: 8,
    run: runWindowManagerChurnWorkload,
  },
  {
    name: "layout/html-css-demo-solve",
    category: "layout",
    description: "Parse, cascade, and solve the HTML/CSS layout portfolio demo with cached intrinsic measurements.",
    tags: ["layout", "html", "css", "cache"],
    iterations: 300,
    maxAverageMs: 8,
    run: () => {
      const result = createHtmlCssLayoutDemo({ column: 0, row: 0, width: 96, height: 32 }, {
        solver: markupLayoutSolver,
      });
      if (!result.layout.byId.has("layout-stage")) {
        throw new Error("HTML/CSS layout demo did not produce expected boxes");
      }
    },
  },
  {
    name: "layout/cpu-hex-tile-layout-88",
    category: "layout",
    description: "Project 88 CPU cores into reusable hex tile geometry buffers.",
    tags: ["layout", "monitor", "cpu", "reuse"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: runCpuHexTileLayoutWorkload,
  },
  {
    name: "render/sparkline-80",
    category: "render",
    description: "Render a dense dashboard sparkline into an 80-cell text series.",
    tags: ["render", "dashboard"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: () => {
      renderSparkline(sparklineValues, 80);
    },
  },
  {
    name: "render/canvas-overlap-modal-churn",
    category: "render",
    description: "Render many overlapping canvas boxes while a high-z modal moves and closes.",
    tags: ["render", "canvas", "dirty-region", "windows"],
    iterations: 30,
    maxAverageMs: 75,
    run: runCanvasOverlapWorkload,
  },
  {
    name: "render/canvas-dirty-region-400-rects",
    category: "render",
    description: "Merge 400 dirty rectangles into row segments and probe clipped intersections.",
    tags: ["render", "canvas", "dirty-region"],
    iterations: 250,
    maxAverageMs: 4,
    run: runDirtyRegionWorkload,
  },
  {
    name: "render/api-workbench-frame",
    category: "render",
    description:
      "Render a deterministic API Workbench-style frame with panes, tables, controls, logs, and modal churn.",
    tags: ["render", "canvas", "workbench", "windows"],
    iterations: 35,
    maxAverageMs: 35,
    run: runApiWorkbenchFrameWorkload,
  },
  {
    name: "render/workbench-sparse-frame",
    category: "render",
    description: "Build and assemble sparse workbench frame rows with ANSI styled cells and clipped viewport slices.",
    tags: ["render", "workbench", "frame", "ansi"],
    iterations: 500,
    maxAverageMs: 5,
    run: runWorkbenchSparseFrameWorkload,
  },
  {
    name: "render/workbench-cell-blit-viewport",
    category: "render",
    description: "Copy a scrolled truecolor virtual window into the workbench frame without ANSI stringify/reparse.",
    tags: ["render", "workbench", "frame", "ansi", "viewport"],
    iterations: 250,
    maxAverageMs: 5,
    run: runWorkbenchCellBlitWorkload,
  },
  {
    name: "render/workbench-prefilled-cell-blit-viewport",
    category: "render",
    description: "Copy a prefilled truecolor virtual viewport into retained workbench rows.",
    tags: ["render", "workbench", "frame", "ansi", "viewport"],
    iterations: 500,
    maxAverageMs: 3,
    run: runWorkbenchPrefilledCellBlitWorkload,
  },
  {
    name: "render/workbench-plain-frame-row-168",
    category: "render",
    description: "Assemble a dense plain ASCII workbench row without allocating per-cell split descriptors.",
    tags: ["render", "workbench", "frame", "text"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: runPlainWorkbenchFrameRowAssemblyWorkload,
  },
  {
    name: "render/workbench-blank-frame-row-168",
    category: "render",
    description: "Assemble blank and out-of-range workbench frame rows through the empty-row fast path.",
    tags: ["render", "workbench", "frame", "text", "blank"],
    iterations: 5_000,
    maxAverageMs: 1,
    run: runBlankWorkbenchFrameRowAssemblyWorkload,
  },
  {
    name: "render/workbench-string-frame-full-row",
    category: "render",
    description: "Overwrite string-backed browser workbench rows with full-width ANSI styled content.",
    tags: ["render", "workbench", "frame", "ansi", "web"],
    iterations: 500,
    maxAverageMs: 5,
    run: runWorkbenchStringFrameFullRowWorkload,
  },
  {
    name: "render/workbench-frame-render-commands-96",
    category: "render",
    description: "Project themed workbench frame fill, border, and title commands with caller-owned buffers.",
    tags: ["render", "workbench", "frame", "projection"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: runWorkbenchFrameRenderCommandWorkload,
  },
  {
    name: "render/workbench-line-signal-diff-168x54",
    category: "render",
    description:
      "Apply assembled workbench frame rows to retained terminal line signals while skipping unchanged rows.",
    tags: ["render", "workbench", "frame", "signals", "terminal"],
    iterations: 250,
    maxAverageMs: 8,
    run: runWorkbenchLineSignalDiffWorkload,
  },
  {
    name: "render/workbench-string-line-signal-diff-168x54",
    category: "render",
    description: "Apply string-backed browser workbench rows to retained line signals while skipping unchanged rows.",
    tags: ["render", "workbench", "frame", "signals", "web"],
    iterations: 250,
    maxAverageMs: 8,
    run: runWorkbenchStringLineSignalDiffWorkload,
  },
  {
    name: "render/workbench-ansi-screen-flush-168x54",
    category: "render",
    description: "Flush changed full-screen ANSI workbench rows directly and skip unchanged rows.",
    tags: ["render", "workbench", "frame", "ansi", "terminal"],
    iterations: 250,
    maxAverageMs: 6,
    run: runWorkbenchAnsiScreenFlushWorkload,
  },
  {
    name: "render/workbench-ansi-screen-span-flush-168x54",
    category: "render",
    description: "Flush animated workbench window spans without rewriting unchanged full terminal rows.",
    tags: ["render", "workbench", "frame", "ansi", "terminal", "span"],
    iterations: 250,
    maxAverageMs: 6,
    run: runWorkbenchAnsiScreenSpanFlushWorkload,
  },
  {
    name: "render/workbench-visible-window-rects-60",
    category: "render",
    description: "Filter a scrolled virtual workbench layout to the visible window rectangles.",
    tags: ["render", "workbench", "layout", "viewport"],
    iterations: 5_000,
    maxAverageMs: 1,
    run: runWorkbenchVisibleWindowRectsWorkload,
  },
  {
    name: "runtime/workbench-workspace-snapshot-projection",
    category: "runtime",
    description: "Project current API workbench visualization windows into retained workspace snapshot buffers.",
    tags: ["runtime", "workbench", "workspace", "reuse"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: runWorkbenchWorkspaceSnapshotProjectionWorkload,
  },
  {
    name: "render/workbench-three-block-span-flush-168x54",
    category: "render",
    description: "Flush an animated truecolor Three block pane through retained workbench row spans.",
    tags: ["render", "workbench", "three", "ansi", "terminal", "span", "blocks"],
    iterations: 250,
    maxAverageMs: 8,
    run: runWorkbenchThreeBlockFlushWorkload,
  },
  {
    name: "render/workbench-three-header-telemetry",
    category: "render",
    description: "Project responsive Three renderer header rows with live cadence and readback telemetry.",
    tags: ["render", "workbench", "three", "telemetry"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: runWorkbenchThreeHeaderTelemetryWorkload,
  },
  {
    name: "render/workbench-three-pressure-policy",
    category: "render",
    description: "Resolve repeated workbench Three terminal-pressure samples against stable policy levels.",
    tags: ["render", "workbench", "three", "pressure", "terminal"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: runWorkbenchThreePressurePolicyWorkload,
  },
  {
    name: "render/workbench-three-fullscreen-pressure-policy",
    category: "render",
    description: "Resolve fullscreen Three pressure samples without collapsing interactive block-frame cadence.",
    tags: ["render", "workbench", "three", "pressure", "terminal", "fullscreen"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: runWorkbenchThreeFullscreenPressurePolicyWorkload,
  },
  {
    name: "render/three-panel-adaptive-budget",
    category: "render",
    description: "Resolve repeated Three panel adaptive render-cell budgets from frame timing samples.",
    tags: ["render", "three", "adaptive", "budget", "policy"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: runThreePanelAdaptiveBudgetWorkload,
  },
  {
    name: "render/three-panel-grid-scale-220x70",
    category: "render",
    description: "Scale a capped Three panel renderer grid into the visible pane grid before publication.",
    tags: ["render", "three", "ascii", "grid", "scale"],
    iterations: 500,
    maxAverageMs: 4,
    run: runThreePanelGridScaleWorkload,
  },
  {
    name: "render/three-panel-grid-scale-into-220x70",
    category: "render",
    description: "Scale a capped Three panel renderer grid into retained caller-owned storage before publication.",
    tags: ["render", "three", "ascii", "grid", "scale", "retained"],
    iterations: 500,
    maxAverageMs: 4,
    run: runThreePanelGridScaleIntoWorkload,
  },
  {
    name: "render/three-panel-grid-scale-cached-220x70",
    category: "render",
    description: "Scale a capped Three panel renderer grid with retained target and source index buffers.",
    tags: ["render", "three", "ascii", "grid", "scale", "retained", "cache"],
    iterations: 500,
    maxAverageMs: 4,
    run: runThreePanelGridScaleCachedWorkload,
  },
  {
    name: "render/three-panel-grid-revision-publication",
    category: "render",
    description: "Publish revisioned Three panel renderer grids without content fingerprint scans.",
    tags: ["render", "three", "ascii", "grid", "publication", "revision"],
    iterations: 10_000,
    maxAverageMs: 0.02,
    run: runThreePanelGridRevisionPublicationWorkload,
  },
  {
    name: "render/textobject-full-row-canvas-220x70",
    category: "render",
    description: "Update full-width ANSI styled TextObject rows through the terminal canvas range sink.",
    tags: ["render", "workbench", "canvas", "ansi", "text", "terminal"],
    iterations: 80,
    maxAverageMs: 20,
    run: textObjectFullRowCanvasBenchmark.run,
  },
  {
    name: "render/workbench-scaled-three-grid-220x70",
    category: "render",
    description: "Scale a capped Three ASCII source grid into a large workbench pane and assemble terminal rows.",
    tags: ["render", "workbench", "three", "ascii", "frame"],
    iterations: 200,
    maxAverageMs: 8,
    run: runWorkbenchThreeGridScaledWorkload,
  },
  {
    name: "render/workbench-capped-three-grid-220x70",
    category: "render",
    description: "Render a capped Three ASCII source grid without scaling it back up to a large terminal pane.",
    tags: ["render", "workbench", "three", "ascii", "frame", "terminal"],
    iterations: 200,
    maxAverageMs: 6,
    run: runWorkbenchThreeGridCappedWorkload,
  },
  {
    name: "render/workbench-vertical-three-grid-109x70",
    category: "render",
    description: "Scale Three ASCII rows vertically while direct-copying same-width terminal cell rows.",
    tags: ["render", "workbench", "three", "ascii", "frame"],
    iterations: 200,
    maxAverageMs: 5,
    run: runWorkbenchThreeGridVerticalOnlyWorkload,
  },
  {
    name: "render/workbench-sparse-three-grid-220x70",
    category: "render",
    description: "Project sparse Three ASCII rows with fallback-row reuse into a large workbench pane.",
    tags: ["render", "workbench", "three", "ascii", "frame", "sparse"],
    iterations: 200,
    maxAverageMs: 6,
    run: runWorkbenchThreeGridSparseFallbackWorkload,
  },
  {
    name: "render/ansi-styled-character-split-160",
    category: "render",
    description: "Split a full-width truecolor ANSI background row into TextObject cells.",
    tags: ["render", "ansi", "text", "workbench"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: runAnsiStyledCharacterSplitWorkload,
  },
  {
    name: "render/plain-ascii-character-split-160",
    category: "render",
    description: "Split a plain ASCII terminal row into TextObject cells without Unicode regex work.",
    tags: ["render", "text", "workbench"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: runPlainAsciiCharacterSplitWorkload,
  },
  {
    name: "render/ansi-canvas-sink-styled-range-160",
    category: "render",
    description: "Flush a long truecolor terminal row range through the ANSI canvas sink with styled-run compaction.",
    tags: ["render", "ansi", "canvas", "terminal"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: () => {
      ansiSinkBytes = 0;
      ansiSink.flushRanges([
        { row: 0, startColumn: 0, values: ansiSinkStyledRangeValues },
      ], ansiSinkStyledRangeStats);
      if (ansiSinkBytes <= ansiSinkStyledRangeValues.length) {
        throw new Error("ANSI sink emitted an unexpectedly small terminal sequence");
      }
    },
  },
  {
    name: "render/ansi-canvas-sink-truecolor-background-range-160",
    category: "render",
    description: "Flush a long mixed truecolor background row without redundant per-cell ANSI resets.",
    tags: ["render", "ansi", "canvas", "terminal", "three"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: () => {
      ansiSinkBytes = 0;
      ansiSink.flushRanges([
        { row: 0, startColumn: 0, values: ansiSinkTruecolorBackgroundValues },
      ], ansiSinkTruecolorBackgroundStats);
      if (ansiSinkBytes <= ansiSinkTruecolorBackgroundValues.length) {
        throw new Error("ANSI sink emitted an unexpectedly small truecolor terminal sequence");
      }
    },
  },
  {
    name: "render/ansi-text-measure-crop-250",
    category: "render",
    description: "Measure and crop ANSI truecolor rows with wide block glyphs.",
    tags: ["render", "ansi", "text", "table"],
    iterations: 300,
    maxAverageMs: 8,
    run: () => {
      let total = 0;
      for (const row of ansiRichRows) {
        total += textWidth(row);
        total += cropToWidth(row, 64).length;
      }
      if (total <= 0) {
        throw new Error("ANSI text measurement produced no output");
      }
    },
  },
  {
    name: "render/textbox-wrap-250",
    category: "render",
    description: "Wrap 250 multiline textbox rows into reusable visual-line storage.",
    tags: ["render", "text", "textbox", "wrap"],
    iterations: 400,
    maxAverageMs: 5,
    run: runTextBoxWrapWorkload,
  },
  ...threeAsciiBenchmarkCases,
  {
    name: "render/rerender-range-dense-160x50",
    category: "render",
    description: "Queue dense dirty row ranges without expanding them to per-cell sets.",
    tags: ["render", "canvas", "queue", "range", "dense"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: runDenseRerenderRangeQueueWorkload,
  },
  {
    name: "render/rerender-cell-sparse-1k",
    category: "render",
    description: "Queue sparse single-cell dirty updates through the compatibility cell queue.",
    tags: ["render", "canvas", "queue", "cell", "sparse"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: runSparseRerenderCellQueueWorkload,
  },
  {
    name: "render/rerender-range-clipped-120",
    category: "render",
    description: "Queue clipped dirty row ranges through the legacy cell queue path.",
    tags: ["render", "canvas", "queue", "range", "clipped"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: runClippedRerenderRangeQueueWorkload,
  },
  {
    name: "render/three-ascii-range-apply-160",
    category: "render",
    description: "Apply changed Three ASCII row ranges into a canvas frame row without expanding direct ranges.",
    tags: ["render", "canvas", "three", "range", "blocks"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: runThreeAsciiRangeApplyWorkload,
  },
  {
    name: "render/rerender-cell-fractional-1k",
    category: "render",
    description: "Queue fractional dirty cells through the clipped compatibility cell queue path.",
    tags: ["render", "canvas", "queue", "cell", "fractional", "clipped"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: runFractionalRerenderCellQueueWorkload,
  },
  {
    name: "render/render-loop-300-steps",
    category: "render",
    description: "Step a render loop through a burst of frames and read frame pressure telemetry.",
    tags: ["render", "telemetry"],
    iterations: 200,
    maxAverageMs: 3,
    run: () => {
      let frames = 0;
      const loop = createRenderLoop({
        immediate: false,
        tick: () => {
          frames += 1;
        },
      });
      for (let index = 0; index < 300; index += 1) loop.step();
      if (frames !== 300) throw new Error("render loop dropped a manual step");
      loop.inspect();
    },
  },
  {
    name: "runtime/terminal-screen-replay",
    category: "runtime",
    description: "Replay a colored PTY-style byte transcript through the terminal screen model.",
    tags: ["runtime", "terminal", "ansi", "screen"],
    iterations: 500,
    maxAverageMs: 2,
    run: () => {
      const screen = new TerminalScreenController({ columns: 96, rows: 12, scrollbackLimit: 32 });
      for (const chunk of terminalScreenChunks) screen.write(chunk);
      const inspection = screen.inspect();
      if (inspection.title !== "cos@old-donkey:~/projects/deno_tui" || inspection.cursorVisible !== true) {
        throw new Error("terminal screen replay lost metadata");
      }
    },
  },
  {
    name: "runtime/terminal-screen-edit-churn",
    category: "runtime",
    description: "Apply repeated terminal insert, delete, and erase character operations to an active screen row.",
    tags: ["runtime", "terminal", "ansi", "screen", "editing"],
    iterations: 500,
    maxAverageMs: 2,
    run: () => {
      const screen = new TerminalScreenController({ columns: 96, rows: 12, scrollbackLimit: 32 });
      screen.write("abcdefghijklmnopqrstuvwxyz0123456789".repeat(3));
      for (let index = 0; index < 80; index += 1) {
        screen.write(`\x1b[${(index % 12) + 1}G`);
        screen.write(`\x1b[${(index % 5) + 1}@`);
        screen.write(`\x1b[${(index % 4) + 1}P`);
        screen.write(`\x1b[${(index % 6) + 1}X`);
      }
      if (screen.textRows().length !== 12) {
        throw new Error("terminal screen edit benchmark lost rows");
      }
    },
  },
  {
    name: "runtime/terminal-copy-row-projection",
    category: "runtime",
    description: "Project terminal copy-mode scrollback rows with line numbers and selected-row state.",
    tags: ["runtime", "terminal", "scrollback", "copy", "projection"],
    iterations: 1_000,
    maxAverageMs: 2,
    run: () => {
      const rows = workbenchTerminalCopyRowsInto(terminalCopyRowBuffer, {
        visibleRows: terminalCopyVisibleRows,
        offset: 2_048,
        height: 72,
        selection: { anchor: 2_074, focus: 2_083 },
        prefixWidth: 6,
      });
      if (rows.length !== 72 || rows[26]?.selected !== true || rows[0]?.lineNumber !== 2_049) {
        throw new Error("terminal copy-row projection benchmark lost row metadata");
      }
    },
  },
  {
    name: "runtime/terminal-pane-title-render-commands",
    category: "runtime",
    description: "Project reusable terminal workspace pane title paint and hit commands.",
    tags: ["runtime", "terminal", "workspace", "projection", "render"],
    iterations: 2_000,
    maxAverageMs: 1,
    run: () => {
      const commands = workbenchTerminalPaneTitleRenderCommandsInto(
        terminalPaneTitleBuffer,
        terminalPaneTitleProjections,
        {
          background: "#05020a",
          text: "#f5efff",
          soft: "#c8b5df",
          panelSoft: "#27173a",
          accentDeep: "#5d2c82",
        },
        (color, dark, light) => color === "#5d2c82" ? light : dark,
      );
      if (commands.length !== 60 || commands[0]?.style.bold !== true || commands[1]?.style.bg !== "#27173a") {
        throw new Error("terminal pane title command benchmark lost title metadata");
      }
    },
  },
  {
    name: "runtime/terminal-workspace-layout-churn",
    category: "runtime",
    description: "Churn terminal workspace pane focus, zoom, split resize, and rect projection across resize bounds.",
    tags: ["runtime", "terminal", "workspace", "layout", "resize"],
    iterations: 500,
    maxAverageMs: 2,
    run: runTerminalWorkspaceLayoutWorkload,
  },
  {
    name: "data/table-select-100k",
    category: "data",
    description: "Select, reveal, page, scroll, and inspect a 100k-row table controller.",
    tags: ["data", "table", "selection"],
    iterations: 200,
    maxAverageMs: 5,
    run: () => {
      for (let index = 0; index < 250; index += 1) {
        largeTable.select((index * 997) % 100_000);
        if (index % 8 === 0) largeTable.pageDown();
        if (index % 11 === 0) largeTable.scroll(3);
      }
      largeTable.inspect();
    },
  },
  {
    name: "data/table-filter-25k",
    category: "data",
    description: "Filter a 25k-row data table across multiple searchable columns.",
    tags: ["data", "table", "filter", "search"],
    iterations: 80,
    maxAverageMs: 12,
    run: () => {
      const rows = filterDataRows(largeDataRows, largeDataColumns, "process-12 user");
      if (rows.length === 0) throw new Error("table filter returned no rows");
    },
  },
  {
    name: "data/local-query-page-25k",
    category: "data",
    description: "Page a 25k-row local data query without filters or sorting.",
    tags: ["data", "query", "paging"],
    iterations: 500,
    maxAverageMs: 2,
    run: () => {
      const page = queryLocalData(largeDataRows, { page: 17, pageSize: 50 });
      if (page.rows.length !== 50 || page.totalRows !== largeDataRows.length || page.rows[0]?.id !== 850) {
        throw new Error("local data query page benchmark returned unexpected rows");
      }
    },
  },
  {
    name: "data/command-search-1k",
    category: "data",
    description: "Rank 1k command-surface entries across labels, ids, groups, bindings, keywords, and acronyms.",
    tags: ["data", "commands", "search", "ranking"],
    iterations: 250,
    maxAverageMs: 8,
    run: () => {
      const results = searchCommandSurfaceItems(commandSearchRegistry, {
        query: "restart gpu service",
        limit: 20,
      });
      if (results.length === 0 || !results[0]?.label.toLowerCase().includes("restart")) {
        throw new Error("command search benchmark did not produce expected ranked results");
      }
    },
  },
  {
    name: "data/command-search-index-1k",
    category: "data",
    description: "Rank 1k pre-indexed command-surface entries across labels, ids, keywords, and acronyms.",
    tags: ["data", "commands", "search", "ranking", "indexed"],
    iterations: 500,
    maxAverageMs: 4,
    run: () => {
      const results = searchCommandSearchIndex(commandSearchIndex, "restart gpu service", { limit: 20 });
      if (results.length === 0 || !results[0]?.item.label.toLowerCase().includes("restart")) {
        throw new Error("indexed command search benchmark did not produce expected ranked results");
      }
    },
  },
  {
    name: "data/list-visible-50k",
    category: "data",
    description: "Resolve visible rows for a 50k-item list while the selected row moves through the source.",
    tags: ["data", "list", "virtualized"],
    iterations: 500,
    maxAverageMs: 2,
    run: () => {
      for (let index = 0; index < 100; index += 1) {
        visibleListRows(largeListItems, (index * 499) % largeListItems.length, 36);
      }
    },
  },
  {
    name: "data/system-monitor-fixture-sample",
    category: "data",
    description: "Sample fixture-backed CPU, memory, network, disk, GPU, and capped process metrics from 150 PIDs.",
    tags: ["data", "monitor", "processes", "fixtures"],
    iterations: 80,
    maxAverageMs: 5,
    run: async () => {
      metricsProvider.advance();
      metricsProvider.resetCounters();
      await metricsMonitor.sample();
      const snapshot = metricsMonitor.snapshot.peek();
      if (snapshot.processes.length !== 100 || snapshot.cpuCores.length !== 16) {
        throw new Error("system monitor fixture sample did not produce expected rows");
      }
      if (metricsProvider.processStatReads !== 120) {
        throw new Error("system monitor fixture sample did not respect the process scan cap");
      }
    },
  },
  {
    name: "data/system-monitor-large-process-sample",
    category: "data",
    description: "Sample fixture-backed monitor data while selecting the top 100 processes from 1k scanned PIDs.",
    tags: ["data", "monitor", "processes", "fixtures", "bounded"],
    iterations: 20,
    maxAverageMs: 20,
    run: async () => {
      largeMetricsProvider.advance();
      largeMetricsProvider.resetCounters();
      await largeMetricsMonitor.sample();
      const snapshot = largeMetricsMonitor.snapshot.peek();
      if (snapshot.processes.length !== 100 || snapshot.cpuCores.length !== 16) {
        throw new Error("large process monitor sample did not produce expected rows");
      }
      if (largeMetricsProvider.processStatReads !== 1_000) {
        throw new Error("large process monitor sample did not respect the process scan cap");
      }
    },
  },
  {
    name: "data/source-frame-resolution",
    category: "data",
    description: "Resolve monitor source frames into a reusable frame buffer.",
    tags: ["data", "monitor", "sources", "reuse"],
    iterations: 500,
    maxAverageMs: 3,
    run: runSourceFrameResolutionWorkload,
  },
  {
    name: "input/mouse-hit-test-500-targets",
    category: "input",
    description: "Route pointer movement across 500 z-ordered mouse regions.",
    tags: ["input", "mouse", "routing"],
    iterations: 120,
    maxAverageMs: 15,
    run: () => {
      for (let index = 0; index < 300; index += 1) {
        mouseRouter.hitTest((index * 7) % 150, (index * 5) % 40, "press");
      }
    },
  },
  {
    name: "input/terminal-decode-batched",
    category: "input",
    description: "Decode a batched terminal read containing keys, cursor movement, focus, mouse, and bracketed paste.",
    tags: ["input", "terminal", "parser", "paste", "mouse"],
    iterations: 500,
    maxAverageMs: 4,
    run: () => {
      let events = 0;
      let sawPaste = false;
      let sawMouse = false;
      let sawFocus = false;
      for (const event of decodeBuffer(terminalInputDecodeBatch)) {
        events += 1;
        if (event.key === "paste") sawPaste = event.text.includes("deno task test");
        else if (event.key === "mouse") sawMouse = true;
        else if (event.key === "focus") sawFocus = true;
      }
      if (events < 20 || !sawPaste || !sawMouse || !sawFocus) {
        throw new Error("terminal input decode benchmark lost events");
      }
    },
  },
  {
    name: "widgets/theme-standard-39-components",
    category: "widgets",
    description: "Build standard semantic component theme definitions and audit provider coverage.",
    tags: ["widgets", "theme", "catalog"],
    iterations: 100,
    maxAverageMs: 20,
    run: () => {
      createStandardComponentThemeDefinitions();
      createThemeProviderReport(createThemeProvider(), {
        preview: false,
        coverage: { components: standardThemeComponentNames() },
      });
    },
  },
  {
    name: "runtime/scheduler-batch-100",
    category: "runtime",
    description: "Process 100 ordered tasks through the bounded async scheduler and inspect telemetry.",
    tags: ["runtime", "scheduler", "concurrency", "telemetry"],
    iterations: 25,
    maxAverageMs: 25,
    run: async () => {
      const scheduler = new AsyncScheduler({ concurrency: 8 });
      const results = await runTaskBatch(
        Array.from({ length: 100 }, (_, index) => index),
        {
          scheduler,
          task: (value) => value * 2,
        },
      );
      if (results.length !== 100 || scheduler.inspect().completed !== 100) {
        throw new Error("scheduler batch did not complete all tasks");
      }
    },
  },
];
