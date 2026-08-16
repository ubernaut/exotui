// Copyright 2023 Im-Beast. MIT license.

// OBS-006: exporters the host owns. Every exporter declares the permissions
// it needs up front (an OTLP HTTP exporter declares net access to its
// endpoint; console declares stdout; in-memory and callback declare
// nothing), buffers through a bounded queue whose overflow policy is the
// backpressure contract, and flushes under a bounded virtual-time shutdown
// deadline — a slow sink cannot hold shutdown hostage, and what could not
// flush in time is reported, not silently lost.

/** One exported signal batch entry. */
export interface ExportableSignal {
  readonly kind: "span" | "metric" | "log";
  readonly payload: unknown;
}

/** The sink an exporter writes to (host-injected IO). */
export type ExporterSink = (batch: readonly ExportableSignal[]) => Promise<void>;

/** An exporter's declared needs. */
export interface ExporterDeclaration {
  readonly name: string;
  readonly permissions: readonly string[];
}

/** Options for a buffering exporter. */
export interface SignalExporterOptions {
  readonly declaration: ExporterDeclaration;
  readonly sink: ExporterSink;
  /** Queue capacity; past it, oldest signals drop (backpressure, counted). */
  readonly capacity?: number;
  /** Batch size per sink call (default 32). */
  readonly batchSize?: number;
}

/** The buffered exporter. */
export class SignalExporter {
  readonly declaration: ExporterDeclaration;
  readonly #sink: ExporterSink;
  readonly #capacity: number;
  readonly #batchSize: number;
  #queue: ExportableSignal[] = [];
  #dropped = 0;
  #exported = 0;
  #shutDown = false;

  constructor(options: SignalExporterOptions) {
    this.declaration = options.declaration;
    this.#sink = options.sink;
    this.#capacity = Math.max(1, options.capacity ?? 256);
    this.#batchSize = Math.max(1, options.batchSize ?? 32);
  }

  /** Enqueues a signal; overflow drops the oldest and counts it. */
  offer(signal: ExportableSignal): boolean {
    if (this.#shutDown) return false;
    if (this.#queue.length >= this.#capacity) {
      this.#queue.shift();
      this.#dropped += 1;
    }
    this.#queue.push(signal);
    return true;
  }

  /** Flushes up to `maxBatches` batches (one sink call each). */
  async flush(maxBatches = Infinity): Promise<number> {
    let batches = 0;
    while (this.#queue.length > 0 && batches < maxBatches) {
      const batch = this.#queue.splice(0, this.#batchSize);
      await this.#sink(batch);
      this.#exported += batch.length;
      batches += 1;
    }
    return batches;
  }

  /**
   * Shutdown under a bounded budget: flushes batch by batch while the
   * caller's clock stays inside the deadline, then reports what remained.
   */
  async shutdown(options: { readonly now: () => number; readonly deadlineMs: number }): Promise<
    { readonly flushed: number; readonly stranded: number; readonly dropped: number }
  > {
    let flushed = 0;
    while (this.#queue.length > 0 && options.now() < options.deadlineMs) {
      const batch = this.#queue.splice(0, this.#batchSize);
      try {
        await this.#sink(batch);
        this.#exported += batch.length;
        flushed += batch.length;
      } catch {
        // A failing sink during shutdown strands the batch; keep going is
        // pointless — report and stop.
        this.#queue.unshift(...batch);
        break;
      }
    }
    this.#shutDown = true;
    const stranded = this.#queue.length;
    this.#queue = [];
    return { flushed, stranded, dropped: this.#dropped };
  }

  inspect(): { readonly queued: number; readonly dropped: number; readonly exported: number } {
    return { queued: this.#queue.length, dropped: this.#dropped, exported: this.#exported };
  }
}

/** The in-memory test exporter: no permissions, captures everything. */
export function createInMemoryExporter(): { exporter: SignalExporter; captured: ExportableSignal[] } {
  const captured: ExportableSignal[] = [];
  const exporter = new SignalExporter({
    declaration: { name: "in-memory", permissions: [] },
    sink: (batch) => {
      captured.push(...batch);
      return Promise.resolve();
    },
  });
  return { exporter, captured };
}

/** A console exporter (declares stdout). */
export function createConsoleExporter(write: (line: string) => void): SignalExporter {
  return new SignalExporter({
    declaration: { name: "console", permissions: ["stdout"] },
    sink: (batch) => {
      for (const signal of batch) write(`${signal.kind} ${JSON.stringify(signal.payload)}`);
      return Promise.resolve();
    },
  });
}

/** An OTLP-HTTP-shaped exporter (declares net access to its endpoint). */
export function createOtlpHttpExporter(
  endpoint: string,
  post: (url: string, body: string) => Promise<void>,
): SignalExporter {
  return new SignalExporter({
    declaration: { name: "otlp-http", permissions: [`net:${new URL(endpoint).host}`] },
    sink: (batch) => post(endpoint, JSON.stringify(batch)),
  });
}

/** An application-callback exporter (no extra permissions). */
export function createCallbackExporter(callback: (batch: readonly ExportableSignal[]) => void): SignalExporter {
  return new SignalExporter({
    declaration: { name: "callback", permissions: [] },
    sink: (batch) => {
      callback(batch);
      return Promise.resolve();
    },
  });
}
