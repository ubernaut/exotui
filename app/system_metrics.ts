import type { RuntimeSystemMemoryInfo } from "../src/runtime/host.ts";
import { runtimeHost } from "../src/runtime/host.ts";
import { Signal } from "../src/signals/mod.ts";
import type { DiagnosticsCollector } from "../src/runtime/diagnostics.ts";
import { errorMessage } from "../src/utils/formatting.ts";
import { clamp } from "./styles.ts";
import type {
  AlertMessage,
  CpuCoreSnapshot,
  DiskSnapshot,
  GpuSnapshot,
  NetworkSnapshot,
  ProcessSnapshot,
  SystemMetricDiagnostic,
  SystemSnapshot,
  TemperatureSnapshot,
} from "./types.ts";

const COMMAND_OUTPUT_DECODER = new TextDecoder();

export interface SystemMetricsDirEntry {
  name: string;
  isDirectory: boolean;
}

export interface SystemMetricsCommandOutput {
  success: boolean;
  stdout: Uint8Array;
}

export interface SystemMetricsCommandOptions {
  timeoutMs?: number;
}

export interface SystemMetricsNetworkInterface {
  name: string;
  address: string;
}

export interface SystemMetricsProvider {
  now(): number;
  hostname(): string;
  osRelease(): string;
  hardwareConcurrency(): number;
  systemMemoryInfo(): RuntimeSystemMemoryInfo;
  loadavg(): [number, number, number];
  networkInterfaces(): SystemMetricsNetworkInterface[];
  readTextFile(path: string): Promise<string>;
  readDir(path: string): AsyncIterable<SystemMetricsDirEntry>;
  command(command: string, args: string[], options?: SystemMetricsCommandOptions): Promise<SystemMetricsCommandOutput>;
}

export class DenoSystemMetricsProvider implements SystemMetricsProvider {
  now(): number {
    return Date.now();
  }

  hostname(): string {
    return runtimeHost.hostname();
  }

  osRelease(): string {
    return runtimeHost.osRelease();
  }

  hardwareConcurrency(): number {
    return navigator.hardwareConcurrency || 1;
  }

  systemMemoryInfo(): RuntimeSystemMemoryInfo {
    return runtimeHost.systemMemoryInfo();
  }

  loadavg(): [number, number, number] {
    const loadavg = runtimeHost.loadavg();
    return [loadavg[0] ?? 0, loadavg[1] ?? 0, loadavg[2] ?? 0];
  }

  networkInterfaces(): SystemMetricsNetworkInterface[] {
    return runtimeHost.networkInterfaces();
  }

  readTextFile(path: string): Promise<string> {
    return runtimeHost.readTextFile(path);
  }

  readDir(path: string): AsyncIterable<SystemMetricsDirEntry> {
    return runtimeHost.readDir(path);
  }

