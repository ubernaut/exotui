// Copyright 2023 Im-Beast. MIT license.

// PER-004: writes coalesce at FRAME granularity, and bytes never tear.
// The coalescer queues chunks tagged frame / sync / urgent: a partially
// accepted head chunk always finishes first (its remainder is kept
// byte-exact, never re-encoded), urgent chunks (cursor teardown) jump
// the queue right behind that partial head so they cannot split an
// escape sequence, and sync chunks are never dropped or reordered.
// Under a stalled sink, memory stays bounded by dropping UNSENT whole
// frame chunks — oldest first, keeping the newest — with every drop
// counted; partial data, sync boundaries, and urgent writes are never
// dropped. The sink therefore receives an exact prefix-preserving
// concatenation of what survived.

/** Chunk kinds. */
export type WriteChunkKind = "frame" | "sync" | "urgent";

/** The sink: may accept fewer bytes than offered (backpressure). */
export interface WriteSink {
  write(data: string): number;
}

interface PendingChunk {
  data: string;
  readonly kind: WriteChunkKind;
  offset: number;
}

/** The coalescer. */
export class TerminalWriteCoalescer {
  readonly #sink: WriteSink;
  readonly #maxPendingBytes: number;
  readonly #queue: PendingChunk[] = [];
  #droppedFrames = 0;

  constructor(sink: WriteSink, options: { readonly maxPendingBytes?: number } = {}) {
    this.#sink = sink;
    this.#maxPendingBytes = Math.max(1, options.maxPendingBytes ?? 64 * 1024);
  }

  /** Enqueues one chunk. Urgent chunks jump behind any partial head. */
  enqueue(data: string, kind: WriteChunkKind = "frame"): void {
    if (data === "") return;
    const chunk: PendingChunk = { data, kind, offset: 0 };
    if (kind === "urgent") {
      const headPartial = this.#queue[0] !== undefined && this.#queue[0].offset > 0;
      this.#queue.splice(headPartial ? 1 : 0, 0, chunk);
    } else {
      this.#queue.push(chunk);
    }
    this.#shed();
  }

  /** Attempts to write pending data; returns progress. */
  flush(): { written: number; droppedFrames: number } {
    let written = 0;
    while (this.#queue.length > 0) {
      const head = this.#queue[0]!;
      const remaining = head.data.slice(head.offset);
      const accepted = Math.max(0, Math.min(remaining.length, this.#sink.write(remaining)));
      written += accepted;
      head.offset += accepted;
      if (head.offset < head.data.length) break; // sink stalled mid-chunk
      this.#queue.shift();
    }
    const droppedFrames = this.#droppedFrames;
    this.#droppedFrames = 0;
    return { written, droppedFrames };
  }

  pendingBytes(): number {
    return this.#queue.reduce((total, chunk) => total + chunk.data.length - chunk.offset, 0);
  }

  inspect(): { pendingChunks: number; pendingBytes: number } {
    return { pendingChunks: this.#queue.length, pendingBytes: this.pendingBytes() };
  }

  /** Sheds unsent whole frames (oldest first, newest kept) over the cap. */
  #shed(): void {
    while (this.pendingBytes() > this.#maxPendingBytes) {
      // Find the OLDEST unsent frame chunk that is not the newest frame.
      let candidate = -1;
      let newestFrame = -1;
      for (let index = 0; index < this.#queue.length; index += 1) {
        const chunk = this.#queue[index]!;
        if (chunk.kind === "frame" && chunk.offset === 0) newestFrame = index;
      }
      for (let index = 0; index < this.#queue.length; index += 1) {
        const chunk = this.#queue[index]!;
        if (chunk.kind === "frame" && chunk.offset === 0 && index !== newestFrame) {
          candidate = index;
          break;
        }
      }
      if (candidate < 0) break; // nothing droppable: partials/sync/urgent stay
      this.#queue.splice(candidate, 1);
      this.#droppedFrames += 1;
    }
  }
}

/** Creates a terminal write coalescer. */
export function createTerminalWriteCoalescer(
  sink: WriteSink,
  options: { readonly maxPendingBytes?: number } = {},
): TerminalWriteCoalescer {
  return new TerminalWriteCoalescer(sink, options);
}
