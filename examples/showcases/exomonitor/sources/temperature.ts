// Temperatures from thermal zones and hwmon.

export interface TemperatureReading {
  readonly label: string;
  readonly celsius: number;
}

/**
 * Sysfs reports millidegrees, but not every zone reports anything meaningful:
 * this machine has a zone reading `50`, which is 0.05 °C. Anything outside a
 * plausible range for a running machine is dropped rather than plotted, because
 * one bogus zone rescales every chart it shares an axis with.
 */
export function parseSysfsTemperature(raw: string, label: string): TemperatureReading | undefined {
  const millidegrees = Number(raw.trim());
  if (!Number.isFinite(millidegrees)) return undefined;
  const celsius = millidegrees / 1000;
  if (celsius < 5 || celsius > 125) return undefined;
  return { label, celsius };
}

/** The reading a compact layout shows when it has room for exactly one. */
export function hottest(readings: readonly TemperatureReading[]): TemperatureReading | undefined {
  let best: TemperatureReading | undefined;
  for (const reading of readings) if (!best || reading.celsius > best.celsius) best = reading;
  return best;
}
