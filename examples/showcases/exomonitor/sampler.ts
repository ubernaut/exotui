// Reads the machine, on a timer, into series the view can draw.

import { cpuBusyFraction, type CpuTimes, parseProcStat } from "./sources/cpu.ts";
import { type MemorySample, parseMeminfo } from "./sources/memory.ts";
import { type InterfaceCounters, type NetworkRate, networkRates, parseProcNetDev } from "./sources/network.ts";
import { hottest, parseSysfsTemperature, type TemperatureReading } from "./sources/temperature.ts";
import { type GpuSample, parseNvidiaSmiCsv } from "./sources/gpu.ts";
import type { SourceId } from "./feeds.ts";

export interface Snapshot {
  readonly cpu: number;
  readonly cores: readonly number[];
  readonly memory?: MemorySample;
  readonly gpu?: GpuSample;
  readonly network: readonly NetworkRate[];
  readonly temperatures: readonly TemperatureReading[];
  readonly hottest?: TemperatureReading;
}

/** Paths that could not be read because permission was refused, not because they are absent. */
const blocked = new Set<string>();

async function readText(path: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    // "Cannot read" and "not present" are different facts, and conflating them
    // is how a monitor decides a machine has no CPU. Deno gates /proc behind
    // --allow-all specifically — even --allow-read=/proc is refused — so a
    // monitor started with narrower permissions silently loses every reading
    // that comes from there.
    if (error instanceof Deno.errors.NotCapable) blocked.add(path);
    return undefined;
  }
}

/** Paths this process was refused, for a caller that has to explain the empty screen. */
export function blockedPaths(): readonly string[] {
  return [...blocked];
}

/** Probes once for everything, so the settings page only offers sources with data behind them. */
export async function detectAvailable(): Promise<SourceId[]> {
  const available: SourceId[] = [];
  const stat = await readText("/proc/stat");
  if (stat && parseProcStat(stat).length > 0) available.push("cpu");
  const meminfo = await readText("/proc/meminfo");
  if (meminfo && parseMeminfo(meminfo)) available.push("memory");
  const gpu = await sampleGpu();
  if (gpu) available.push("gpu", "vram");
  const net = await readText("/proc/net/dev");
  if (net && parseProcNetDev(net).length > 0) available.push("network");
  if ((await sampleTemperatures()).length > 0) available.push("temperature");
  return available;
}

async function sampleGpu(): Promise<GpuSample | undefined> {
  try {
    const command = new Deno.Command("nvidia-smi", {
      args: [
        "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
        "--format=csv,noheader,nounits",
      ],
      stdout: "piped",
      stderr: "null",
    });
    const output = await command.output();
    if (!output.success) return undefined;
    return parseNvidiaSmiCsv(new TextDecoder().decode(output.stdout))[0];
  } catch {
    // No nvidia-smi, or no permission to run it.
    return undefined;
  }
}

async function sampleTemperatures(): Promise<TemperatureReading[]> {
  const readings: TemperatureReading[] = [];
  for (const root of ["/sys/class/thermal", "/sys/class/hwmon"]) {
    let entries: Deno.DirEntry[];
    try {
      entries = [...Deno.readDirSync(root)];
    } catch {
      continue;
    }
    for (const entry of entries) {
      const base = `${root}/${entry.name}`;
      if (root.endsWith("thermal")) {
        if (!entry.name.startsWith("thermal_zone")) continue;
        const raw = await readText(`${base}/temp`);
        const label = (await readText(`${base}/type`))?.trim() ?? entry.name;
        const reading = raw ? parseSysfsTemperature(raw, label) : undefined;
        if (reading) readings.push(reading);
        continue;
      }
      const name = (await readText(`${base}/name`))?.trim() ?? entry.name;
      for (let index = 1; index <= 4; index += 1) {
        const raw = await readText(`${base}/temp${index}_input`);
        if (!raw) continue;
        const label = (await readText(`${base}/temp${index}_label`))?.trim() ?? name;
        const reading = parseSysfsTemperature(raw, label);
        if (reading) readings.push(reading);
      }
    }
  }
  return readings;
}

/** Holds the previous counters so rates can be differences rather than totals. */
export class MonitorSampler {
  #cpu?: CpuTimes;
  #cores: CpuTimes[] = [];
  #interfaces: InterfaceCounters[] = [];
  #sampledAt = 0;

  async sample(now: number = performance.now()): Promise<Snapshot> {
    const [statText, meminfoText, netText] = await Promise.all([
      readText("/proc/stat"),
      readText("/proc/meminfo"),
      readText("/proc/net/dev"),
    ]);

    let cpu = 0;
    let cores: number[] = [];
    if (statText) {
      const rows = parseProcStat(statText);
      const aggregate = rows[0];
      const coreRows = rows.slice(1);
      if (aggregate && this.#cpu) cpu = cpuBusyFraction(this.#cpu, aggregate);
      cores = coreRows.map((row, index) => {
        const previous = this.#cores[index];
        return previous && previous.name === row.name ? cpuBusyFraction(previous, row) : 0;
      });
      if (aggregate) this.#cpu = aggregate;
      this.#cores = coreRows;
    }

    const counters = netText ? parseProcNetDev(netText) : [];
    const elapsed = this.#sampledAt === 0 ? 0 : now - this.#sampledAt;
    const network = networkRates(this.#interfaces, counters, elapsed);
    this.#interfaces = counters;
    this.#sampledAt = now;

    const temperatures = await sampleTemperatures();
    const memory = meminfoText ? parseMeminfo(meminfoText) : undefined;
    const gpu = await sampleGpu();
    const warmest = hottest(temperatures);
    return {
      cpu,
      cores,
      ...(memory ? { memory } : {}),
      ...(gpu ? { gpu } : {}),
      network,
      temperatures,
      ...(warmest ? { hottest: warmest } : {}),
    };
  }
}
