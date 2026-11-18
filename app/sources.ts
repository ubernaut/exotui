import type { RuntimeCommandOptions, RuntimeSignal } from "../src/runtime/host.ts";
import { runtimeHost } from "../src/runtime/host.ts";
import type { DiagnosticsCollector } from "../src/runtime/diagnostics.ts";
import { clamp, formatCompactBytes, formatOptionalNumber } from "./styles.ts";
import type { AudioCatalogEntry, SourceFrame, SystemSnapshot } from "./types.ts";

interface AudioCommandOutput {
  stderr: Uint8Array;
}

interface AudioMeterProcess {
  stdout: ReadableStream<Uint8Array>;
  kill(signal?: RuntimeSignal): void;
}

interface AudioCommand {
  output(): Promise<AudioCommandOutput>;
  spawn(): AudioMeterProcess;
}

export interface AudioRuntimeOptions {
  diagnostics?: DiagnosticsCollector;
  commandFactory?: (command: string, options: RuntimeCommandOptions) => AudioCommand;
}

interface AudioMeterSnapshot {
  rms: number;
  peak: number;
  history: number[];
  active: boolean;
}

type MeterState = {
  process: AudioMeterProcess | null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  snapshot: AudioMeterSnapshot;
  active: boolean;
  carry: Uint8Array;
};

export async function discoverAudioSources(options: AudioRuntimeOptions = {}) {
  try {
    const result = await audioCommand(options, "ffmpeg", {
      args: ["-hide_banner", "-f", "pulse", "-sources", "pulse", "-i", "dummy"],
      stdout: "null",
      stderr: "piped",
    }).output();

    const output = new TextDecoder().decode(result.stderr);
    const sources: AudioCatalogEntry[] = [];

    for (const line of output.split("\n")) {
      const match = line.match(/^\s*(\*)?\s*([^\s]+)\s+\[(.+?)\]/);
      if (!match) {
        continue;
      }

      const [, defaultMarker, sourceName, description] = match;
      const role = sourceName.includes(".monitor") || description.startsWith("Monitor of") ? "audio-out" : "audio-in";

      sources.push({
        id: `audio:${sourceName}`,
        sourceName,
        label: role === "audio-out" ? `System: ${description}` : `Mic: ${description}`,
        description,
        role,
        isDefault: defaultMarker === "*",
      });
    }

    return sources.sort((a, b) => {
      if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
      }
      if (a.role !== b.role) {
        return a.role === "audio-in" ? -1 : 1;
      }
      return a.label.localeCompare(b.label);
    });
  } catch (error) {
    options.diagnostics?.report({
      source: "audio",
      code: "discover-failed",
      severity: "warning",
      message: "Audio source discovery failed",
      detail: errorDetail(error),
    });
    return [] as AudioCatalogEntry[];
  }
}

export class AudioRegistry {
  readonly catalog: AudioCatalogEntry[];
  #meters = new Map<string, MeterState>();
  #diagnostics?: DiagnosticsCollector;
  #commandFactory?: AudioRuntimeOptions["commandFactory"];

