import { clamp, formatBytes, formatOptionalNumber, formatPercent } from "./styles.ts";
import {
  alertText,
  buildVisualizationDrive,
  crop,
  formatLoadAverage,
  severityForValue,
  type VisualizationDrive,
} from "./visualization_primitives.ts";
import type { Accent, PanelRender, RenderContext, Severity } from "./types.ts";

type CpuCoreSnapshot = RenderContext["system"]["cpuCores"][number];
type CpuProcessSnapshot = RenderContext["system"]["processes"][number];
export type CpuHexNavigationKey = "left" | "right" | "up" | "down" | "home" | "end";

const cpuHexColorStops = [
  { percent: 0, rgb: [45, 112, 255] },
  { percent: 25, rgb: [22, 214, 107] },
  { percent: 50, rgb: [255, 226, 74] },
  { percent: 75, rgb: [255, 159, 36] },
  { percent: 100, rgb: [255, 66, 49] },
] as const;

export interface CpuHexTileLayout {
  core: RenderContext["system"]["cpuCores"][number];
  label: string;
  column: number;
  row: number;
  width: number;
  height: number;
}

interface CpuHexScrollOffset {
  columns: number;
  rows: number;
}

interface CpuHexScrollTargetOptions {
  label: string;
  tiles: readonly CpuHexTileLayout[];
  offset: CpuHexScrollOffset;
  viewportHeight: number;
  bodyHeaderRows?: number;
  summaryRows?: number;
}

type CpuHexTileMode = "compact" | "labeled" | "cell";

export interface SystemMonitorRenderDependencies {
  plotHistory(values: number[], width: number, height: number, glyph: string): string;
  miniMeter(value: number, width: number, heat: number): string;
  monitorGlyph(drive: VisualizationDrive, accent: Accent): string;
}

export interface GpuMonitorRenderDependencies {
  plotHistory(values: number[], width: number, height: number, glyph: string): string;
  barChart(values: number[], width: number, height: number, glyphs: readonly string[]): string;
  miniMeter(value: number, width: number, heat: number): string;
  monitorGlyph(drive: VisualizationDrive, accent: Accent): string;
}

export function renderCpuMonitor(
  context: RenderContext,
  dependencies: SystemMonitorRenderDependencies,
): PanelRender {
  const { system, width, height } = context;
  const drive = buildVisualizationDrive(context, Math.max(width, 48));
  const graphHeight = Math.max(4, height - 3);
  const graph = dependencies.plotHistory(
    system.cpuHistory,
    Math.max(12, width),
    graphHeight,
    dependencies.monitorGlyph(drive, "signal"),
  );
  const topCores = topCpuCoreSummary(system.cpuCores);

  return {
    body: [
      `AVG ${system.cpuOverall.toFixed(1)}%   LOAD ${formatLoadAverage(system.loadavg)}`,
      graph,
      topCores || "NO CORE DATA",
    ].join("\n"),
    footer: `HOST ${system.hostname.toUpperCase()}  UPTIME ${formatDuration(system.uptimeSeconds)}  SURGE ${
      (drive.volatility * 100).toFixed(0)
    }%`,
    alert: alertText(context) || (drive.hazard >= 0.9 ? "CORE CASCADE RISK" : ""),
    accent: drive.hazard >= 0.9 ? "alarm" : system.cpuOverall >= 72 ? "amber" : "signal",
    severity: drive.hazard >= 0.9 ? "alarm" : severityForValue(system.cpuOverall, 72, 88),
  };
}

export function renderCpuLegend(
  context: RenderContext,
  dependencies: SystemMonitorRenderDependencies,
): PanelRender {
  const drive = buildVisualizationDrive(context, 24);
  const lines = [
    `TOTAL  ${formatPercent(context.system.cpuOverall)}`,
    ...cpuLegendRows(context.system.cpuCores, context.width, drive.hazard, dependencies),
  ];

  return {
    body: lines.join("\n"),
    footer: `CORES ${String(context.system.cpuCores.length).padStart(2, "0")}  LOAD ${
      (drive.current * 100).toFixed(0)
    }%`,
    alert: context.system.cpuOverall >= 88 ? "PULSE LIMIT" : drive.divergence >= 0.6 ? "CORE DESYNC" : "",
    accent: context.system.cpuOverall >= 88 ? "alarm" : drive.divergence >= 0.6 ? "amber" : "signal",
    severity: context.system.cpuOverall >= 88 ? "alarm" : drive.divergence >= 0.6 ? "warning" : "info",
  };
}