  async command(
    command: string,
    args: string[],
    options: SystemMetricsCommandOptions = {},
  ): Promise<SystemMetricsCommandOutput> {
    const child = new runtimeHost.Command(command, {
      args,
      stdout: "piped",
      stderr: "null",
    }).spawn();
    let timeout: number | undefined;
    try {
      const output = child.output();
      const result = options.timeoutMs && options.timeoutMs > 0
        ? await Promise.race([
          output,
          new Promise<never>((_, reject) => {
            timeout = Number(setTimeout(() => {
              try {
                child.kill("SIGKILL");
              } catch {
                // The process may have exited between the timer firing and kill.
              }
              reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
            }, options.timeoutMs));
          }),
        ])
        : await output;
      return {
        success: result.success,
        stdout: result.stdout,
      };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}

interface CpuTimes {
  total: number;
  idle: number;
}

interface CpuStatSample {
  times: CpuTimes[];
  overall: number;
  cores: CpuCoreSnapshot[];
  totalDelta: number;
}

interface TemperatureSample {
  temperatures: TemperatureSnapshot[];
  diagnostic?: SystemMetricDiagnostic;
}

interface NetCounters {
  rxBytes: number;
  txBytes: number;
  sampledAt: number;
}

interface NetworkStatsSample {
  networks: NetworkSnapshot[];
  totalRxRate: number;
  totalTxRate: number;
  counters: Map<string, NetCounters>;
}

/** Result returned by a system GPU metrics provider. */
export interface GpuSample {
  gpu: GpuSnapshot;
  diagnostic?: SystemMetricDiagnostic;
}

/** Context passed to pluggable GPU metrics providers. */
export interface SystemGpuMetricsProviderContext {
  provider: SystemMetricsProvider;
  current: GpuSnapshot;
  diagnostics?: DiagnosticsCollector;
  commandTimeoutMs?: number;
}

/** Pluggable GPU metrics sampler used by SystemMonitor. */
export interface SystemGpuMetricsProvider {
  sampleGpu(context: SystemGpuMetricsProviderContext): Promise<GpuSample>;
}

/** NVIDIA GPU metrics provider backed by nvidia-smi CSV output. */
export class NvidiaSmiGpuMetricsProvider implements SystemGpuMetricsProvider {
  async sampleGpu(context: SystemGpuMetricsProviderContext): Promise<GpuSample> {
    return await sampleNvidiaSmiGpu(context.provider, context.current, context.diagnostics, context.commandTimeoutMs);
  }
}

export function emptyGpuSnapshot(): GpuSnapshot {
  return {
    available: false,
    name: "GPU unavailable",
    utilizationPercent: 0,
    memoryUsed: 0,
    memoryTotal: 0,
    memoryPercent: 0,
    temperatureCelsius: null,
    powerWatts: null,
    graphicsClockMhz: null,
    memoryClockMhz: null,
  };
}

function parseNvidiaSmiGpuRow(row: string): GpuSnapshot | null {
  const parts = row.split(",");
  const name = parts[0]?.trim();
  const utilization = parts[1]?.trim();
  const memoryUsed = parts[2]?.trim();
  const memoryTotal = parts[3]?.trim();
  const temperature = parts[4]?.trim();
  const power = parts[5]?.trim();
  const graphicsClock = parts[6]?.trim();
  const memoryClock = parts[7]?.trim();
  if (!name) return null;
  const total = parseMetricNumber(memoryTotal);
  const used = parseMetricNumber(memoryUsed);
  const utilizationPercent = clamp(parseMetricNumber(utilization), 0, 100);
  const memoryPercent = total > 0 ? clamp((used / total) * 100, 0, 100) : 0;
  return {
    available: true,
    name,
    utilizationPercent,
    memoryUsed: used * 1024 ** 2,
    memoryTotal: total * 1024 ** 2,
    memoryPercent,
    temperatureCelsius: parseNullableMetricNumber(temperature),
    powerWatts: parseNullableMetricNumber(power),
    graphicsClockMhz: parseNullableMetricNumber(graphicsClock),
    memoryClockMhz: parseNullableMetricNumber(memoryClock),
  };
}

/** Parses `/proc/stat` CPU rows and computes utilization from previous jiffy counters. */
export function sampleCpuStatRows(
  text: string,
  previousTimes: readonly CpuTimes[],
  fallbackCores: readonly CpuCoreSnapshot[],
): CpuStatSample {
  const times: CpuTimes[] = [];
  const cores: CpuCoreSnapshot[] = [];
  let overall = 0;
  let totalDelta = 1;
  let index = 0;

  for (const row of text.split("\n")) {
    if (!row.startsWith("cpu")) continue;
    const parts = row.trim().split(/\s+/);
    let idle = 0;
    let total = 0;
    for (let partIndex = 1; partIndex < parts.length; partIndex += 1) {
      const value = Number(parts[partIndex] ?? 0);
      total += value;
      if (partIndex === 4 || partIndex === 5) idle += value;
    }
    const previous = previousTimes[index] ?? { total, idle };
    const nextTotalDelta = total - previous.total;
    const idleDelta = idle - previous.idle;
    const usage = nextTotalDelta > 0 ? clamp(1 - idleDelta / nextTotalDelta, 0, 1) * 100 : 0;

    times[index] = { total, idle };
    if (index === 0) {
      overall = usage;
      totalDelta = Math.max(1, nextTotalDelta);
    } else {
      cores.push({
        label: String(index - 1),
        usage,
      });
    }
    index += 1;
  }

  return {
    times,
    overall,
    cores: cores.length > 0 ? cores : [...fallbackCores],
    totalDelta,
  };
}

/** Parses portable `df -B1P` output into bounded disk snapshots sorted by usage pressure. */
export function parseDfDiskRows(output: string, limit = 8): DiskSnapshot[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) return [];

  const disks: DiskSnapshot[] = [];
  const lines = output.split("\n");
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const filesystem = parts[0] ?? "";
    const mount = parts[5] ?? "/";
    if (!filesystem.startsWith("/dev/") && mount !== "/") continue;
    insertDiskSnapshot(disks, {
      filesystem,
      mount,
      total: Number(parts[1] ?? 0),
      used: Number(parts[2] ?? 0),
      available: Number(parts[3] ?? 0),
      percent: Number((parts[4] ?? "0").replace("%", "")),
    }, safeLimit);
  }
  return disks;
}

/** Parses `/proc/net/dev` rows and computes byte rates from previous counters. */
export function sampleNetworkStats(
  text: string,
  interfaces: readonly SystemMetricsNetworkInterface[],
  previousCounters: ReadonlyMap<string, NetCounters>,
  sampledAt: number,
): NetworkStatsSample {
  const addressMap = new Map<string, string[]>();
  for (const entry of interfaces) {
    if (entry.name === "lo") {
      continue;
    }
    const addresses = addressMap.get(entry.name) ?? [];
    addresses.push(entry.address);
    addressMap.set(entry.name, addresses);
  }

  let totalRxRate = 0;
  let totalTxRate = 0;
  const counters = new Map<string, NetCounters>();

  const networks: NetworkSnapshot[] = [];
  const lines = text.split("\n");
  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim();
    const { rxBytes, txBytes } = parseNetworkByteCounters(line.slice(separator + 1));
    const previous = previousCounters.get(name) ?? { rxBytes, txBytes, sampledAt };
    const elapsedSeconds = Math.max(0.001, (sampledAt - previous.sampledAt) / 1000);
    const rxRate = Math.max(0, (rxBytes - previous.rxBytes) / elapsedSeconds);
    const txRate = Math.max(0, (txBytes - previous.txBytes) / elapsedSeconds);
    counters.set(name, { rxBytes, txBytes, sampledAt });
    if (name !== "lo") {
      totalRxRate += rxRate;
      totalTxRate += txRate;
      const addresses = addressMap.get(name) ?? [];
      if (addresses.length > 0 || rxRate > 0 || txRate > 0) {
        networks.push({
          name,
          addresses,
          rxBytes,
          txBytes,
          rxRate,
          txRate,
        });
      }
    }
  }
  networks.sort(compareNetworkSnapshots);
  if (networks.length > 8) networks.length = 8;

  return {
    networks,
    totalRxRate,
    totalTxRate,
    counters,
  };
}