  constructor(catalog: AudioCatalogEntry[], options: AudioRuntimeOptions = {}) {
    this.catalog = catalog;
    this.#diagnostics = options.diagnostics;
    this.#commandFactory = options.commandFactory;
    for (const entry of catalog) {
      this.#meters.set(entry.id, {
        process: null,
        reader: null,
        carry: new Uint8Array(0),
        active: false,
        snapshot: {
          rms: 0,
          peak: 0,
          history: zeroHistory(64),
          active: false,
        },
      });
    }
  }

  getSnapshot(id: string) {
    return this.#meters.get(id)?.snapshot ?? {
      rms: 0,
      peak: 0,
      history: zeroHistory(64),
      active: false,
    };
  }

  setActiveSources(ids: string[]) {
    const active = new Set(ids);
    for (const entry of this.catalog) {
      const meter = this.#meters.get(entry.id);
      if (!meter) {
        continue;
      }
      if (active.has(entry.id)) {
        if (!meter.active) {
          meter.active = true;
          meter.snapshot.active = true;
          void this.#startMeter(entry, meter);
        }
      } else if (meter.active) {
        this.#stopMeter(meter);
      }
    }
  }

  dispose() {
    for (const meter of this.#meters.values()) {
      this.#stopMeter(meter);
    }
  }

  async #startMeter(entry: AudioCatalogEntry, meter: MeterState) {
    if (meter.process) {
      return;
    }

    let process: AudioMeterProcess;
    try {
      process = audioCommand({ commandFactory: this.#commandFactory }, "ffmpeg", {
        args: [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "pulse",
          "-i",
          entry.sourceName,
          "-ac",
          "1",
          "-ar",
          "8000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        stdin: "null",
        stdout: "piped",
        stderr: "null",
      }).spawn();
    } catch (error) {
      this.#diagnostics?.report({
        source: "audio",
        code: "meter-start-failed",
        severity: "warning",
        message: "Audio meter failed to start",
        detail: errorDetail(error),
        context: { sourceName: entry.sourceName },
      });
      meter.active = false;
      meter.snapshot.active = false;
      return;
    }

    meter.process = process;
    meter.reader = process.stdout.getReader();
    meter.carry = new Uint8Array(0);

    try {
      while (meter.active && meter.reader) {
        const { value, done } = await meter.reader.read();
        if (done || !value) {
          break;
        }
        this.#updateMeter(meter, value);
      }
    } catch (error) {
      this.#diagnostics?.report({
        source: "audio",
        code: "meter-stream-failed",
        severity: "warning",
        message: "Audio meter stream failed",
        detail: errorDetail(error),
        context: { sourceName: entry.sourceName },
      });
    } finally {
      if (meter.reader) {
        try {
          meter.reader.releaseLock();
        } catch (error) {
          this.#diagnostics?.report({
            source: "audio",
            code: "meter-release-failed",
            severity: "debug",
            message: "Audio meter reader release failed",
            detail: errorDetail(error),
            context: { sourceName: entry.sourceName },
          });
        }
      }
      meter.reader = null;
      meter.process = null;
      meter.carry = new Uint8Array(0);
      if (meter.active) {
        meter.snapshot.active = false;
      }
    }
  }

  #stopMeter(meter: MeterState) {
    meter.active = false;
    meter.snapshot.active = false;
    meter.snapshot.rms = 0;
    meter.snapshot.peak = 0;
    pushAudioHistory(meter.snapshot.history, 0);
    try {
      meter.process?.kill("SIGTERM");
    } catch (error) {
      this.#diagnostics?.report({
        source: "audio",
        code: "meter-stop-failed",
        severity: "debug",
        message: "Audio meter stop failed",
        detail: errorDetail(error),
      });
    }
    meter.process = null;
    meter.reader = null;
    meter.carry = new Uint8Array(0);
  }

  #updateMeter(meter: MeterState, chunk: Uint8Array) {
    const data = concatUint8Arrays(meter.carry, chunk);
    const sampleLength = data.length - (data.length % 2);
    const view = new DataView(data.buffer, data.byteOffset, sampleLength);

    let sum = 0;
    let peak = 0;
    let samples = 0;

    for (let index = 0; index < sampleLength; index += 2) {
      const sample = view.getInt16(index, true) / 32768;
      const amplitude = Math.abs(sample);
      sum += amplitude * amplitude;
      peak = Math.max(peak, amplitude);
      samples += 1;
    }

    meter.carry = data.slice(sampleLength);

    if (samples === 0) {
      return;
    }

    const rms = Math.sqrt(sum / samples);
    meter.snapshot.rms = rms;
    meter.snapshot.peak = peak;
    pushAudioHistory(meter.snapshot.history, rms);
    meter.snapshot.active = true;
  }
}

function concatUint8Arrays(a: Uint8Array, b: Uint8Array) {
  if (a.length === 0) {
    return b;
  }
  const output = new Uint8Array(a.length + b.length);
  output.set(a);
  output.set(b, a.length);
  return output;
}