export function renderMemoryMonitor(
  context: RenderContext,
  dependencies: SystemMonitorRenderDependencies,
): PanelRender {
  const { system, width, height } = context;
  const drive = buildVisualizationDrive(context, Math.max(width, 48));
  const graphWidth = Math.max(12, width);
  const graphHeight = Math.max(3, Math.floor((height - 4) / 2));
  const memoryGraph = dependencies.plotHistory(
    system.memoryHistory,
    graphWidth,
    graphHeight,
    dependencies.monitorGlyph(drive, "phosphor"),
  );
  const swapGraph = dependencies.plotHistory(
    system.swapHistory,
    graphWidth,
    graphHeight,
    drive.hazard >= 0.88 ? "█" : dependencies.monitorGlyph(drive, "amber"),
  );

  return {
    body: [
      `RAM  ${formatPercent(system.memory.percent)}  USED ${formatBytes(system.memory.used)}  AVAIL ${
        formatBytes(system.memory.available)
      }`,
      memoryGraph,
      `SWAP ${formatPercent(system.memory.swapPercent)}  USED ${formatBytes(system.memory.swapUsed)} / ${
        formatBytes(system.memory.swapTotal)
      }`,
      swapGraph,
    ].join("\n"),
    footer: `OS ${system.osRelease}  RANGE ${(drive.span * 100).toFixed(0)}%`,
    alert: system.memory.percent >= 90
      ? "MEMORY SATURATION EVENT"
      : system.memory.swapPercent >= 90
      ? "SWAP CRITICAL EVENT"
      : drive.volatility >= 0.52
      ? "MEMORY SHEAR DETECTED"
      : "",
    accent: system.memory.percent >= 90 || system.memory.swapPercent >= 90
      ? "alarm"
      : system.memory.percent >= 75
      ? "amber"
      : "phosphor",
    severity: system.memory.percent >= 90 || system.memory.swapPercent >= 90
      ? "alarm"
      : system.memory.percent >= 75
      ? "warning"
      : "info",
  };
}

export function renderTemperatureMonitor(
  context: RenderContext,
  dependencies: SystemMonitorRenderDependencies,
): PanelRender {
  const drive = buildVisualizationDrive(context, 24);
  const temperatures = context.system.temperatures;
  return {
    body: temperatures.length === 0
      ? "NO THERMAL ZONES REPORTED"
      : temperatureRows(temperatures, Math.max(1, context.height), drive.hazard, dependencies).join("\n"),
    footer: temperatures[0]
      ? `HOTTEST ${temperatures[0].label.toUpperCase()} ${temperatures[0].celsius.toFixed(1)}C  FLUX ${
        (drive.volatility * 100).toFixed(0)
      }%`
      : "THERMAL BUS OFFLINE",
    alert: temperatures[0]?.celsius >= 82 ? "THERMAL LIMIT ALERT" : "",
    accent: temperatures[0]?.celsius >= 82 ? "alarm" : temperatures[0]?.celsius >= 70 ? "amber" : "violet",
    severity: temperatures[0]?.celsius >= 82 ? "alarm" : temperatures[0]?.celsius >= 70 ? "warning" : "info",
  };
}

export function renderDiskMonitor(
  context: RenderContext,
  dependencies: SystemMonitorRenderDependencies,
): PanelRender {
  const drive = buildVisualizationDrive(context, 32);
  const disks = context.system.disks;
  return {
    body: disks.length === 0
      ? "NO DISK METRICS AVAILABLE"
      : diskRows(disks, Math.max(1, context.height), drive.hazard, dependencies).join("\n"),
    footer: disks[0]
      ? `FULL ${disks[0].mount.toUpperCase()} ${disks[0].percent}%  ${formatBytes(disks[0].used)} / ${
        formatBytes(disks[0].total)
      }`
      : "FILESYSTEM BUS IDLE",
    alert: disks[0]?.percent >= 95 ? "CAPACITY WALL IMMINENT" : disks[0]?.percent >= 85 ? "DISK PRESSURE WARNING" : "",
    accent: disks[0]?.percent >= 95 ? "alarm" : disks[0]?.percent >= 85 ? "amber" : "amber",
    severity: disks[0]?.percent >= 95 ? "alarm" : disks[0]?.percent >= 85 ? "warning" : "info",
  };
}

export function renderProcessMonitor(context: RenderContext): PanelRender {
  const drive = buildVisualizationDrive(context, 24);
  const header = "PID     NAME             CPU%   MEM%";
  const rows = processRows(context.system.processes, 100);

  return {
    body: [header, ...rows].join("\n"),
    footer: context.system.processes[0]
      ? `HOT ${context.system.processes[0].name.toUpperCase()} ${
        context.system.processes[0].cpuPercent.toFixed(1)
      }% CPU  TOP ${Math.min(100, context.system.processes.length)}  RISE ${
        (Math.max(0, drive.slope) * 100).toFixed(0)
      }%`
      : "PROCESS TABLE EMPTY",
    alert: context.system.processes[0]?.cpuPercent >= 90 ? "PROCESS SPIKE DETECTED" : "",
    accent: context.system.processes[0]?.cpuPercent >= 90 ? "alarm" : "amber",
    severity: context.system.processes[0]?.cpuPercent >= 90 ? "alarm" : "info",
  };
}

