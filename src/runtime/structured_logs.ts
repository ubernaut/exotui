// Copyright 2023 Im-Beast. MIT license.

// OBS-004: log records in the OTel LogRecord shape — event timestamp,
// observed timestamp, severity, event name, resource, attributes, and
// trace context — routed through the OBS-001 logger boundary. Legacy
// diagnostic events (the repo's loose {type, message, data} shape) map
// losslessly: every legacy field lands in a defined place, with unknown
// extras preserved under attributes, so nothing is dropped on the way to
// the normalized record.

import { observabilityLogger } from "./observability.ts";
import type { ObservabilityAttributes } from "./observability.ts";

/** Severity levels, OTel-aligned. */
export type LogSeverity = "debug" | "info" | "warn" | "error";

/** The normalized structured record. */
export interface StructuredLogRecord {
  /** When the event happened (producer clock). */
  readonly timestamp: number;
  /** When the record was observed/created (collector clock). */
  readonly observedTimestamp: number;
  readonly severity: LogSeverity;
  readonly event: string;
  /** The emitting resource (component/session identifiers). */
  readonly resource: Readonly<Record<string, string>>;
  readonly attributes: ObservabilityAttributes;
  /** Correlation with an active span, when one exists. */
  readonly traceContext?: { readonly traceId: string; readonly spanId: string };
}

/** Options for a log source. */
export interface StructuredLogSourceOptions {
  readonly resource: Readonly<Record<string, string>>;
  /** Caller-owned clock for observed timestamps. */
  readonly now: () => number;
  /** Supplies the active trace context, when the host tracks one. */
  readonly traceContext?: () => { readonly traceId: string; readonly spanId: string } | undefined;
}

/** A legacy diagnostic event (the repo's historical loose shape). */
export interface LegacyDiagnosticEvent {
  readonly type: string;
  readonly message?: string;
  readonly level?: string;
  readonly at?: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

const LEGACY_SEVERITIES: Readonly<Record<string, LogSeverity>> = {
  debug: "debug",
  info: "info",
  log: "info",
  warning: "warn",
  warn: "warn",
  error: "error",
  fatal: "error",
};

/** A structured log source bound to one resource. */
export class StructuredLogSource {
  readonly #options: StructuredLogSourceOptions;
  #records: StructuredLogRecord[] = [];

  constructor(options: StructuredLogSourceOptions) {
    this.#options = options;
  }

  /** Emits a normalized record (and mirrors it into the OBS-001 logger). */
  emit(entry: {
    readonly severity: LogSeverity;
    readonly event: string;
    readonly timestamp?: number;
    readonly attributes?: ObservabilityAttributes;
  }): StructuredLogRecord {
    const observed = this.#options.now();
    const record: StructuredLogRecord = {
      timestamp: entry.timestamp ?? observed,
      observedTimestamp: observed,
      severity: entry.severity,
      event: entry.event,
      resource: this.#options.resource,
      attributes: entry.attributes ?? {},
      traceContext: this.#options.traceContext?.(),
    };
    this.#records.push(record);
    observabilityLogger().emit({ severity: record.severity, event: record.event, attributes: record.attributes });
    return record;
  }

  /**
   * Maps a legacy diagnostic event losslessly: type → event, level →
   * severity (defaulting info), at → timestamp, message and every data
   * field → attributes (stringified where they are not primitive).
   */
  emitLegacy(legacy: LegacyDiagnosticEvent): StructuredLogRecord {
    const attributes: Record<string, string | number | boolean> = {};
    if (legacy.message !== undefined) attributes["message"] = legacy.message;
    for (const [key, value] of Object.entries(legacy.data ?? {})) {
      attributes[key] = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : JSON.stringify(value);
    }
    return this.emit({
      severity: LEGACY_SEVERITIES[legacy.level?.toLowerCase() ?? "info"] ?? "info",
      event: legacy.type,
      timestamp: legacy.at,
      attributes,
    });
  }

  /** The buffered records, oldest first. */
  records(): readonly StructuredLogRecord[] {
    return [...this.#records];
  }

  clear(): void {
    this.#records = [];
  }
}

/** Creates a structured log source for one resource. */
export function createStructuredLogSource(options: StructuredLogSourceOptions): StructuredLogSource {
  return new StructuredLogSource(options);
}