function audioCommand(
  options: AudioRuntimeOptions,
  command: string,
  commandOptions: RuntimeCommandOptions,
): AudioCommand {
  return options.commandFactory?.(command, commandOptions) ?? new runtimeHost.Command(command, commandOptions);
}

function zeroHistory(length: number): number[] {
  return new Array<number>(length).fill(0);
}

function pushAudioHistory(history: number[], value: number): void {
  if (history.length === 0) {
    history.push(value);
    return;
  }
  for (let index = 1; index < history.length; index += 1) {
    history[index - 1] = history[index] ?? 0;
  }
  history[history.length - 1] = value;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface SourceDescriptor {
  id: string;
  name: string;
  description: string;
  group: string;
  kind: "system" | "audio" | "synthetic";
}

export function buildSourceCatalog(audioCatalog: AudioCatalogEntry[]) {
  const sources: SourceDescriptor[] = [
    {
      id: "sys:cpu",
      name: "CPU Total",
      description: "Overall CPU load history and average utilization.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:cpu-cores",
      name: "CPU Cores",
      description: "Per-core activity distribution.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:gpu",
      name: "GPU Combined",
      description: "GPU utilization and VRAM pressure.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:gpu-chip",
      name: "GPU Chip",
      description: "GPU core utilization, thermals, power, and clocks.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:gpu-memory",
      name: "GPU Memory",
      description: "Dedicated GPU memory usage.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:memory",
      name: "Memory",
      description: "RAM usage history and available memory.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:swap",
      name: "Swap",
      description: "Swap pressure and paging activity.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:network",
      name: "Network",
      description: "Ingress and egress bandwidth.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:disk",
      name: "Disks",
      description: "Filesystem capacity and mount pressure.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:temperature",
      name: "Temperatures",
      description: "Thermal zone readings.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:processes",
      name: "Processes",
      description: "Top processes by CPU and memory.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:load",
      name: "Load Average",
      description: "1, 5, and 15 minute load averages.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:alerts",
      name: "Alert Bus",
      description: "Neon warning and alarm conditions.",
      group: "System",
      kind: "system",
    },
    {
      id: "sys:diagnostics",
      name: "Diagnostics",
      description: "Sampler availability, degraded sources, and bounded scan status.",
      group: "System",
      kind: "system",
    },
    {
      id: "synth:pulse",
      name: "Synthetic Pulse",
      description: "A stable reactive control pulse.",
      group: "Synthetic",
      kind: "synthetic",
    },
    {
      id: "synth:clock",
      name: "Synthetic Clock",
      description: "A stepped timing sequence.",
      group: "Synthetic",
      kind: "synthetic",
    },
    {
      id: "synth:noise",
      name: "Synthetic Noise",
      description: "Pseudo-random modulation field.",
      group: "Synthetic",
      kind: "synthetic",
    },
  ];

  for (const entry of audioCatalog) {
    sources.push({
      id: entry.id,
      name: entry.label,
      description: entry.description,
      group: entry.role === "audio-in" ? "Audio In" : "Audio Out",
      kind: "audio",
    });
  }

  return sources;
}

export function resolveSourceFramesInto(
  target: SourceFrame[],
  sourceIds: readonly string[],
  system: SystemSnapshot,
  audio: AudioRegistry,
  phase: number,
): SourceFrame[] {
  if (sourceIds.length === 0) {
    target[0] = syntheticPulseSource(phase);
    target.length = 1;
    return target;
  }

  target.length = sourceIds.length;
  for (let index = 0; index < sourceIds.length; index += 1) {
    target[index] = getSourceFrame(sourceIds[index]!, system, audio, phase);
  }
  return target;
}

function getSourceFrame(
  sourceId: string,
  system: SystemSnapshot,
  audio: AudioRegistry,
  phase: number,
): SourceFrame {
  switch (sourceId) {
    case "sys:cpu":
      return {
        id: sourceId,
        name: "CPU",
        accent: system.cpuOverall >= 85 ? "alarm" : system.cpuOverall >= 70 ? "amber" : "signal",
        value: clamp(system.cpuOverall / 100, 0, 1),
        series: system.cpuHistory,
        detailLines: [
          `AVG ${system.cpuOverall.toFixed(1)}%`,
          `LOAD ${system.loadavg.map((value) => value.toFixed(2)).join(" / ")}`,
        ],
      };
    case "sys:cpu-cores":
      return {
        id: sourceId,
        name: "CPU Cores",
        accent: "signal",
        value: clamp(system.cpuOverall / 100, 0, 1),
        series: cpuCoreSeries(system),
        detailLines: cpuCoreDetailLines(system),
      };
    case "sys:gpu":
      return {
        id: sourceId,
        name: "GPU",
        accent: gpuAccent(system.gpu.utilizationPercent, system.gpu.memoryPercent, system.gpu.available),
        value: system.gpu.available
          ? clamp(Math.max(system.gpu.utilizationPercent, system.gpu.memoryPercent) / 100, 0, 1)
          : 0,
        series: combinedHistory(system.gpuUtilizationHistory, system.gpuMemoryHistory),
        detailLines: gpuDetailLines(system),
      };
    case "sys:gpu-chip":
      return {
        id: sourceId,
        name: "GPU Chip",
        accent: gpuAccent(system.gpu.utilizationPercent, 0, system.gpu.available),
        value: system.gpu.available ? clamp(system.gpu.utilizationPercent / 100, 0, 1) : 0,
        series: system.gpuUtilizationHistory,
        detailLines: gpuChipDetailLines(system),
      };
    case "sys:gpu-memory":
      return {
        id: sourceId,
        name: "GPU Memory",
        accent: gpuAccent(0, system.gpu.memoryPercent, system.gpu.available),
        value: system.gpu.available ? clamp(system.gpu.memoryPercent / 100, 0, 1) : 0,
        series: system.gpuMemoryHistory,
        detailLines: gpuMemoryDetailLines(system),
      };
    case "sys:memory":
      return {
        id: sourceId,
        name: "Memory",
        accent: system.memory.percent >= 85 ? "alarm" : system.memory.percent >= 70 ? "amber" : "phosphor",
        value: clamp(system.memory.percent / 100, 0, 1),
        series: system.memoryHistory,
        detailLines: [
          `USED ${system.memory.percent.toFixed(1)}%`,
          `AVAIL ${formatCompactBytes(system.memory.available)}`,
        ],
      };
    case "sys:swap":
      return {
        id: sourceId,
        name: "Swap",
        accent: system.memory.swapPercent >= 85 ? "alarm" : "amber",
        value: clamp(system.memory.swapPercent / 100, 0, 1),
        series: system.swapHistory,
        detailLines: [
          `USED ${system.memory.swapPercent.toFixed(1)}%`,
          `FREE ${formatCompactBytes(Math.max(0, system.memory.swapTotal - system.memory.swapUsed))}`,
        ],
      };
    case "sys:network":
      return {
        id: sourceId,
        name: "Network",
        accent: "signal",
        value: clamp(Math.max(last(system.rxHistory), last(system.txHistory)), 0, 1),
        series: combinedHistory(system.rxHistory, system.txHistory),
        detailLines: networkDetailLines(system, 3),
      };
    case "sys:disk":
      return {
        id: sourceId,
        name: "Disks",
        accent: system.disks[0]?.percent >= 90 ? "alarm" : "amber",
        value: clamp((system.disks[0]?.percent ?? 0) / 100, 0, 1),
        series: diskSeries(system),
        detailLines: diskDetailLines(system, 4),
      };
    case "sys:temperature":
      return {
        id: sourceId,
        name: "Temperatures",
        accent: system.temperatures[0]?.celsius >= 80
          ? "alarm"
          : system.temperatures[0]?.celsius >= 70
          ? "amber"
          : "violet",
        value: clamp((system.temperatures[0]?.celsius ?? 0) / 100, 0, 1),
        series: temperatureSeries(system),
        detailLines: temperatureDetailLines(system, 4),
      };
    case "sys:processes":
      return {
        id: sourceId,
        name: "Processes",
        accent: "amber",
        value: clamp((system.processes[0]?.cpuPercent ?? 0) / 100, 0, 1),
        series: processSeries(system, 12),
        detailLines: processDetailLines(system, 5),
      };
    case "sys:load": {
      const cores = Math.max(1, navigator.hardwareConcurrency || 1);
      return {
        id: sourceId,
        name: "Load Average",
        accent: system.loadavg[0] >= cores * 0.9 ? "alarm" : system.loadavg[0] >= cores * 0.7 ? "amber" : "signal",
        value: clamp(system.loadavg[0] / cores, 0, 1),
        series: loadAverageSeries(system, cores),
        detailLines: [
          `1M ${system.loadavg[0].toFixed(2)}`,
          `5M ${system.loadavg[1].toFixed(2)}`,
          `15M ${system.loadavg[2].toFixed(2)}`,
        ],
      };
    }
    case "sys:alerts":
      return {
        id: sourceId,
        name: "Alert Bus",
        accent: system.alerts[0]?.severity === "alarm" ? "alarm" : system.alerts.length > 0 ? "amber" : "signal",
        value: system.alerts.length > 0 ? 1 : 0.12,
        series: alertSeries(system),
        detailLines: system.alerts.length > 0 ? alertDetailLines(system, 4) : ["NO ACTIVE SYSTEM ALERTS"],
      };
    case "sys:diagnostics": {
      const degraded = degradedDiagnostics(system);
      const lines = diagnosticDetailLines(degraded.length > 0 ? degraded : system.diagnostics, 5);
      return {
        id: sourceId,
        name: "Diagnostics",
        accent: degraded.some((diagnostic) => diagnostic.status === "unavailable")
          ? "alarm"
          : degraded.length > 0
          ? "amber"
          : "signal",
        value: degraded.length > 0 ? 1 : 0.12,
        series: diagnosticSeries(system),
        detailLines: lines.length > 0 ? lines : ["NO SAMPLER DIAGNOSTICS"],
      };
    }
    case "synth:clock":
      return syntheticClockSource(phase);
    case "synth:noise":
      return syntheticNoiseSource(phase);
    case "synth:pulse":
      return syntheticPulseSource(phase);
    default:
      if (sourceId.startsWith("audio:")) {
        const snapshot = audio.getSnapshot(sourceId);
        const label = audio.catalog.find((entry) => entry.id === sourceId)?.label ?? sourceId;
        return {
          id: sourceId,
          name: label,
          accent: label.startsWith("System:") ? "signal" : "violet",
          value: snapshot.rms,
          series: snapshot.history,
          detailLines: [
            `RMS ${(snapshot.rms * 100).toFixed(1)}%`,
            `PEAK ${(snapshot.peak * 100).toFixed(1)}%`,
            snapshot.active ? "LIVE AUDIO LINK" : "WAITING FOR AUDIO",
          ],
        };
      }
      return syntheticPulseSource(phase);
  }
}

function cpuCoreSeries(system: SystemSnapshot): number[] {
  const series = new Array<number>(system.cpuCores.length);
  for (let index = 0; index < system.cpuCores.length; index += 1) {
    series[index] = system.cpuCores[index]!.usage / 100;
  }
  return series;
}

function cpuCoreDetailLines(system: SystemSnapshot): string[] {
  const lines = new Array<string>(system.cpuCores.length);
  for (let index = 0; index < system.cpuCores.length; index += 1) {
    const core = system.cpuCores[index]!;
    lines[index] = `CPU${core.label.padStart(2, "0")} ${core.usage.toFixed(0)}%`;
  }
  return lines;
}

function combinedHistory(left: readonly number[], right: readonly number[]): number[] {
  const length = Math.max(left.length, right.length);
  const series = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    series[index] = Math.max(left[index] ?? 0, right[index] ?? 0);
  }
  return series;
}