async function sampleNvidiaSmiGpu(
  provider: SystemMetricsProvider,
  current: GpuSnapshot,
  diagnostics?: DiagnosticsCollector,
  commandTimeoutMs = 1_500,
): Promise<GpuSample> {
  const started = performance.now();
  const sampledAt = provider.now();
  try {
    const result = await runMetricCommand(
      provider,
      "nvidia-smi",
      [
        "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.gr,clocks.mem",
        "--format=csv,noheader,nounits",
      ],
      commandTimeoutMs,
    );
    if (!result.success) {
      diagnostics?.report({
        source: "system-metrics",
        code: "nvidia-smi-unavailable",
        severity: "info",
        message: "nvidia-smi command failed; GPU metrics are unavailable.",
        context: { retainedPreviousGpu: current.available },
      });
      return {
        gpu: current.available ? current : emptyGpuSnapshot(),
        diagnostic: {
          source: "gpu",
          status: current.available ? "degraded" : "unavailable",
          detail: "nvidia-smi command failed",
          durationMs: performance.now() - started,
          sampledAt,
        },
      };
    }

    let gpu: GpuSnapshot | undefined;
    for (const row of COMMAND_OUTPUT_DECODER.decode(result.stdout).split("\n")) {
      if (!row.trim()) continue;
      const parsed = parseNvidiaSmiGpuRow(row);
      if (!parsed) continue;
      if (!gpu || parsed.utilizationPercent > gpu.utilizationPercent) gpu = parsed;
    }
    gpu ??= current.available ? current : emptyGpuSnapshot();
    return {
      gpu,
      diagnostic: {
        source: "gpu",
        status: gpu.available ? "ok" : "unavailable",
        detail: gpu.available ? `sampled ${gpu.name}` : "no GPU rows available",
        durationMs: performance.now() - started,
        sampledAt,
      },
    };
  } catch (error) {
    diagnostics?.report({
      source: "system-metrics",
      code: "nvidia-smi-failed",
      severity: "warning",
      message: "nvidia-smi sampling failed; GPU metrics are unavailable.",
      detail: errorMessage(error),
      context: { retainedPreviousGpu: current.available },
    });
    return {
      gpu: current.available ? current : emptyGpuSnapshot(),
      diagnostic: {
        source: "gpu",
        status: current.available ? "degraded" : "unavailable",
        detail: "nvidia-smi sampling failed",
        durationMs: performance.now() - started,
        sampledAt,
      },
    };
  }
}

function insertDiskSnapshot(disks: DiskSnapshot[], disk: DiskSnapshot, limit: number): void {
  if (disks.length === limit && disk.percent <= (disks[disks.length - 1]?.percent ?? -Infinity)) return;

  let index = 0;
  while (index < disks.length && (disks[index]?.percent ?? -Infinity) >= disk.percent) {
    index += 1;
  }
  disks.splice(index, 0, disk);
  if (disks.length > limit) disks.length = limit;
}

function parseNetworkByteCounters(value: string): { rxBytes: number; txBytes: number } {
  let field = 0;
  let start = -1;
  let rxBytes = 0;
  let txBytes = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const char = index < value.length ? value[index] : " ";
    if (char !== undefined && !isNetworkCounterWhitespace(char)) {
      if (start < 0) start = index;
      continue;
    }
    if (start < 0) continue;
    if (field === 0) {
      rxBytes = Number(value.slice(start, index)) || 0;
    } else if (field === 8) {
      txBytes = Number(value.slice(start, index)) || 0;
      break;
    }
    field += 1;
    start = -1;
  }
  return { rxBytes, txBytes };
}

function isNetworkCounterWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\r" || char === "\n" || char === "\f";
}

function compareNetworkSnapshots(a: NetworkSnapshot, b: NetworkSnapshot): number {
  const aWeight = a.rxRate + a.txRate + (a.addresses.length > 0 ? 10_000_000_000 : 0);
  const bWeight = b.rxRate + b.txRate + (b.addresses.length > 0 ? 10_000_000_000 : 0);
  return bWeight - aWeight;
}

