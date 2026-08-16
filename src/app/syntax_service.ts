// Copyright 2023 Im-Beast. MIT license.

// 036 V1: the worker-backed syntax service SEAM. Tree-sitter parsing
// runs behind a message protocol — open/edit describe the document,
// highlight requests name a line RANGE, and responses stream back in
// bounded batches tagged with the document version they were computed
// from, so a client that has since edited simply drops stale batches.
// The worker side is a host that answers with a pluggable highlighter
// (a real Tree-sitter grammar in production, a deterministic
// pattern-based one in tests); the client side wraps any
// postMessage/subscribe pair, so a real Worker, a MessageChannel, or an
// in-process loopback all satisfy the same contract.

/** One highlight span on one line, in source columns. */
export interface HighlightSpan {
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly scope: string;
}

/** Requests the client sends to the worker. */
export type SyntaxRequest =
  | { readonly kind: "open"; readonly documentId: string; readonly version: number; readonly text: string }
  | { readonly kind: "edit"; readonly documentId: string; readonly version: number; readonly text: string }
  | {
    readonly kind: "highlight";
    readonly documentId: string;
    readonly version: number;
    readonly fromLine: number;
    readonly toLine: number;
  };

/** Responses the worker streams back. */
export type SyntaxResponse =
  | {
    readonly kind: "highlights";
    readonly documentId: string;
    readonly version: number;
    readonly spans: readonly HighlightSpan[];
    readonly done: boolean;
  }
  | { readonly kind: "error"; readonly documentId: string; readonly message: string };

/** The transport both sides share. */
export interface SyntaxPort {
  post(message: SyntaxRequest | SyntaxResponse): void;
  subscribe(handler: (message: SyntaxRequest | SyntaxResponse) => void): () => void;
}

/** An in-process loopback pair for tests and single-threaded hosts. */
export function createLoopbackPorts(): { readonly client: SyntaxPort; readonly worker: SyntaxPort } {
  const clientHandlers = new Set<(message: SyntaxRequest | SyntaxResponse) => void>();
  const workerHandlers = new Set<(message: SyntaxRequest | SyntaxResponse) => void>();
  return {
    client: {
      post: (message) => workerHandlers.forEach((handler) => handler(message)),
      subscribe: (handler) => {
        clientHandlers.add(handler);
        return () => clientHandlers.delete(handler);
      },
    },
    worker: {
      post: (message) => clientHandlers.forEach((handler) => handler(message)),
      subscribe: (handler) => {
        workerHandlers.add(handler);
        return () => workerHandlers.delete(handler);
      },
    },
  };
}

/** The pluggable highlighter the worker host runs. */
export interface Highlighter {
  highlightLine(line: string, lineNumber: number): readonly HighlightSpan[];
}

/** A deterministic pattern highlighter (the test/no-grammar fallback). */
export function createPatternHighlighter(
  rules: readonly { readonly pattern: RegExp; readonly scope: string }[],
): Highlighter {
  return {
    highlightLine(line, lineNumber) {
      const spans: HighlightSpan[] = [];
      for (const rule of rules) {
        const regex = new RegExp(
          rule.pattern.source,
          rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g",
        );
        for (const match of line.matchAll(regex)) {
          if (match[0] === "") break;
          spans.push({ line: lineNumber, start: match.index, end: match.index + match[0].length, scope: rule.scope });
        }
      }
      return spans.sort((a, b) => a.start - b.start);
    },
  };
}

/**
 * The worker-side host: answers highlight requests in bounded batches
 * tagged with the version the text carried.
 */
export function createSyntaxWorkerHost(
  port: SyntaxPort,
  highlighter: Highlighter,
  options: { readonly batchLines?: number } = {},
): () => void {
  const batchLines = Math.max(1, options.batchLines ?? 64);
  const documents = new Map<string, { version: number; lines: string[] }>();
  return port.subscribe((message) => {
    if (message.kind === "open" || message.kind === "edit") {
      documents.set(message.documentId, { version: message.version, lines: message.text.split("\n") });
      return;
    }
    if (message.kind !== "highlight") return;
    const document = documents.get(message.documentId);
    if (!document) {
      port.post({ kind: "error", documentId: message.documentId, message: "document not open" });
      return;
    }
    const from = Math.max(0, message.fromLine);
    const to = Math.min(document.lines.length - 1, message.toLine);
    for (let batchStart = from; batchStart <= to; batchStart += batchLines) {
      const batchEnd = Math.min(to, batchStart + batchLines - 1);
      const spans: HighlightSpan[] = [];
      for (let line = batchStart; line <= batchEnd; line += 1) {
        spans.push(...highlighter.highlightLine(document.lines[line]!, line));
      }
      port.post({
        kind: "highlights",
        documentId: message.documentId,
        version: document.version,
        spans,
        done: batchEnd === to,
      });
    }
    if (to < from) {
      port.post({
        kind: "highlights",
        documentId: message.documentId,
        version: document.version,
        spans: [],
        done: true,
      });
    }
  });
}

/**
 * The client-side service: tracks the current version and DROPS stale
 * batches; fresh batches stream to the subscriber.
 */
export class SyntaxServiceClient {
  readonly #port: SyntaxPort;
  readonly #documentId: string;
  #version = 0;
  #dropped = 0;

  constructor(port: SyntaxPort, documentId: string) {
    this.#port = port;
    this.#documentId = documentId;
  }

  /** Subscribes to fresh highlight batches (stale ones are dropped). */
  onHighlights(handler: (version: number, spans: readonly HighlightSpan[], done: boolean) => void): () => void {
    return this.#port.subscribe((message) => {
      if (message.kind !== "highlights" || message.documentId !== this.#documentId) return;
      if (message.version !== this.#version) {
        this.#dropped += 1;
        return;
      }
      handler(message.version, message.spans, message.done);
    });
  }

  open(text: string): number {
    this.#version += 1;
    this.#port.post({ kind: "open", documentId: this.#documentId, version: this.#version, text });
    return this.#version;
  }

  edit(text: string): number {
    this.#version += 1;
    this.#port.post({ kind: "edit", documentId: this.#documentId, version: this.#version, text });
    return this.#version;
  }

  requestHighlights(fromLine: number, toLine: number): void {
    this.#port.post({
      kind: "highlight",
      documentId: this.#documentId,
      version: this.#version,
      fromLine,
      toLine,
    });
  }

  version(): number {
    return this.#version;
  }

  droppedBatches(): number {
    return this.#dropped;
  }
}