export function renderGpuCombinedMonitor(
  context: RenderContext,
  dependencies: GpuMonitorRenderDependencies,
): PanelRender {
  const { system, width, height } = context;
  const drive = buildVisualizationDrive(context, Math.max(width, 48));
  if (!system.gpu.available) return renderGpuOfflinePanel("GPU FUSION OFFLINE", "violet");

  const graphHeight = Math.max(2, Math.floor((height - 5) / 2));
  const chipGraph = dependencies.plotHistory(
    system.gpuUtilizationHistory,
    Math.max(12, width),
    graphHeight,
    dependencies.monitorGlyph(drive, "violet"),
  );
  const memoryGraph = dependencies.plotHistory(
    system.gpuMemoryHistory,
    Math.max(12, width),
    graphHeight,
    dependencies.monitorGlyph(drive, "phosphor"),
  );
  return {
    body: [
      crop(system.gpu.name.toUpperCase(), width),
      `CHIP ${formatPercent(system.gpu.utilizationPercent)} ${
        dependencies.miniMeter(system.gpu.utilizationPercent / 100, 12, drive.hazard)
      }`,
      chipGraph,
      `VRAM ${formatPercent(system.gpu.memoryPercent)} ${formatBytes(system.gpu.memoryUsed)} / ${
        formatBytes(system.gpu.memoryTotal)
      }`,
      memoryGraph,
      `TEMP ${formatOptionalNumber(system.gpu.temperatureCelsius, "C")}  POWER ${
        formatOptionalNumber(system.gpu.powerWatts, "W")
      }`,
    ].join("\n"),
    footer: `GPU FUSION  GFX ${formatOptionalNumber(system.gpu.graphicsClockMhz, "MHz")}  MEMCLK ${
      formatOptionalNumber(system.gpu.memoryClockMhz, "MHz")
    }`,
    alert: gpuAlert(context),
    accent: gpuAccent(system.gpu.utilizationPercent, system.gpu.memoryPercent, true),
    severity: gpuSeverity(system.gpu.utilizationPercent, system.gpu.memoryPercent),
  };
}

export function renderGpuChipMonitor(context: RenderContext, dependencies: GpuMonitorRenderDependencies): PanelRender {
  const { system, width, height } = context;
  const drive = buildVisualizationDrive(context, Math.max(width, 40));
  if (!system.gpu.available) return renderGpuOfflinePanel("GPU CHIP OFFLINE", "violet");

  const graphHeight = Math.max(3, height - 5);
  const graph = dependencies.plotHistory(
    system.gpuUtilizationHistory,
    Math.max(12, width),
    graphHeight,
    dependencies.monitorGlyph(drive, "violet"),
  );
  const pulse = gpuPulseGlyphs(
    system.gpu.utilizationPercent / 100,
    Math.min(18, Math.max(8, width - 14)),
    drive.hazard,
  );
  return {
    body: [
      `${crop(system.gpu.name.toUpperCase(), Math.max(8, width - 8))} CORE`,
      `UTIL ${formatPercent(system.gpu.utilizationPercent)} ${pulse}`,
      graph,
      `TEMP ${formatOptionalNumber(system.gpu.temperatureCelsius, "C")}  POWER ${
        formatOptionalNumber(system.gpu.powerWatts, "W")
      }`,
      `GFX ${formatOptionalNumber(system.gpu.graphicsClockMhz, "MHz")}  MEMORY ${
        formatOptionalNumber(system.gpu.memoryClockMhz, "MHz")
      }`,
    ].join("\n"),
    footer: `CHIP BUS  VOLATILITY ${(drive.volatility * 100).toFixed(0)}%  SURGE ${
      (Math.max(0, drive.slope) * 100).toFixed(0)
    }%`,
    alert: system.gpu.utilizationPercent >= 95
      ? "GPU EXECUTION WALL"
      : drive.volatility >= 0.58
      ? "GPU PULSE SHEAR"
      : "",
    accent: gpuAccent(system.gpu.utilizationPercent, 0, true),
    severity: gpuSeverity(system.gpu.utilizationPercent, 0),
  };
}