function parseMetricNumber(value: string | undefined): number {
  if (!value || /not supported|n\/a/i.test(value)) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNullableMetricNumber(value: string | undefined): number | null {
  if (!value || /not supported|n\/a/i.test(value)) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Samples Linux thermal zones from `/sys/class/thermal`. */
export async function sampleTemperatures(provider: SystemMetricsProvider): Promise<TemperatureSample> {
  const started = performance.now();
  const sampledAt = provider.now();
  const zones: TemperatureSnapshot[] = [];
  try {
    for await (const entry of provider.readDir("/sys/class/thermal")) {
      if (!entry.name.startsWith("thermal_zone")) {
        continue;
      }

      const base = `/sys/class/thermal/${entry.name}`;
      const [labelText, tempText] = await Promise.all([
        provider.readTextFile(`${base}/type`).catch(() => ""),
        provider.readTextFile(`${base}/temp`).catch(() => ""),
      ]);

      const celsius = Number.parseFloat(tempText.trim());
      if (!Number.isFinite(celsius)) {
        continue;
      }

      zones.push({
        label: labelText.trim() || entry.name,
        celsius: celsius > 1000 ? celsius / 1000 : celsius,
      });
    }
  } catch {
    return {
      temperatures: [],
      diagnostic: {
        source: "temperature",
        status: "unavailable",
        detail: "thermal zone scan failed",
        durationMs: performance.now() - started,
        sampledAt,
      },
    };
  }

  const temperatures = zones.sort((a, b) => b.celsius - a.celsius);
  return {
    temperatures,
    diagnostic: {
      source: "temperature",
      status: temperatures.length > 0 ? "ok" : "unavailable",
      detail: temperatures.length > 0 ? `sampled ${temperatures.length} thermal zone(s)` : "no thermal zones available",
      durationMs: performance.now() - started,
      sampledAt,
    },
  };
}

type SystemProcessSortKey = "cpu" | "memory" | "pid" | "name";
type NetworkCounters = ReturnType<typeof sampleNetworkStats>["counters"];

interface ParsedProcessStat {
  name: string;
  state: string;
  cpuTime: number;
  memoryBytes: number;
  processor?: number;
}

type DiskCache = {
  sampledAt: number;
  disks: DiskSnapshot[];
};

type ProcessStatsSample = {
  stats: PromiseSettledResult<{ pid: number; stat: string }>[];
  scanned: number;
  failedReads: number;
  limited: boolean;
  durationMs: number;
  scanError?: string;
};

type DiskSample = {
  disks: DiskSnapshot[];
  diagnostic?: SystemMetricDiagnostic;
};

type ProcessCache = {
  sampledAt: number;
  processes: ProcessSnapshot[];
};

interface ProcessDiagnosticsInput {
  scanned: number;
  failedReads: number;
  limited: boolean;
  durationMs: number;
  scanError?: string;
}

interface SystemMonitorOptions {
  historyLength?: number;
  provider?: SystemMetricsProvider;
  gpuProvider?: SystemGpuMetricsProvider;
  diagnostics?: DiagnosticsCollector;
  processLimit?: number;
  processScanLimit?: number;
  processSortKey?: SystemProcessSortKey;
  processRefreshMs?: number;
  diskCacheMs?: number;
  commandTimeoutMs?: number;
}

function compactDiagnostics(
  diagnostics: Array<SystemMetricDiagnostic | undefined>,
): SystemMetricDiagnostic[] {
  const compacted: SystemMetricDiagnostic[] = [];
  for (let index = 0; index < diagnostics.length; index += 1) {
    const diagnostic = diagnostics[index];
    if (diagnostic) insertDiagnostic(compacted, diagnostic);
  }
  return compacted;
}

function processDiagnostics(sample: ProcessDiagnosticsInput, sampledAt: number): SystemMetricDiagnostic {
  if (sample.scanError) {
    return {
      source: "process",
      status: "unavailable",
      detail: `/proc scan failed: ${sample.scanError}`,
      durationMs: sample.durationMs,
      sampledAt,
    };
  }
  if (sample.limited) {
    return {
      source: "process",
      status: "limited",
      detail: `process scan capped at ${sample.scanned} entries`,
      durationMs: sample.durationMs,
      sampledAt,
    };
  }
  if (sample.failedReads > 0) {
    return {
      source: "process",
      status: "degraded",
      detail: `${sample.failedReads} process stat read(s) failed`,
      durationMs: sample.durationMs,
      sampledAt,
    };
  }
  return {
    source: "process",
    status: "ok",
    detail: `sampled ${sample.scanned} process entries`,
    durationMs: sample.durationMs,
    sampledAt,
  };
}

function processComparator(
  sortKey: SystemProcessSortKey,
): (left: ProcessSnapshot, right: ProcessSnapshot) => number {
  switch (sortKey) {
    case "memory":
      return (left, right) =>
        right.memoryBytes - left.memoryBytes || right.cpuPercent - left.cpuPercent ||
        left.pid - right.pid;
    case "pid":
      return (left, right) => left.pid - right.pid;
    case "name":
      return (left, right) =>
        left.name.localeCompare(right.name) || right.cpuPercent - left.cpuPercent ||
        left.pid - right.pid;
    case "cpu":
      return (left, right) =>
        right.cpuPercent - left.cpuPercent || right.memoryBytes - left.memoryBytes ||
        left.pid - right.pid;
  }
}

function insertTopProcessSnapshot(
  processes: ProcessSnapshot[],
  process: ProcessSnapshot,
  limit: number,
  compare: (left: ProcessSnapshot, right: ProcessSnapshot) => number,
): void {
  if (limit <= 0) return;
  let low = 0;
  let high = processes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (compare(process, processes[middle]!) < 0) high = middle;
    else low = middle + 1;
  }
  if (low >= limit) return;
  processes.splice(low, 0, process);
  if (processes.length > limit) processes.length = limit;
}

function pushHistory(history: number[], value: number, limit: number): number[] {
  const safeLimit = Math.max(0, limit);
  if (safeLimit === 0) return [];

  const next = new Array<number>(safeLimit);
  const retained = Math.min(history.length, Math.max(0, safeLimit - 1));
  const padding = safeLimit - retained - 1;
  for (let index = 0; index < padding; index++) {
    next[index] = 0;
  }
  const sourceStart = Math.max(0, history.length - retained);
  for (let index = 0; index < retained; index++) {
    next[padding + index] = history[sourceStart + index] ?? 0;
  }
  next[safeLimit - 1] = clamp(value, 0, 1);
  return next;
}

function collectAlerts(input: {
  cpuOverall: number;
  memoryPercent: number;
  swapPercent: number;
  temperatures: TemperatureSnapshot[];
  disks: DiskSnapshot[];
  networks: NetworkSnapshot[];
  gpu: GpuSnapshot;
}): AlertMessage[] {
  const alerts: AlertMessage[] = [];

  if (input.cpuOverall >= 90) {
    alerts.push({
      severity: "alarm",
      title: "CPU LIMIT",
      detail: `EXECUTION LOAD AT ${input.cpuOverall.toFixed(1)}%`,
    });
  } else if (input.cpuOverall >= 75) {
    alerts.push({
      severity: "warning",
      title: "CPU RISE",
      detail: `PROCESSOR WALL AT ${input.cpuOverall.toFixed(1)}%`,
    });
  }

  if (input.memoryPercent >= 90) {
    alerts.push({
      severity: "alarm",
      title: "MEMORY SATURATION",
      detail: `RAM USE AT ${input.memoryPercent.toFixed(1)}%`,
    });
  } else if (input.memoryPercent >= 80) {
    alerts.push({
      severity: "warning",
      title: "MEMORY CLIMB",
      detail: `RAM USE AT ${input.memoryPercent.toFixed(1)}%`,
    });
  }

  if (input.swapPercent >= 90) {
    alerts.push({
      severity: "alarm",
      title: "SWAP CRITICAL",
      detail: `SWAP USE AT ${input.swapPercent.toFixed(1)}%`,
    });
  }

  const hottest = input.temperatures[0];
  if (hottest && hottest.celsius >= 84) {
    alerts.push({
      severity: "alarm",
      title: "THERMAL LIMIT",
      detail: `${hottest.label.toUpperCase()} AT ${hottest.celsius.toFixed(1)}C`,
    });
  } else if (hottest && hottest.celsius >= 72) {
    alerts.push({
      severity: "warning",
      title: "THERMAL RISE",
      detail: `${hottest.label.toUpperCase()} AT ${hottest.celsius.toFixed(1)}C`,
    });
  }

  const fullestDisk = input.disks[0];
  if (fullestDisk && fullestDisk.percent >= 95) {
    alerts.push({
      severity: "alarm",
      title: "DISK CAPACITY",
      detail: `${fullestDisk.mount.toUpperCase()} AT ${fullestDisk.percent}%`,
    });
  } else if (fullestDisk && fullestDisk.percent >= 85) {
    alerts.push({
      severity: "warning",
      title: "DISK PRESSURE",
      detail: `${fullestDisk.mount.toUpperCase()} AT ${fullestDisk.percent}%`,
    });
  }

  let busiestNetwork: NetworkSnapshot | undefined;
  let busiestNetworkRate = -1;
  for (let index = 0; index < input.networks.length; index += 1) {
    const network = input.networks[index]!;
    const rate = network.rxRate + network.txRate;
    if (rate > busiestNetworkRate) {
      busiestNetwork = network;
      busiestNetworkRate = rate;
    }
  }
  if (busiestNetwork && busiestNetwork.rxRate + busiestNetwork.txRate > 125_000_000) {
    alerts.push({
      severity: "warning",
      title: "NETWORK SURGE",
      detail: `${busiestNetwork.name.toUpperCase()} ABOVE 125 MiB/s`,
    });
  }

  if (input.gpu.available && input.gpu.utilizationPercent >= 95) {
    alerts.push({
      severity: "warning",
      title: "GPU SATURATION",
      detail: `${input.gpu.name.toUpperCase()} AT ${input.gpu.utilizationPercent.toFixed(0)}%`,
    });
  }
  if (input.gpu.available && input.gpu.memoryPercent >= 92) {
    alerts.push({
      severity: "alarm",
      title: "VRAM LIMIT",
      detail: `GPU MEMORY AT ${input.gpu.memoryPercent.toFixed(0)}%`,
    });
  }

  if (alerts.length <= 4) return alerts;
  const capped = new Array<AlertMessage>(4);
  for (let index = 0; index < capped.length; index += 1) capped[index] = alerts[index]!;
  return capped;
}

function emptySnapshot(hostname: string, osRelease: string, historyLength: number): SystemSnapshot {
  return {
    timestamp: 0,
    hostname,
    osRelease,
    uptimeSeconds: 0,
    loadavg: [0, 0, 0],
    cpuOverall: 0,
    cpuCores: [],
    cpuHistory: zeroHistory(historyLength),
    gpu: emptyGpuSnapshot(),
    gpuUtilizationHistory: zeroHistory(historyLength),
    gpuMemoryHistory: zeroHistory(historyLength),
    memory: {
      total: 0,
      used: 0,
      available: 0,
      free: 0,
      swapTotal: 0,
      swapUsed: 0,
      percent: 0,
      swapPercent: 0,
    },
    memoryHistory: zeroHistory(historyLength),
    swapHistory: zeroHistory(historyLength),
    temperatures: [],
    disks: [],
    networks: [],
    rxHistory: zeroHistory(historyLength),
    txHistory: zeroHistory(historyLength),
    processes: [],
    alerts: [],
    diagnostics: [],
  };
}

function parseProcessStat(stat: string, pageSize: number): ParsedProcessStat | null {
  const open = stat.indexOf("(");
  const close = stat.lastIndexOf(")");
  if (open === -1 || close === -1) {
    return null;
  }
  const name = stat.slice(open + 1, close);
  const fields = readProcessStatFields(stat, close + 2);
  const state = fields.state ?? "?";
  const utime = fields.utime ?? 0;
  const stime = fields.stime ?? 0;
  const rssPages = fields.rssPages ?? 0;
  const processor = fields.processor ?? Number.NaN;
  return {
    name,
    state,
    cpuTime: utime + stime,
    memoryBytes: rssPages * pageSize,
    processor: Number.isFinite(processor) ? processor : undefined,
  };
}

function diagnosticWeight(status: SystemMetricDiagnostic["status"]): number {
  switch (status) {
    case "unavailable":
      return 4;
    case "degraded":
      return 3;
    case "limited":
      return 2;
    case "stale":
      return 2;
    case "ok":
      return 1;
  }
}

function insertDiagnostic(target: SystemMetricDiagnostic[], diagnostic: SystemMetricDiagnostic): void {
  let index = 0;
  while (index < target.length && compareDiagnostics(diagnostic, target[index]!) >= 0) {
    index += 1;
  }
  target.splice(index, 0, diagnostic);
}

function zeroHistory(length: number): number[] {
  return new Array<number>(Math.max(0, length)).fill(0);
}

function compareDiagnostics(left: SystemMetricDiagnostic, right: SystemMetricDiagnostic): number {
  const weight = diagnosticWeight(right.status) - diagnosticWeight(left.status);
  return weight || left.source.localeCompare(right.source);
}

function readProcessStatFields(stat: string, start: number): {
  state?: string;
  utime?: number;
  stime?: number;
  rssPages?: number;
  processor?: number;
} {
  let tokenIndex = 0;
  let tokenStart = -1;
  let state: string | undefined;
  let utime: number | undefined;
  let stime: number | undefined;
  let rssPages: number | undefined;
  let processor: number | undefined;

  for (let index = start; index <= stat.length; index += 1) {
    const code = index < stat.length ? stat.charCodeAt(index) : 32;
    const isWhitespace = code === 32 || code === 9 || code === 10 || code === 13;
    if (isWhitespace) {
      if (tokenStart !== -1) {
        if (tokenIndex === 0) {
          state = stat.slice(tokenStart, index);
        } else if (tokenIndex === 11) {
          utime = Number(stat.slice(tokenStart, index));
        } else if (tokenIndex === 12) {
          stime = Number(stat.slice(tokenStart, index));
        } else if (tokenIndex === 21) {
          rssPages = Number(stat.slice(tokenStart, index));
        } else if (tokenIndex === 36) {
          processor = Number(stat.slice(tokenStart, index));
          break;
        }
        tokenIndex += 1;
        tokenStart = -1;
      }
    } else if (tokenStart === -1) {
      tokenStart = index;
    }
  }

  return { state, utime, stime, rssPages, processor };
}

export class SystemMonitor {
  snapshot: Signal<SystemSnapshot>;

  #provider: SystemMetricsProvider;
  #gpuProvider: SystemGpuMetricsProvider;
  #cpuTimes: CpuTimes[] = [];
  #netCounters: NetworkCounters = new Map();
  #processCpu = new Map<number, number>();
  #timer: number | undefined;
  #sampleInFlight = false;
  #pageSize = 4096;
  #diskCache: DiskCache = { sampledAt: 0, disks: [] };
  #historyLength: number;
  #processLimit: number;
  #processScanLimit: number;
  #processSortKey: SystemProcessSortKey;
  #processRefreshMs: number;
  #processCache?: ProcessCache;
  #diskCacheMs: number;
  #commandTimeoutMs: number;
  #hostname: string;
  #osRelease: string;
  #diagnostics?: DiagnosticsCollector;

  constructor(
    historyLengthOrOptions: number | SystemMonitorOptions = 60,
    provider: SystemMetricsProvider = new DenoSystemMetricsProvider(),
  ) {
    const options = typeof historyLengthOrOptions === "number"
      ? { historyLength: historyLengthOrOptions, provider }
      : historyLengthOrOptions;
    this.#provider = options.provider ?? provider;
    this.#gpuProvider = options.gpuProvider ?? new NvidiaSmiGpuMetricsProvider();
    this.#historyLength = normalizePositiveInteger(options.historyLength, 60);
    this.#processLimit = normalizePositiveInteger(options.processLimit, 100);
    this.#processScanLimit = normalizePositiveInteger(options.processScanLimit, 4096);
    this.#processSortKey = options.processSortKey ?? "cpu";
    this.#processRefreshMs = normalizeNonNegativeInteger(options.processRefreshMs, 0);
    this.#diskCacheMs = normalizePositiveInteger(options.diskCacheMs, 10_000);
    this.#commandTimeoutMs = normalizePositiveInteger(options.commandTimeoutMs, 1_500);
    this.#diagnostics = options.diagnostics;
    this.#hostname = safeHostname(this.#provider, this.#diagnostics);
    this.#osRelease = safeOsRelease(this.#provider, this.#diagnostics);
    this.snapshot = new Signal(emptySnapshot(this.#hostname, this.#osRelease, this.#historyLength));
  }

  async start(intervalMs = 1000) {
    await this.sample();
    this.#timer = Number(setInterval(() => {
      void this.sample();
    }, intervalMs));
  }

  stop() {
    clearInterval(this.#timer);
  }

  async sample() {
    if (this.#sampleInFlight) {
      return;
    }
    this.#sampleInFlight = true;

    try {
      const sampleStarted = performance.now();
      const current = this.snapshot.peek();
      const sampledAt = this.#provider.now();
      const useCachedProcesses = this.#processRefreshMs > 0 && this.#processCache !== undefined &&
        sampledAt - this.#processCache.sampledAt < this.#processRefreshMs;
      const [
        cpuRead,
        uptimeRead,
        networkRead,
        temperatureSample,
        diskSample,
        gpuSample,
        rawProcessSample,
      ] = await Promise.all([
        readMetricText(this.#provider, "/proc/stat", "cpu", ""),
        readMetricText(this.#provider, "/proc/uptime", "uptime", `${current.uptimeSeconds} 0`),
        readMetricText(this.#provider, "/proc/net/dev", "network", ""),
        sampleTemperatures(this.#provider),
        this.#sampleDisks(),
        this.#gpuProvider.sampleGpu({
          provider: this.#provider,
          current: current.gpu,
          diagnostics: this.#diagnostics,
          commandTimeoutMs: this.#commandTimeoutMs,
        }),
        useCachedProcesses ? Promise.resolve(undefined) : this.#collectProcessStats(),
      ]);

      const cpuSample = this.#sampleCpu(cpuRead.text, current);
      const memoryInfo = this.#provider.systemMemoryInfo();
      const memoryUsed = memoryInfo.total - memoryInfo.available;
      const swapUsed = memoryInfo.swapTotal - memoryInfo.swapFree;
      const memoryPercent = memoryInfo.total > 0 ? (memoryUsed / memoryInfo.total) * 100 : 0;
      const swapPercent = memoryInfo.swapTotal > 0 ? (swapUsed / memoryInfo.swapTotal) * 100 : 0;
      const networkSample = this.#sampleNetwork(networkRead.text);
      const processSample = this.#sampleProcesses(rawProcessSample, cpuSample.totalDelta, memoryInfo.total, sampledAt);
      const uptimeSeconds = Number.parseFloat(uptimeRead.text.split(" ")[0] ?? "0");
      const loadavg = this.#provider.loadavg();
      const diagnostics = compactDiagnostics([
        cpuRead.diagnostic,
        uptimeRead.diagnostic,
        networkRead.diagnostic,
        temperatureSample.diagnostic,
        diskSample.diagnostic,
        gpuSample.diagnostic,
        processSample.diagnostic,
        {
          source: "sample",
          status: "ok",
          detail: `sampled ${processSample.processes.length} processes`,
          durationMs: performance.now() - sampleStarted,
          sampledAt,
        },
      ]);

      const nextSnapshot: SystemSnapshot = {
        timestamp: sampledAt,
        hostname: this.#hostname,
        osRelease: this.#osRelease,
        uptimeSeconds,
        loadavg: [loadavg[0] ?? 0, loadavg[1] ?? 0, loadavg[2] ?? 0],
        cpuOverall: cpuSample.overall,
        cpuCores: cpuSample.cores,
        cpuHistory: pushHistory(current.cpuHistory, cpuSample.overall / 100, this.#historyLength),
        gpu: gpuSample.gpu,
        gpuUtilizationHistory: pushHistory(
          current.gpuUtilizationHistory,
          gpuSample.gpu.available ? gpuSample.gpu.utilizationPercent / 100 : 0,
          this.#historyLength,
        ),
        gpuMemoryHistory: pushHistory(
          current.gpuMemoryHistory,
          gpuSample.gpu.available ? gpuSample.gpu.memoryPercent / 100 : 0,
          this.#historyLength,
        ),
        memory: {
          total: memoryInfo.total,
          used: memoryUsed,
          available: memoryInfo.available,
          free: memoryInfo.free,
          swapTotal: memoryInfo.swapTotal,
          swapUsed,
          percent: memoryPercent,
          swapPercent,
        },
        memoryHistory: pushHistory(current.memoryHistory, memoryPercent / 100, this.#historyLength),
        swapHistory: pushHistory(current.swapHistory, swapPercent / 100, this.#historyLength),
        temperatures: temperatureSample.temperatures,
        disks: diskSample.disks,
        networks: networkSample.networks,
        rxHistory: pushHistory(
          current.rxHistory,
          clamp(networkSample.totalRxRate / 125_000_000, 0, 1),
          this.#historyLength,
        ),
        txHistory: pushHistory(
          current.txHistory,
          clamp(networkSample.totalTxRate / 125_000_000, 0, 1),
          this.#historyLength,
        ),
        processes: processSample.processes,
        alerts: collectAlerts({
          cpuOverall: cpuSample.overall,
          memoryPercent,
          swapPercent,
          temperatures: temperatureSample.temperatures,
          disks: diskSample.disks,
          networks: networkSample.networks,
          gpu: gpuSample.gpu,
        }),
        diagnostics,
      };

      this.snapshot.value = nextSnapshot;
    } catch (error) {
      // Keep the last successful snapshot visible if a sample fails.
      this.#diagnostics?.report({
        source: "system-metrics",
        code: "sample-failed",
        severity: "warning",
        message: "System metrics sample failed; keeping last snapshot.",
        detail: errorMessage(error),
      });
    } finally {
      this.#sampleInFlight = false;
    }
  }

  #sampleCpu(text: string, current: SystemSnapshot) {
    const sample = sampleCpuStatRows(text, this.#cpuTimes, current.cpuCores);
    this.#cpuTimes = sample.times;
    return sample;
  }

  #sampleNetwork(text: string) {
    const sampledAt = this.#provider.now();
    const sample = sampleNetworkStats(text, this.#provider.networkInterfaces(), this.#netCounters, sampledAt);
    this.#netCounters = sample.counters;
    return sample;
  }

  async #sampleDisks(): Promise<DiskSample> {
    const now = this.#provider.now();
    if (now - this.#diskCache.sampledAt < this.#diskCacheMs && this.#diskCache.disks.length > 0) {
      return { disks: this.#diskCache.disks };
    }

    const started = performance.now();
    let result: SystemMetricsCommandOutput;
    try {
      result = await runMetricCommand(
        this.#provider,
        "df",
        ["-B1P", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs"],
        this.#commandTimeoutMs,
      );
    } catch (error) {
      return {
        disks: this.#diskCache.disks,
        diagnostic: {
          source: "disk",
          status: this.#diskCache.disks.length > 0 ? "degraded" : "unavailable",
          detail: `df command failed: ${errorMessage(error)}`,
          durationMs: performance.now() - started,
          sampledAt: now,
        },
      };
    }
    if (!result.success) {
      return {
        disks: this.#diskCache.disks,
        diagnostic: {
          source: "disk",
          status: this.#diskCache.disks.length > 0 ? "degraded" : "unavailable",
          detail: "df command failed",
          durationMs: performance.now() - started,
          sampledAt: now,
        },
      };
    }

    const disks = parseDfDiskRows(COMMAND_OUTPUT_DECODER.decode(result.stdout));

    this.#diskCache = {
      sampledAt: now,
      disks,
    };

    return {
      disks,
      diagnostic: {
        source: "disk",
        status: disks.length > 0 ? "ok" : "unavailable",
        detail: disks.length > 0 ? `sampled ${disks.length} filesystem(s)` : "no disk rows available",
        durationMs: performance.now() - started,
        sampledAt: now,
      },
    };
  }

  async #collectProcessStats(): Promise<ProcessStatsSample> {
    const started = performance.now();
    const entries: number[] = [];
    try {
      for await (const entry of this.#provider.readDir("/proc")) {
        if (entry.isDirectory && /^\d+$/.test(entry.name)) {
          entries.push(Number(entry.name));
          if (entries.length >= this.#processScanLimit) {
            break;
          }
        }
      }
    } catch (error) {
      return {
        stats: [],
        scanned: 0,
        failedReads: 0,
        limited: false,
        durationMs: performance.now() - started,
        scanError: errorMessage(error),
      };
    }

    const reads = new Array<Promise<{ pid: number; stat: string }>>(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
      const pid = entries[index]!;
      reads[index] = this.#provider.readTextFile(`/proc/${pid}/stat`).then((stat) => ({ pid, stat }));
    }
    const stats = await Promise.allSettled(reads);
    let failedReads = 0;
    for (const result of stats) {
      if (result.status === "rejected") failedReads += 1;
    }

    return {
      stats,
      scanned: entries.length,
      failedReads,
      limited: entries.length >= this.#processScanLimit,
      durationMs: performance.now() - started,
    };
  }

  #finalizeProcesses(
    sample: ProcessStatsSample,
    totalDelta: number,
    totalMemory: number,
  ) {
    const cpuCount = Math.max(1, this.#provider.hardwareConcurrency());

    const nextProcessCpu = new Map<number, number>();
    const processes: ProcessSnapshot[] = [];
    const compareProcesses = processComparator(this.#processSortKey);
    const useBoundedProcessRows = sample.scanned > this.#processLimit * 3;

    for (const result of sample.stats) {
      if (result.status !== "fulfilled") {
        continue;
      }

      const parsed = parseProcessStat(result.value.stat, this.#pageSize);
      if (!parsed) {
        continue;
      }

      const previousTime = this.#processCpu.get(result.value.pid) ?? parsed.cpuTime;
      const cpuDelta = Math.max(0, parsed.cpuTime - previousTime);
      nextProcessCpu.set(result.value.pid, parsed.cpuTime);

      const cpuPercent = clamp((cpuDelta / Math.max(1, totalDelta)) * 100 * cpuCount, 0, 999);

      const process = {
        pid: result.value.pid,
        name: parsed.name,
        state: parsed.state,
        cpuPercent,
        memoryPercent: clamp((parsed.memoryBytes / totalMemory) * 100, 0, 100),
        memoryBytes: parsed.memoryBytes,
        processor: parsed.processor,
      };
      if (useBoundedProcessRows) {
        insertTopProcessSnapshot(processes, process, this.#processLimit, compareProcesses);
      } else {
        processes.push(process);
      }
    }

    this.#processCpu = nextProcessCpu;

    return useBoundedProcessRows ? processes : processes.sort(compareProcesses).slice(0, this.#processLimit);
  }

  #sampleProcesses(
    sample: ProcessStatsSample | undefined,
    totalDelta: number,
    totalMemory: number,
    sampledAt: number,
  ): { processes: ProcessSnapshot[]; diagnostic: SystemMetricDiagnostic } {
    if (!sample) {
      const cached = this.#processCache;
      return {
        processes: cached?.processes ?? [],
        diagnostic: {
          source: "process",
          status: "stale",
          detail: cached
            ? `using cached process rows from ${Math.max(0, sampledAt - cached.sampledAt)}ms ago`
            : "process cache unavailable",
          sampledAt,
        },
      };
    }

    const processes = this.#finalizeProcesses(sample, totalDelta, totalMemory);
    this.#processCache = { sampledAt, processes };
    return {
      processes,
      diagnostic: processDiagnostics(sample, sampledAt),
    };
  }
}

async function runMetricCommand(
  provider: SystemMetricsProvider,
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<SystemMetricsCommandOutput> {
  let timeout: number | undefined;
  try {
    return await Promise.race([
      provider.command(command, args, { timeoutMs }),
      new Promise<never>((_, reject) => {
        timeout = Number(setTimeout(
          () => reject(new Error(`${command} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ));
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function readMetricText(
  provider: SystemMetricsProvider,
  path: string,
  source: string,
  fallback: string,
): Promise<{ text: string; diagnostic?: SystemMetricDiagnostic }> {
  const started = performance.now();
  const sampledAt = provider.now();
  try {
    return { text: await provider.readTextFile(path) };
  } catch (error) {
    return {
      text: fallback,
      diagnostic: {
        source,
        status: "unavailable",
        detail: `${path} unavailable: ${errorMessage(error)}`,
        durationMs: performance.now() - started,
        sampledAt,
      },
    };
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value!));
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value!));
}

function safeHostname(provider: SystemMetricsProvider, diagnostics?: DiagnosticsCollector) {
  try {
    return provider.hostname();
  } catch (error) {
    diagnostics?.report({
      source: "system-metrics",
      code: "hostname-unavailable",
      severity: "warning",
      message: "System hostname lookup failed; using fallback monitor label.",
      detail: errorMessage(error),
    });
    return "unknown-host";
  }
}

function safeOsRelease(provider: SystemMetricsProvider, diagnostics?: DiagnosticsCollector) {
  try {
    return provider.osRelease();
  } catch (error) {
    diagnostics?.report({
      source: "system-metrics",
      code: "os-release-unavailable",
      severity: "warning",
      message: "System OS release lookup failed; using fallback monitor label.",
      detail: errorMessage(error),
    });
    return "unknown-os";
  }
}
