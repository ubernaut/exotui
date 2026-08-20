// GPU via nvidia-smi, which is absent on most machines.

export interface GpuSample {
  readonly name: string;
  readonly utilisation: number;
  readonly vramUsedBytes: number;
  readonly vramTotalBytes: number;
  readonly celsius?: number;
}

/** Parses one CSV row of `nvidia-smi --query-gpu=... --format=csv,noheader,nounits`. */
export function parseNvidiaSmiCsv(text: string): GpuSample[] {
  const samples: GpuSample[] = [];
  for (const line of text.split("\n")) {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length < 4 || !cells[0]) continue;
    const utilisation = Number(cells[1]);
    const used = Number(cells[2]);
    const total = Number(cells[3]);
    if (!Number.isFinite(utilisation) || !Number.isFinite(used) || !Number.isFinite(total) || total <= 0) continue;
    const celsius = Number(cells[4]);
    samples.push({
      name: cells[0]!,
      utilisation: Math.min(1, Math.max(0, utilisation / 100)),
      // nounits reports MiB.
      vramUsedBytes: used * 1024 * 1024,
      vramTotalBytes: total * 1024 * 1024,
      ...(Number.isFinite(celsius) ? { celsius } : {}),
    });
  }
  return samples;
}