function networkDetailLines(system: SystemSnapshot, limit: number): string[] {
  const count = Math.min(system.networks.length, Math.max(0, Math.floor(limit)));
  const lines = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const network = system.networks[index]!;
    lines[index] = `${network.name.toUpperCase()} ${formatCompactBytes(network.rxRate)}↓ ${
      formatCompactBytes(network.txRate)
    }↑`;
  }
  return lines;
}

function diskSeries(system: SystemSnapshot): number[] {
  const series = new Array<number>(system.disks.length);
  for (let index = 0; index < system.disks.length; index += 1) {
    series[index] = system.disks[index]!.percent / 100;
  }
  return series;
}

function diskDetailLines(system: SystemSnapshot, limit: number): string[] {
  const count = Math.min(system.disks.length, Math.max(0, Math.floor(limit)));
  const lines = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const disk = system.disks[index]!;
    lines[index] = `${disk.mount.toUpperCase()} ${disk.percent}%`;
  }
  return lines;
}

function temperatureSeries(system: SystemSnapshot): number[] {
  const series = new Array<number>(system.temperatures.length);
  for (let index = 0; index < system.temperatures.length; index += 1) {
    series[index] = clamp(system.temperatures[index]!.celsius / 100, 0, 1);
  }
  return series;
}

function temperatureDetailLines(system: SystemSnapshot, limit: number): string[] {
  const count = Math.min(system.temperatures.length, Math.max(0, Math.floor(limit)));
  const lines = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const entry = system.temperatures[index]!;
    lines[index] = `${entry.label.toUpperCase()} ${entry.celsius.toFixed(1)}C`;
  }
  return lines;
}

