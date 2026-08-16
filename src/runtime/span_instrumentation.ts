// Copyright 2023 Im-Beast. MIT license.

// OBS-002: correlated spans for the core operation kinds — actions,
// resource loads, command invocations, worker tasks, layout, render frames.
// Parentage rides the ASY-009 task-local context, so a child span started
// after any number of awaits still finds its parent, while parallel
// siblings each see their own. Span attributes exclude content by default:
// a span carries its kind, name, and outcome; anything more goes through
// the explicit `unsafeAttributes` escape hatch a caller must consciously
// use.

import { observabilityTracer } from "./observability.ts";
import type { ObservabilityAttributes } from "./observability.ts";
import { TaskContext } from "./task_context.ts";

/** The instrumented operation kinds. */
export type SpanKind = "action" | "resource" | "command" | "worker" | "layout" | "frame";

/** A finished span record (for the in-memory inspection stream). */
export interface RecordedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly kind: SpanKind;
  readonly name: string;
  readonly status: "ok" | "error";
}

const CONTEXT_KEY = "obs.span";

/** The span layer. */
export class SpanInstrumentation {
  readonly #context: TaskContext;
  readonly #recorded: RecordedSpan[] = [];
  #traceCounter = 0;
  #spanCounter = 0;

  constructor(context: TaskContext = new TaskContext()) {
    this.#context = context;
  }

  /**
   * Runs `fn` inside a span. Spans started within — across any awaits —
   * parent to it automatically through the task context.
   */
  async withSpan<T>(
    kind: SpanKind,
    name: string,
    fn: () => T | Promise<T>,
    options: { readonly unsafeAttributes?: ObservabilityAttributes } = {},
  ): Promise<T> {
    const parent = this.#context.get(CONTEXT_KEY) as { traceId: string; spanId: string } | undefined;
    const traceId = parent?.traceId ?? `trace-${++this.#traceCounter}`;
    const spanId = `span-${++this.#spanCounter}`;

    // Content is excluded by default: the structural attributes are the
    // whole story unless the caller consciously opts more in.
    const attributes: Record<string, string | number | boolean> = { kind, ...options.unsafeAttributes };
    const span = observabilityTracer().startSpan(name, attributes);
    try {
      const result = await this.#context.run({ [CONTEXT_KEY]: { traceId, spanId } }, fn);
      span.setStatus("ok");
      this.#recorded.push({ traceId, spanId, parentSpanId: parent?.spanId, kind, name, status: "ok" });
      return result;
    } catch (error) {
      span.setStatus("error", error instanceof Error ? error.message : String(error));
      this.#recorded.push({ traceId, spanId, parentSpanId: parent?.spanId, kind, name, status: "error" });
      throw error;
    } finally {
      span.end();
    }
  }

  /** The current trace context (for OBS-004 log correlation). */
  current(): { readonly traceId: string; readonly spanId: string } | undefined {
    return this.#context.get(CONTEXT_KEY) as { traceId: string; spanId: string } | undefined;
  }

  /** Finished spans, oldest first (inspection/testing). */
  spans(): readonly RecordedSpan[] {
    return [...this.#recorded];
  }
}

/** Creates the span instrumentation layer. */
export function createSpanInstrumentation(context?: TaskContext): SpanInstrumentation {
  return new SpanInstrumentation(context);
}
