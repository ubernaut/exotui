// CPU utilisation from /proc/stat.

/** One line of /proc/stat, already split into its jiffy counters. */
export interface CpuTimes {
  readonly name: string;
  readonly idle: number;
  readonly total: number;
}

/** Parses every `cpu` line. The first is the aggregate, the rest are cores. */
export function parseProcStat(text: string): CpuTimes[] {
  const rows: CpuTimes[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("cpu")) break;
    const parts = line.trim().split(/\s+/);
    const name = parts[0]!;
    const numbers = parts.slice(1).map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (numbers.length < 4) continue;
    // user nice system idle iowait irq softirq steal guest guest_nice
    const idle = (numbers[3] ?? 0) + (numbers[4] ?? 0);
    const total = numbers.reduce((sum, value) => sum + value, 0);
    rows.push({ name, idle, total });
  }
  return rows;
}

/**
 * Busy fraction between two samples, 0–1.
 *
 * Utilisation is meaningless from a single reading: /proc/stat counts jiffies
 * since boot, so the first sample can only establish a baseline. Returns 0 when
 * the counters have not moved, which also covers a wrapped or reset counter.
 */
export function cpuBusyFraction(previous: CpuTimes, current: CpuTimes): number {
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (totalDelta <= 0) return 0;
  const busy = (totalDelta - idleDelta) / totalDelta;
  return Math.min(1, Math.max(0, busy));
}