function processSeries(system: SystemSnapshot, limit: number): number[] {
  const count = Math.min(system.processes.length, Math.max(0, Math.floor(limit)));
  const series = new Array<number>(count);
  for (let index = 0; index < count; index += 1) {
    series[index] = clamp(system.processes[index]!.cpuPercent / 100, 0, 1);
  }
  return series;
}

function processDetailLines(system: SystemSnapshot, limit: number): string[] {
  const count = Math.min(system.processes.length, Math.max(0, Math.floor(limit)));
  const lines = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const process = system.processes[index]!;
    lines[index] = `${process.name.toUpperCase()} ${process.cpuPercent.toFixed(1)}%`;
  }
  return lines;
}

function loadAverageSeries(system: SystemSnapshot, cores: number): number[] {
  const series = new Array<number>(system.loadavg.length);
  for (let index = 0; index < system.loadavg.length; index += 1) {
    series[index] = clamp(system.loadavg[index]! / cores, 0, 1);
  }
  return series;
}

function alertSeries(system: SystemSnapshot): number[] {
  const series = new Array<number>(system.alerts.length);
  for (let index = 0; index < system.alerts.length; index += 1) {
    series[index] = clamp(1 - index * 0.18, 0.2, 1);
  }
  return series;
}

function alertDetailLines(system: SystemSnapshot, limit: number): string[] {
  const count = Math.min(system.alerts.length, Math.max(0, Math.floor(limit)));
  const lines = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const alert = system.alerts[index]!;
    lines[index] = `${alert.title} ${alert.detail}`;
  }
  return lines;
}

