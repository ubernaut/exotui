// Copyright 2023 Im-Beast. MIT license.

// OBS-003: the core metric set with stability as a contract. Every metric
// name and unit is declared once in a frozen catalog — renames are breaking
// changes by construction — and instruments accept only attribute keys the
// catalog declares with values from closed enumerations, so an unbounded
// identifier (window id, preset name, file path) can never become an
// attribute value: passing one throws in tests and is dropped in
// production posture.

import { observabilityMeter } from "./observability.ts";
import type { ObservabilityAttributes } from "./observability.ts";

/** The frozen metric catalog: name, unit, kind, allowed attributes. */
export const CORE_METRICS = Object.freeze(
  {
    "tui.frames": { unit: "1", kind: "counter", attributes: { renderer: ["terminal", "browser", "gpu"] } },
    "tui.frame_duration": { unit: "ms", kind: "histogram", attributes: { renderer: ["terminal", "browser", "gpu"] } },
    "tui.cell_diffs": { unit: "1", kind: "counter", attributes: {} },
    "tui.queue_depth": { unit: "1", kind: "gauge", attributes: { queue: ["input", "render", "worker"] } },
    "tui.cache_events": {
      unit: "1",
      kind: "counter",
      attributes: { cache: ["layout", "style", "measurement"], result: ["hit", "miss", "evict"] },
    },
    "tui.errors": { unit: "1", kind: "counter", attributes: { area: ["render", "input", "command", "worker", "io"] } },
    "tui.lifecycle": {
      unit: "1",
      kind: "counter",
      attributes: { event: ["start", "resume", "suspend", "stop"] },
    },
  } as const,
);

export type CoreMetricName = keyof typeof CORE_METRICS;

/** Thrown (strict mode) when an attribute violates the catalog. */
export class MetricAttributeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricAttributeError";
  }
}

/** Options for the metric set. */
export interface CoreMetricsOptions {
  /** Strict mode throws on violations (tests); lax drops them (production). */
  readonly strict?: boolean;
}

/** The validated instrument set over the OBS-001 meter. */
export class CoreMetrics {
  readonly #strict: boolean;

  constructor(options: CoreMetricsOptions = {}) {
    this.#strict = options.strict ?? false;
  }

  count(name: CoreMetricName, value: number, attributes: ObservabilityAttributes = {}): void {
    const validated = this.#validate(name, "counter", attributes);
    if (validated) observabilityMeter().counter(name, CORE_METRICS[name].unit).add(value, validated);
  }

  record(name: CoreMetricName, value: number, attributes: ObservabilityAttributes = {}): void {
    const validated = this.#validate(name, "histogram", attributes);
    if (validated) observabilityMeter().histogram(name, CORE_METRICS[name].unit).record(value, validated);
  }

  set(name: CoreMetricName, value: number, attributes: ObservabilityAttributes = {}): void {
    const validated = this.#validate(name, "gauge", attributes);
    if (validated) observabilityMeter().gauge(name, CORE_METRICS[name].unit).set(value, validated);
  }

  #validate(
    name: CoreMetricName,
    kind: "counter" | "histogram" | "gauge",
    attributes: ObservabilityAttributes,
  ): ObservabilityAttributes | undefined {
    const declaration = CORE_METRICS[name];
    if (declaration.kind !== kind) {
      return this.#violate(`metric "${name}" is a ${declaration.kind}, not a ${kind}`);
    }
    const allowed = declaration.attributes as Readonly<Record<string, readonly string[]>>;
    const validated: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(attributes)) {
      const values = allowed[key];
      if (!values) return this.#violate(`metric "${name}" does not declare attribute "${key}"`);
      // Closed enumerations only: unbounded IDs cannot become values.
      if (!values.includes(String(value))) {
        return this.#violate(`metric "${name}" attribute "${key}" rejects unenumerated value "${String(value)}"`);
      }
      validated[key] = value;
    }
    return validated;
  }

  #violate(message: string): undefined {
    if (this.#strict) throw new MetricAttributeError(message);
    return undefined; // lax posture: the signal is dropped, never widened
  }
}

/** Creates the core metric set. */
export function createCoreMetrics(options: CoreMetricsOptions = {}): CoreMetrics {
  return new CoreMetrics(options);
}