export function renderGpuMemoryMonitor(
  context: RenderContext,
  dependencies: GpuMonitorRenderDependencies,
): PanelRender {
  const { system, width, height } = context;
  const drive = buildVisualizationDrive(context, Math.max(width, 40));
  if (!system.gpu.available) return renderGpuOfflinePanel("GPU MEMORY OFFLINE", "phosphor");

  const bankCount = Math.max(4, Math.min(12, Math.floor(width / 5)));
  const banks = new Array<number>(bankCount);
  for (let index = 0; index < bankCount; index++) {
    const phaseShift = Math.sin(context.phase * 0.11 + index * 0.9) * 0.06;
    banks[index] = clamp(system.gpu.memoryPercent / 100 + phaseShift, 0, 1);
  }
  const bankRows = dependencies.barChart(banks, bankCount * 3, Math.max(3, Math.min(8, height - 5)), [
    " ",
    "░",
    "▒",
    "▓",
    "█",
  ]);
  return {
    body: [
      `VRAM ${formatPercent(system.gpu.memoryPercent)} ${
        dependencies.miniMeter(system.gpu.memoryPercent / 100, 14, drive.hazard)
      }`,
      `${formatBytes(system.gpu.memoryUsed)} USED`,
      `${formatBytes(Math.max(0, system.gpu.memoryTotal - system.gpu.memoryUsed))} FREE`,
      bankRows,
      `TOTAL ${formatBytes(system.gpu.memoryTotal)}  MEMCLK ${formatOptionalNumber(system.gpu.memoryClockMhz, "MHz")}`,
    ].join("\n"),
    footer: `VRAM BANKS ${bankCount}  FRAGMENT ${(drive.divergence * 100).toFixed(0)}%`,
    alert: system.gpu.memoryPercent >= 92
      ? "VRAM CAPACITY WALL"
      : system.gpu.memoryPercent >= 78
      ? "VRAM PRESSURE"
      : "",
    accent: gpuAccent(0, system.gpu.memoryPercent, true),
    severity: gpuSeverity(0, system.gpu.memoryPercent),
  };
}

function gpuAccent(utilization: number, memory: number, available: boolean): Accent {
  if (!available) return "violet";
  const pressure = Math.max(utilization, memory);
  return pressure >= 92 ? "alarm" : pressure >= 75 ? "amber" : memory > utilization ? "phosphor" : "violet";
}

function gpuSeverity(utilization: number, memory: number): Severity {
  const pressure = Math.max(utilization, memory);
  return pressure >= 92 ? "alarm" : pressure >= 75 ? "warning" : "info";
}

function gpuAlert(context: RenderContext) {
  const { gpu } = context.system;
  if (!gpu.available) return "";
  if (gpu.memoryPercent >= 92) return "VRAM LIMIT";
  if (gpu.utilizationPercent >= 95) return "GPU EXECUTION WALL";
  if ((gpu.temperatureCelsius ?? 0) >= 84) return "GPU THERMAL LIMIT";
  return "";
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `${days}d ${String(hours % 24).padStart(2, "0")}h`;
  }
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function cpuActivityRgb(percent: number): [number, number, number] {
  const value = Number.isFinite(percent) ? clamp(percent, 0, 100) : 0;
  let upperIndex = cpuHexColorStops.length - 1;
  for (let index = 0; index < cpuHexColorStops.length; index += 1) {
    if (value <= cpuHexColorStops[index]!.percent) {
      upperIndex = index;
      break;
    }
  }
  const upper = cpuHexColorStops[Math.max(0, upperIndex)] ?? cpuHexColorStops[cpuHexColorStops.length - 1]!;
  const lower = cpuHexColorStops[Math.max(0, upperIndex - 1)] ?? upper;
  const span = Math.max(1, upper.percent - lower.percent);
  const position = clamp((value - lower.percent) / span, 0, 1);

  return [
    Math.round(lerp(lower.rgb[0], upper.rgb[0], position)),
    Math.round(lerp(lower.rgb[1], upper.rgb[1], position)),
    Math.round(lerp(lower.rgb[2], upper.rgb[2], position)),
  ];
}

export function cpuHexGridColumnCount(
  cores: RenderContext["system"]["cpuCores"],
  width: number,
  height: number,
): number {
  if (cores.length === 0) return 1;
  const labelWidth = cpuHexLabelWidth(cores);
  const mode = cpuHexTileMode(width, height, cores.length, labelWidth);
  return cpuHexColumns(width, cpuHexTileWidth(mode, labelWidth));
}

function cpuHexTileLayout(
  cores: RenderContext["system"]["cpuCores"],
  width: number,
  height: number,
): CpuHexTileLayout[] {
  return cpuHexTileLayoutInto([], cores, width, height);
}

export function cpuHexTileLayoutInto(
  target: CpuHexTileLayout[],
  cores: RenderContext["system"]["cpuCores"],
  width: number,
  height: number,
): CpuHexTileLayout[] {
  if (cores.length === 0) {
    target.length = 0;
    return target;
  }
  const labelWidth = cpuHexLabelWidth(cores);
  const mode = cpuHexTileMode(width, height, cores.length, labelWidth);
  const tileWidth = cpuHexTileWidth(mode, labelWidth);
  const tileHeight = cpuHexTileHeight(mode);
  const columns = cpuHexColumns(width, tileWidth);
  target.length = cores.length;
  for (let index = 0; index < cores.length; index++) {
    const core = cores[index]!;
    const logicalRow = Math.floor(index / columns);
    const columnIndex = index % columns;
    const indent = logicalRow % 2 === 1 ? cpuHexIndent(width, tileWidth) : 0;
    const tile = target[index] ?? {
      core,
      label: core.label,
      column: indent + columnIndex * (tileWidth + 1),
      row: logicalRow * tileHeight,
      width: tileWidth,
      height: tileHeight,
    };
    tile.core = core;
    tile.label = core.label;
    tile.column = indent + columnIndex * (tileWidth + 1);
    tile.row = logicalRow * tileHeight;
    tile.width = tileWidth;
    tile.height = tileHeight;
    target[index] = tile;
  }
  return target;
}

