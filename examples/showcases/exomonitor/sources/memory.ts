// Memory from /proc/meminfo.

export interface MemorySample {
  /** Bytes in use, counting cache that cannot be reclaimed. */
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly swapUsedBytes: number;
  readonly swapTotalBytes: number;
}

/**
 * Uses MemAvailable rather than MemFree. MemFree treats every cached page as
 * consumed and reports a machine with a warm page cache as nearly full, which
 * is the classic "Linux ate my RAM" misreading.
 */
export function parseMeminfo(text: string): MemorySample | undefined {
  const values = new Map<string, number>();
  for (const line of text.split("\n")) {
    const match = /^(\w+):\s+(\d+)\s*kB/.exec(line.trim());
    if (match) values.set(match[1]!, Number(match[2]) * 1024);
  }
  const total = values.get("MemTotal");
  const available = values.get("MemAvailable");
  if (total === undefined || available === undefined || total <= 0) return undefined;
  const swapTotal = values.get("SwapTotal") ?? 0;
  const swapFree = values.get("SwapFree") ?? 0;
  return {
    usedBytes: Math.max(0, total - available),
    totalBytes: total,
    swapUsedBytes: Math.max(0, swapTotal - swapFree),
    swapTotalBytes: swapTotal,
  };
}
