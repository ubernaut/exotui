// Copyright 2023 Im-Beast. MIT license.

// OBS-005: one resource model for all three signals. An ObservabilityScope
// binds immutable runtime/session identifiers once and hands out a tracer
// wrapper, a metric tagger, and a log source that all stamp the SAME
// resource — correlation comes from construction, not from global mutable
// metadata: two scopes coexist without touching each other, and nothing
// writes process-wide state.

import { createSpanInstrumentation, SpanInstrumentation } from "./span_instrumentation.ts";
import type { RecordedSpan, SpanKind } from "./span_instrumentation.ts";
import { createStructuredLogSource, StructuredLogSource } from "./structured_logs.ts";
import type { LogSeverity } from "./structured_logs.ts";
import { observabilityMeter } from "./observability.ts";
import type { ObservabilityAttributes } from "./observability.ts";

/** The immutable resource identifiers. */
export interface ObservabilityResource {
  readonly runtimeId: string;
  readonly sessionId: string;
  readonly component: string;
}

/** One scope: the shared context for traces, metrics, and logs. */
export class ObservabilityScope {
  readonly resource: Readonly<ObservabilityResource>;
  readonly #spans: SpanInstrumentation;
  readonly #logs: StructuredLogSource;

  constructor(resource: ObservabilityResource, options: { readonly now?: () => number } = {}) {
    this.resource = Object.freeze({ ...resource });
    this.#spans = createSpanInstrumentation();
    this.#logs = createStructuredLogSource({
      resource: { runtime: resource.runtimeId, session: resource.sessionId, component: resource.component },
      now: options.now ?? (() => 0),
      traceContext: () => this.#spans.current(),
    });
  }

  /** A traced operation carrying this scope's resource identity. */
  span<T>(kind: SpanKind, name: string, fn: () => T | Promise<T>): Promise<T> {
    return this.#spans.withSpan(kind, name, fn, {
      unsafeAttributes: {
        runtime: this.resource.runtimeId,
        session: this.resource.sessionId,
        component: this.resource.component,
      },
    });
  }

  /** A counter increment stamped with the resource identity. */
  count(name: string, value: number, attributes: ObservabilityAttributes = {}): void {
    observabilityMeter().counter(name).add(value, {
      ...attributes,
      runtime: this.resource.runtimeId,
      session: this.resource.sessionId,
    });
  }

  /** A log record; resource and live trace context attach automatically. */
  log(severity: LogSeverity, event: string, attributes: ObservabilityAttributes = {}): void {
    this.#logs.emit({ severity, event, attributes });
  }

  /** The scope's own signal streams (inspection/testing). */
  inspect(): { readonly spans: readonly RecordedSpan[]; readonly logs: number } {
    return { spans: this.#spans.spans(), logs: this.#logs.records().length };
  }

  /** The scope's structured records, for correlation checks. */
  logRecords(): ReturnType<StructuredLogSource["records"]> {
    return this.#logs.records();
  }
}

/** Creates an observability scope for one runtime/session/component. */
export function createObservabilityScope(
  resource: ObservabilityResource,
  options: { readonly now?: () => number } = {},
): ObservabilityScope {
  return new ObservabilityScope(resource, options);
}