function processMatchesCpuLabel(process: CpuProcessSnapshot, label: string): boolean {
  const cpuId = Number(label);
  return Number.isFinite(cpuId) ? process.processor === cpuId : String(process.processor) === label;
}

export function topCpuProcessLabelForCpu(
  label: string,
  processes: readonly CpuProcessSnapshot[],
  limit = 3,
): string {
  const boundedLimit = Math.max(0, Math.floor(limit));
  let count = 0;
  let output = "";
  for (let index = 0; index < processes.length && count < boundedLimit; index += 1) {
    const process = processes[index]!;
    if (!processMatchesCpuLabel(process, label)) continue;
    if (count > 0) output += ", ";
    output += `${process.name}:${process.cpuPercent.toFixed(0)}%`;
    count += 1;
  }
  return count > 0 ? output : "no top process in sample";
}

export function selectedCpuHexTilesWith(
  source: Readonly<Record<string, string>>,
  id: string,
  label: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const key in source) {
    next[key] = source[key]!;
  }
  next[id] = label;
  return next;
}

export function cpuHexTileScrollTarget(options: CpuHexScrollTargetOptions): CpuHexScrollOffset | undefined {
  const tile = findCpuHexTile(options.tiles, options.label);
  if (!tile) return undefined;

  const bodyHeaderRows = options.bodyHeaderRows ?? 2;
  const summaryRows = options.summaryRows ?? 2;
  const tileRow = bodyHeaderRows + summaryRows + tile.row;
  const viewportHeight = Math.max(1, Math.floor(options.viewportHeight));
  if (tileRow < options.offset.rows) {
    return { columns: options.offset.columns, rows: tileRow };
  }
  if (tileRow >= options.offset.rows + viewportHeight) {
    return {
      columns: options.offset.columns,
      rows: tileRow - Math.max(0, viewportHeight - 1),
    };
  }
  return undefined;
}

export function nextCpuHexLabel(
  cores: readonly CpuCoreSnapshot[],
  currentLabel: string | undefined,
  key: CpuHexNavigationKey,
  columns: number,
): string | undefined {
  if (cores.length === 0) return undefined;
  const currentIndex = Math.max(0, cores.findIndex((core) => core.label === currentLabel));
  const clampedColumns = Math.max(1, Math.floor(columns));
  const rawNextIndex = key === "home"
    ? 0
    : key === "end"
    ? cores.length - 1
    : key === "left"
    ? currentIndex - 1
    : key === "right"
    ? currentIndex + 1
    : key === "up"
    ? currentIndex - clampedColumns
    : currentIndex + clampedColumns;
  return cores[Math.max(0, Math.min(cores.length - 1, rawNextIndex))]!.label;
}

export function renderCpuHexGrid(context: RenderContext): PanelRender {
  const { system, width, height } = context;
  const drive = buildVisualizationDrive(context, Math.max(width, 48));
  const cores = system.cpuCores;

  if (cores.length === 0) {
    return {
      body: "NO CORE DATA",
      footer: `HOST ${system.hostname.toUpperCase()}  LOAD ${formatLoadAverage(system.loadavg, "/")}`,
      alert: "",
      accent: "signal",
      severity: "info",
    };
  }

  let hotCore = cores[0]!;
  for (let index = 1; index < cores.length; index += 1) {
    const core = cores[index]!;
    if (core.usage > hotCore.usage) hotCore = core;
  }
  const selectedCore = selectedCpuCore(cores, context.selectedCpuLabel);
  const lines = [
    crop(
      `AVG ${formatPercent(system.cpuOverall)}  CORES ${cores.length}  HOT CPU${hotCore.label} ${
        formatPercent(hotCore.usage)
      }`,
      width,
    ),
    cpuHexGradientLegend(width),
    ...cpuHexGridRows(cores, width, height, selectedCore?.label),
    "",
    ...cpuHexSelectionLines(system, selectedCore, width),
  ];

  return {
    body: lines.join("\n"),
    footer: `HEX GRID  BLUE 0  GREEN 25  YELLOW 50  ORANGE 75  RED 100`,
    alert: system.cpuOverall >= 88 ? "PULSE LIMIT" : drive.divergence >= 0.6 ? "CORE DESYNC" : "",
    accent: system.cpuOverall >= 88 ? "alarm" : system.cpuOverall >= 72 ? "amber" : "signal",
    severity: severityForValue(system.cpuOverall, 72, 88),
  };
}

function lerp(start: number, end: number, position: number) {
  return start + (end - start) * position;
}

