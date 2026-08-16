// Copyright 2023 Im-Beast. MIT license.

// OBS-001: an OpenTelemetry-shaped API boundary with a TRUE no-op default.
// Instrumentation code imports these interfaces and calls them freely; until
// a host installs a provider, every call hits frozen no-op singletons that
// allocate nothing, start no timers, open no network, and request no
// permissions. Providers install and uninstall explicitly, and the tracer/
// meter/logger accessors always return SOMETHING callable, so call sites
// never branch on presence.

/** Attribute values (OTel-shaped, low-cardinality by convention). */
export type ObservabilityAttributes = Readonly<Record<string, string | number | boolean>>;

/** A span in the OTel shape. */
export interface ObservabilitySpan {
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: ObservabilityAttributes): void;
  setStatus(status: "ok" | "error", message?: string): void;
  end(): void;
}

/** A tracer. */
export interface ObservabilityTracer {
  startSpan(name: string, attributes?: ObservabilityAttributes): ObservabilitySpan;
}

/** Metric instruments. */
export interface ObservabilityCounter {
  add(value: number, attributes?: ObservabilityAttributes): void;
}
export interface ObservabilityHistogram {
  record(value: number, attributes?: ObservabilityAttributes): void;
}
export interface ObservabilityGauge {
  set(value: number, attributes?: ObservabilityAttributes): void;
}

/** A meter. */
export interface ObservabilityMeter {
  counter(name: string, unit?: string): ObservabilityCounter;
  histogram(name: string, unit?: string): ObservabilityHistogram;
  gauge(name: string, unit?: string): ObservabilityGauge;
}

/** A log record emitter. */
export interface ObservabilityLogger {
  emit(record: {
    readonly severity: "debug" | "info" | "warn" | "error";
    readonly event: string;
    readonly attributes?: ObservabilityAttributes;
  }): void;
}

/** What a host installs. */
export interface ObservabilityProvider {
  readonly tracer: ObservabilityTracer;
  readonly meter: ObservabilityMeter;
  readonly logger: ObservabilityLogger;
}

const NOOP_SPAN: ObservabilitySpan = Object.freeze({
  setAttribute() {},
  addEvent() {},
  setStatus() {},
  end() {},
});
const NOOP_COUNTER: ObservabilityCounter = Object.freeze({ add() {} });
const NOOP_HISTOGRAM: ObservabilityHistogram = Object.freeze({ record() {} });
const NOOP_GAUGE: ObservabilityGauge = Object.freeze({ set() {} });

/** The frozen no-op provider — the permanent default. */
export const NOOP_OBSERVABILITY: ObservabilityProvider = Object.freeze({
  tracer: Object.freeze({ startSpan: () => NOOP_SPAN }),
  meter: Object.freeze({
    counter: () => NOOP_COUNTER,
    histogram: () => NOOP_HISTOGRAM,
    gauge: () => NOOP_GAUGE,
  }),
  logger: Object.freeze({ emit() {} }),
});

let activeProvider: ObservabilityProvider = NOOP_OBSERVABILITY;

/** Installs a provider; returns the uninstaller (restores the no-op). */
export function installObservabilityProvider(provider: ObservabilityProvider): () => void {
  activeProvider = provider;
  return () => {
    if (activeProvider === provider) activeProvider = NOOP_OBSERVABILITY;
  };
}

/** The active tracer — always callable, no-op by default. */
export function observabilityTracer(): ObservabilityTracer {
  return activeProvider.tracer;
}

/** The active meter — always callable, no-op by default. */
export function observabilityMeter(): ObservabilityMeter {
  return activeProvider.meter;
}

/** The active logger — always callable, no-op by default. */
export function observabilityLogger(): ObservabilityLogger {
  return activeProvider.logger;
}

/** True while a real provider is installed. */
export function observabilityInstalled(): boolean {
  return activeProvider !== NOOP_OBSERVABILITY;
}
