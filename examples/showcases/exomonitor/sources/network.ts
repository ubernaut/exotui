// Network throughput from /proc/net/dev.

export interface InterfaceCounters {
  readonly name: string;
  readonly rxBytes: number;
  readonly txBytes: number;
}

export interface NetworkRate {
  readonly name: string;
  readonly rxBytesPerSecond: number;
  readonly txBytesPerSecond: number;
}

/** Parses the counter table, skipping its two header lines and the loopback. */
export function parseProcNetDev(
  text: string,
  options: { readonly includeLoopback?: boolean } = {},
): InterfaceCounters[] {
  const rows: InterfaceCounters[] = [];
  for (const line of text.split("\n").slice(2)) {
    const [rawName, rest] = line.split(":");
    if (rest === undefined) continue;
    const name = rawName!.trim();
    if (!name || (name === "lo" && !options.includeLoopback)) continue;
    const numbers = rest.trim().split(/\s+/).map(Number);
    const rxBytes = numbers[0];
    // Receive has eight columns before Transmit begins.
    const txBytes = numbers[8];
    if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
    rows.push({ name, rxBytes: rxBytes!, txBytes: txBytes! });
  }
  return rows;
}

/**
 * Per-interface rate between two samples.
 *
 * An interface that appears between samples, or whose counters go backwards
 * (a reset, or the 32-bit wrap still seen on some drivers), reports zero rather
 * than a spike of billions — a graph autoscaled to a bogus peak is useless for
 * the rest of the session.
 */
export function networkRates(
  previous: readonly InterfaceCounters[],
  current: readonly InterfaceCounters[],
  elapsedMs: number,
): NetworkRate[] {
  if (elapsedMs <= 0) return [];
  const before = new Map(previous.map((row) => [row.name, row]));
  const seconds = elapsedMs / 1000;
  const rates: NetworkRate[] = [];
  for (const row of current) {
    const past = before.get(row.name);
    if (!past) continue;
    const rx = row.rxBytes - past.rxBytes;
    const tx = row.txBytes - past.txBytes;
    rates.push({
      name: row.name,
      rxBytesPerSecond: rx < 0 ? 0 : rx / seconds,
      txBytesPerSecond: tx < 0 ? 0 : tx / seconds,
    });
  }
  return rates;
}