function findCpuHexTile(tiles: readonly CpuHexTileLayout[], label: string): CpuHexTileLayout | undefined {
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index]!;
    if (tile.label === label) return tile;
  }
  return undefined;
}

function cpuHexGradientLegend(width: number): string {
  const stops = [
    ["0", 0],
    ["25", 25],
    ["50", 50],
    ["75", 75],
    ["100", 100],
  ] as const;
  if (width >= 26) {
    let full = "LOAD ";
    for (let index = 0; index < stops.length; index += 1) {
      const [label, percent] = stops[index]!;
      if (index > 0) full += " ";
      full += cpuHexColorize(percent, "⬢") + label;
    }
    return full;
  }
  if (width >= 10) {
    let compact = "";
    for (let index = 0; index < stops.length; index += 1) {
      if (index > 0) compact += " ";
      compact += cpuHexColorize(stops[index]![1], "⬢");
    }
    return compact;
  }
  const count = Math.max(1, Math.min(width, stops.length));
  let narrow = "";
  for (let index = 0; index < count; index += 1) {
    narrow += cpuHexColorize(stops[index]![1], "⬢");
  }
  return narrow;
}

function cpuHexGridRows(
  cores: RenderContext["system"]["cpuCores"],
  width: number,
  height: number,
  selectedCpuLabel?: string,
): string[] {
  const labelWidth = cpuHexLabelWidth(cores);
  const mode = cpuHexTileMode(width, height, cores.length, labelWidth);
  const tileWidth = cpuHexTileWidth(mode, labelWidth);
  const layout = cpuHexTileLayout(cores, width, height);
  let rows = 1;
  for (const tile of layout) {
    rows = Math.max(rows, tile.row + tile.height);
  }
  const cursors = new Array<number>(rows);
  const lines = new Array<string>(rows);
  for (let index = 0; index < rows; index++) {
    cursors[index] = 0;
    lines[index] = "";
  }

  for (const tile of layout) {
    const rendered = cpuHexTile(tile.core, mode, labelWidth, tileWidth, tile.label === selectedCpuLabel);
    for (let lineIndex = 0; lineIndex < rendered.length; lineIndex += 1) {
      const row = tile.row + lineIndex;
      const padding = Math.max(0, tile.column - cursors[row]!);
      lines[row] += " ".repeat(padding) + rendered[lineIndex]!;
      cursors[row] = tile.column + tile.width;
    }
  }

  return lines;
}

function cpuHexLabelWidth(cores: RenderContext["system"]["cpuCores"]): number {
  let width = 3;
  for (const core of cores) {
    width = Math.max(width, core.label.length);
  }
  return width;
}

function cpuHexTileMode(width: number, height: number, coreCount: number, labelWidth: number): CpuHexTileMode {
  const cellWidth = cpuHexTileWidth("cell", labelWidth);
  const cellColumns = cpuHexColumns(width, cellWidth);
  const cellRows = Math.ceil(coreCount / cellColumns) * cpuHexTileHeight("cell");
  if (width >= 32 && height >= 5) {
    return "cell";
  }
  if (width >= 72 && cellRows <= Math.max(4, height + 4)) {
    return "cell";
  }
  return width >= 18 ? "labeled" : "compact";
}

function cpuHexTileWidth(mode: CpuHexTileMode, labelWidth: number) {
  switch (mode) {
    case "cell":
      return labelWidth + 5;
    case "labeled":
      return labelWidth + 1;
    case "compact":
      return 1;
  }
}

function cpuHexTileHeight(mode: CpuHexTileMode) {
  return mode === "cell" ? 2 : 1;
}

function cpuHexColumns(width: number, tileWidth: number) {
  const available = Math.max(1, width - cpuHexIndent(width, tileWidth));
  return Math.max(1, Math.floor((available + 1) / (tileWidth + 1)));
}

function cpuHexIndent(width: number, tileWidth: number) {
  return width >= tileWidth * 3 ? Math.floor(tileWidth / 2) : 0;
}