function degradedDiagnostics(system: SystemSnapshot): SystemSnapshot["diagnostics"] {
  const diagnostics: SystemSnapshot["diagnostics"] = [];
  for (const diagnostic of system.diagnostics) {
    if (diagnostic.status !== "ok") diagnostics.push(diagnostic);
  }
  return diagnostics;
}

function diagnosticSeries(system: SystemSnapshot): number[] {
  const series = new Array<number>(system.diagnostics.length);
  for (let index = 0; index < system.diagnostics.length; index += 1) {
    series[index] = system.diagnostics[index]!.status === "ok" ? 0.2 : 1;
  }
  return series;
}

function diagnosticDetailLines(diagnostics: SystemSnapshot["diagnostics"], limit: number): string[] {
  const count = Math.min(diagnostics.length, Math.max(0, Math.floor(limit)));
  const lines = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    const diagnostic = diagnostics[index]!;
    lines[index] = `${diagnostic.source.toUpperCase()} ${diagnostic.status.toUpperCase()} ${diagnostic.detail}`;
  }
  return lines;
}

function syntheticPulseSource(phase: number): SourceFrame {
  return {
    id: "synth:pulse",
    name: "Synthetic Pulse",
    accent: "signal",
    value: (Math.sin(phase * 0.22) + 1) / 2,
    series: syntheticPulseSeries(phase, 48),
    detailLines: ["REACTIVE PULSE BUS", "STABLE CONTROL DRIVER"],
  };
}