function cpuHexTile(
  core: RenderContext["system"]["cpuCores"][number],
  mode: CpuHexTileMode,
  labelWidth: number,
  tileWidth: number,
  selected = false,
): string[] {
  const label = core.label.padStart(labelWidth, "0");
  const usage = Number.isFinite(core.usage) ? clamp(core.usage, 0, 100) : 0;
  const percent = `${Math.round(usage).toString().padStart(3, " ")}%`;
  if (mode === "cell") {
    const innerWidth = Math.max(2, tileWidth - 2);
    const top = `╱${centerText(`CPU${label}`, innerWidth)}╲`;
    const bottom = `╲${centerText(percent, innerWidth)}╱`;
    return [
      cpuHexColorize(usage, top.padEnd(tileWidth, " "), selected, "top"),
      cpuHexColorize(usage, bottom.padEnd(tileWidth, " "), selected, "bottom"),
    ];
  }

  const text = mode === "labeled" ? `⬢${label}` : "⬢";
  return [cpuHexColorize(usage, text.padEnd(tileWidth, " "), selected, "compact")];
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}${" ".repeat(width - text.length - left)}`;
}

function cpuHexColorize(
  percent: number,
  text: string,
  selected = false,
  part: "top" | "bottom" | "compact" = "compact",
): string {
  const [r, g, b] = cpuActivityRgb(percent);
  if (selected) {
    return `\x1b[1;38;2;5;7;13;48;2;${r};${g};${b}m${text}\x1b[0m`;
  }
  if (part !== "compact") {
    const backgroundScale = part === "top" ? 0.13 : 0.18;
    const bg = [
      Math.max(0, Math.round(r * backgroundScale)),
      Math.max(0, Math.round(g * backgroundScale)),
      Math.max(0, Math.round(b * backgroundScale)),
    ];
    return `\x1b[38;2;${r};${g};${b};48;2;${bg[0]};${bg[1]};${bg[2]}m${text}\x1b[0m`;
  }
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function selectedCpuCore(
  cores: RenderContext["system"]["cpuCores"],
  selectedCpuLabel: string | undefined,
) {
  if (!selectedCpuLabel) return undefined;
  const selectedNumber = Number(selectedCpuLabel);
  for (const core of cores) {
    if (
      core.label === selectedCpuLabel ||
      (Number.isFinite(selectedNumber) && Number(core.label) === selectedNumber)
    ) {
      return core;
    }
  }
  return undefined;
}

function cpuHexSelectionLines(
  system: RenderContext["system"],
  core: RenderContext["system"]["cpuCores"][number] | undefined,
  width: number,
): string[] {
  if (!core) {
    return [crop("SELECT A HEX TILE FOR CPU ID + PROCESS SAMPLE", width)];
  }

  const range = cpuIdRange(system.cpuCores);
  const header = crop(
    `SELECTED CPU ID ${core.label}${range ? ` (${range})` : ""}  LOAD ${formatPercent(core.usage)}`,
    width,
  );
  let hasProcessorSamples = false;
  for (const process of system.processes) {
    if (Number.isFinite(process.processor)) {
      hasProcessorSamples = true;
      break;
    }
  }
  if (!hasProcessorSamples) {
    return [header, crop("PROCESSOR FIELD UNAVAILABLE IN THIS SAMPLE", width)];
  }

  const maxProcesses = width >= 48 ? 6 : 4;
  let matchCount = 0;
  for (const process of system.processes) {
    if (processMatchesCpuLabel(process, core.label)) matchCount += 1;
  }
  if (matchCount === 0) {
    return [header, crop("NO TOP PROCESS LAST SEEN ON THIS CPU", width)];
  }

  const rows = new Array<string>(Math.min(maxProcesses, matchCount) + 3);
  rows[0] = header;
  rows[1] = crop("TOP PROCESSES LAST SEEN ON CPU", width);
  rows[2] = crop(width >= 48 ? "PID      CPU%   MEM%  S  NAME" : "PID     CPU%  MEM% NAME", width);
  let rowIndex = 3;
  for (const process of system.processes) {
    if (!processMatchesCpuLabel(process, core.label)) continue;
    rows[rowIndex] = cpuHexProcessLine(process, width);
    rowIndex += 1;
    if (rowIndex >= rows.length) break;
  }
  return rows;
}

function cpuIdRange(cores: RenderContext["system"]["cpuCores"]): string {
  if (cores.length === 0) return "";
  let min = Infinity;
  let max = -Infinity;
  for (const core of cores) {
    const id = Number(core.label);
    if (!Number.isFinite(id)) return "";
    min = Math.min(min, id);
    max = Math.max(max, id);
  }
  return `${min}-${max}`;
}

function cpuHexProcessLine(process: RenderContext["system"]["processes"][number], width: number): string {
  const nameWidth = width >= 48 ? Math.max(8, width - 27) : Math.max(6, width - 21);
  const name = crop(process.name, nameWidth).padEnd(nameWidth, " ");
  if (width >= 48) {
    return crop(
      `${String(process.pid).padEnd(8, " ")}${process.cpuPercent.toFixed(1).padStart(6, " ")} ${
        process.memoryPercent.toFixed(1).padStart(6, " ")
      }  ${crop(process.state, 1).padEnd(1, " ")}  ${name}`,
      width,
    );
  }
  return crop(
    `${String(process.pid).padEnd(7, " ")}${process.cpuPercent.toFixed(0).padStart(4, " ")}% ${
      process.memoryPercent.toFixed(0).padStart(4, " ")
    }% ${name}`,
    width,
  );
}

function topCpuCoreSummary(cores: RenderContext["system"]["cpuCores"]): string {
  if (cores.length === 0) return "";
  const sorted = topCpuCores(cores, 4);
  const count = sorted.length;
  const rows = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const core = sorted[index]!;
    rows[index] = `CPU${core.label.padStart(2, "0")} ${core.usage.toFixed(0).padStart(3, " ")}%`;
  }
  return rows.join("  ");
}

function topCpuCores(
  cores: RenderContext["system"]["cpuCores"],
  limit: number,
): RenderContext["system"]["cpuCores"] {
  const count = Math.min(Math.max(0, Math.floor(limit)), cores.length);
  const top = new Array<RenderContext["system"]["cpuCores"][number]>(count);
  for (let index = 0; index < cores.length; index += 1) {
    const core = cores[index]!;
    let insertAt = -1;
    for (let target = 0; target < count; target += 1) {
      const existing = top[target];
      if (!existing || core.usage > existing.usage) {
        insertAt = target;
        break;
      }
    }
    if (insertAt < 0) continue;
    for (let target = count - 1; target > insertAt; target -= 1) {
      top[target] = top[target - 1]!;
    }
    top[insertAt] = core;
  }
  return top;
}

function temperatureRows(
  temperatures: RenderContext["system"]["temperatures"],
  limit: number,
  hazard: number,
  dependencies: SystemMonitorRenderDependencies,
): string[] {
  const count = Math.min(limit, temperatures.length);
  const rows = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const entry = temperatures[index]!;
    rows[index] = `${entry.label.toUpperCase().padEnd(18, " ")} ${entry.celsius.toFixed(1).padStart(6, " ")}C ${
      heatMeter(entry.celsius / 100, hazard, dependencies)
    }`;
  }
  return rows;
}

function diskRows(
  disks: RenderContext["system"]["disks"],
  limit: number,
  hazard: number,
  dependencies: SystemMonitorRenderDependencies,
): string[] {
  const count = Math.min(limit, disks.length);
  const rows = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const disk = disks[index]!;
    rows[index] = `${crop(disk.mount.toUpperCase(), 12).padEnd(12, " ")} ${String(disk.percent).padStart(3, " ")}% ${
      dependencies.miniMeter(disk.percent / 100, 7, hazard)
    } ${formatBytes(disk.available).padStart(8, " ")} FREE`;
  }
  return rows;
}

function processRows(processes: RenderContext["system"]["processes"], limit: number): string[] {
  const count = Math.min(limit, processes.length);
  const rows = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const process = processes[index]!;
    rows[index] = `${String(process.pid).padEnd(7, " ")}${crop(process.name, 16).padEnd(16, " ")}${
      process.cpuPercent.toFixed(1).padStart(6, " ")
    }${process.memoryPercent.toFixed(1).padStart(7, " ")}`;
  }
  return rows;
}

function cpuLegendRows(
  cores: RenderContext["system"]["cpuCores"],
  width: number,
  hazard: number,
  dependencies: SystemMonitorRenderDependencies,
): string[] {
  if (cores.length === 0) return ["NO CORE DATA"];

  const sample = coreLegendCell(cores[0]!, hazard, dependencies);
  const cellWidth = Math.max(12, sample.length);
  const columns = Math.max(1, Math.min(8, Math.floor((Math.max(12, width) + 2) / (cellWidth + 2))));
  const rows = Math.ceil(cores.length / columns);
  const result: string[] = new Array(rows);

  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let column = 0; column < columns; column++) {
      const core = cores[row + column * rows];
      if (!core) continue;
      if (line.length > 0) line += "  ";
      line += coreLegendCell(core, hazard, dependencies).padEnd(cellWidth, " ");
    }
    result[row] = crop(line, Math.max(12, width));
  }

  return result;
}

function coreLegendCell(
  core: RenderContext["system"]["cpuCores"][number],
  hazard: number,
  dependencies: SystemMonitorRenderDependencies,
): string {
  // Right-align the percent so "9.9%" and "15.0%" cells stay one width and
  // the legend columns cannot drift (QA-010).
  return `${core.label.padStart(3, "0")} ${dependencies.miniMeter(core.usage / 100, 6, hazard)} ${
    formatPercent(core.usage).padStart(5)
  }`;
}

function heatMeter(value: number, heat: number, dependencies: SystemMonitorRenderDependencies) {
  const width = heat >= 0.9 ? 5 : 4;
  return dependencies.miniMeter(value, width, heat);
}

function gpuPulseGlyphs(value: number, width: number, heat: number) {
  const fill = Math.round(clamp(value, 0, 1) * width);
  const active = heat >= 0.85 ? "◆" : "◇";
  return active.repeat(fill).padEnd(width, "·");
}

function renderGpuOfflinePanel(message: string, accent: Accent): PanelRender {
  return {
    body: [
      message,
      "NVIDIA-SMI TELEMETRY NOT AVAILABLE",
      "GPU PANEL WILL AUTO-LINK WHEN DRIVER METRICS APPEAR",
    ].join("\n"),
    footer: "GPU BUS OFFLINE",
    alert: "",
    accent,
    severity: "info",
  };
}