function syntheticClockSource(phase: number): SourceFrame {
  return {
    id: "synth:clock",
    name: "Synthetic Clock",
    accent: "amber",
    value: ((phase % 60) + 1) / 60,
    series: syntheticClockSeries(phase, 48),
    detailLines: [
      `TICK ${String(phase).padStart(5, "0")}`,
      `STEP ${String(phase % 60).padStart(2, "0")}`,
    ],
  };
}

function syntheticNoiseSource(phase: number): SourceFrame {
  return {
    id: "synth:noise",
    name: "Synthetic Noise",
    accent: "phosphor",
    value: pseudoRandom(phase, phase * 0.13),
    series: syntheticNoiseSeries(phase, 48),
    detailLines: ["PSEUDO-RANDOM VECTOR FIELD", "LOW CONFIDENCE INPUT"],
  };
}

function syntheticPulseSeries(phase: number, length: number): number[] {
  const series = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    series[index] = clamp((Math.sin((phase + index) * 0.24) + 1) / 2, 0, 1);
  }
  return series;
}

function syntheticClockSeries(phase: number, length: number): number[] {
  const series = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    series[index] = ((phase + index) % 16) / 16;
  }
  return series;
}

function syntheticNoiseSeries(phase: number, length: number): number[] {
  const series = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    series[index] = pseudoRandom(index + phase, index * 0.17);
  }
  return series;
}

function pseudoRandom(seedA: number, seedB: number) {
  const raw = Math.sin(seedA * 12.9898 + seedB * 78.233) * 43758.5453;
  return clamp(raw - Math.floor(raw), 0, 1);
}

function last(values: number[]) {
  return values[values.length - 1] ?? 0;
}

function gpuAccent(utilization: number, memory: number, available: boolean) {
  if (!available) return "violet";
  const pressure = Math.max(utilization, memory);
  return pressure >= 90 ? "alarm" : pressure >= 72 ? "amber" : "violet";
}

function gpuDetailLines(system: SystemSnapshot) {
  if (!system.gpu.available) return ["GPU TELEMETRY OFFLINE", "INSTALL NVIDIA-SMI OR ENABLE DRIVER METRICS"];
  return [
    system.gpu.name,
    `CHIP ${system.gpu.utilizationPercent.toFixed(0)}%  VRAM ${system.gpu.memoryPercent.toFixed(0)}%`,
    `MEM ${formatCompactBytes(system.gpu.memoryUsed)} / ${formatCompactBytes(system.gpu.memoryTotal)}`,
    gpuThermalPowerLine(system),
  ];
}

function gpuChipDetailLines(system: SystemSnapshot) {
  if (!system.gpu.available) return ["GPU CHIP OFFLINE"];
  return [
    system.gpu.name,
    `UTIL ${system.gpu.utilizationPercent.toFixed(0)}%`,
    gpuThermalPowerLine(system),
    `GFX ${formatOptionalNumber(system.gpu.graphicsClockMhz, "MHz")}  MEM ${
      formatOptionalNumber(system.gpu.memoryClockMhz, "MHz")
    }`,
  ];
}

function gpuMemoryDetailLines(system: SystemSnapshot) {
  if (!system.gpu.available) return ["GPU MEMORY OFFLINE"];
  return [
    `VRAM ${system.gpu.memoryPercent.toFixed(0)}%`,
    `${formatCompactBytes(system.gpu.memoryUsed)} USED`,
    `${formatCompactBytes(Math.max(0, system.gpu.memoryTotal - system.gpu.memoryUsed))} FREE`,
    `${formatCompactBytes(system.gpu.memoryTotal)} TOTAL`,
  ];
}

function gpuThermalPowerLine(system: SystemSnapshot) {
  return `TEMP ${formatOptionalNumber(system.gpu.temperatureCelsius, "C")}  POWER ${
    formatOptionalNumber(system.gpu.powerWatts, "W")
  }`;
}
