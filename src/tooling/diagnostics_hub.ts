// Copyright 2023 Im-Beast. MIT license.

// 036 T2: ONE reusable diagnostics surface instead of demo-local
// instrumentation. Producers report into the hub as things happen —
// invalidations with their reason, frames with caller-clock start/end,
// emitted cell-diff sizes, cache stats providers, task-ownership
// providers, resource acquire/release — and snapshot() assembles the
// typed report any host (debug overlay, console view, test) can render.
// Journals are bounded; a resource alive past the declared threshold
// becomes a leak warning with its owner named.

/** One recorded invalidation. */
export interface InvalidationRecord {
  readonly atMs: number;
  readonly target: string;
  readonly reason: string;
}

/** Rolling frame-timing stats. */
export interface FrameTimingStats {
  readonly frames: number;
  readonly lastMs: number;
  readonly averageMs: number;
  readonly worstMs: number;
}

/** Rolling cell-diff stats. */
export interface CellDiffStats {
  readonly frames: number;
  readonly lastCells: number;
  readonly averageCells: number;
  readonly worstCells: number;
}

/** One live resource entry. */
export interface ResourceRecord {
  readonly id: string;
  readonly owner: string;
  readonly acquiredAtMs: number;
}

/** The assembled diagnostics snapshot. */
export interface DiagnosticsSnapshot {
  readonly invalidations: readonly InvalidationRecord[];
  readonly frameTiming: FrameTimingStats;
  readonly cellDiff: CellDiffStats;
  readonly caches: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly tasks: readonly { readonly id: string; readonly owner: string; readonly state: string }[];
  readonly solver?: { readonly id: string; readonly supported: number; readonly unsupported: number };
  readonly leakWarnings: readonly { readonly id: string; readonly owner: string; readonly aliveMs: number }[];
}

/** The reusable hub. */
export class DiagnosticsHub {
  readonly #maxInvalidations: number;
  readonly #leakThresholdMs: number;
  #invalidations: InvalidationRecord[] = [];
  #frameCount = 0;
  #frameTotalMs = 0;
  #frameLastMs = 0;
  #frameWorstMs = 0;
  #diffCount = 0;
  #diffTotal = 0;
  #diffLast = 0;
  #diffWorst = 0;
  readonly #cacheProviders = new Map<string, () => Readonly<Record<string, number>>>();
  readonly #taskProviders = new Set<
    () => readonly { readonly id: string; readonly owner: string; readonly state: string }[]
  >();
  readonly #resources = new Map<string, ResourceRecord>();
  #solver?: { id: string; supported: number; unsupported: number };

  constructor(options: { readonly maxInvalidations?: number; readonly leakThresholdMs?: number } = {}) {
    this.#maxInvalidations = Math.max(1, options.maxInvalidations ?? 128);
    this.#leakThresholdMs = Math.max(1, options.leakThresholdMs ?? 30_000);
  }

  /** Records one invalidation with its reason (bounded journal). */
  recordInvalidation(atMs: number, target: string, reason: string): void {
    this.#invalidations.push({ atMs, target, reason });
    if (this.#invalidations.length > this.#maxInvalidations) {
      this.#invalidations.splice(0, this.#invalidations.length - this.#maxInvalidations);
    }
  }

  /** Records one frame on the caller's clock. */
  recordFrame(startMs: number, endMs: number): void {
    const duration = Math.max(0, endMs - startMs);
    this.#frameCount += 1;
    this.#frameTotalMs += duration;
    this.#frameLastMs = duration;
    this.#frameWorstMs = Math.max(this.#frameWorstMs, duration);
  }

  /** Records the emitted cell count of one frame diff. */
  recordCellDiff(cells: number): void {
    const size = Math.max(0, cells);
    this.#diffCount += 1;
    this.#diffTotal += size;
    this.#diffLast = size;
    this.#diffWorst = Math.max(this.#diffWorst, size);
  }

  /** Registers a named cache stats provider (pull-based). */
  registerCache(name: string, provider: () => Readonly<Record<string, number>>): () => void {
    this.#cacheProviders.set(name, provider);
    return () => this.#cacheProviders.delete(name);
  }

  /** Registers a task-ownership provider (pull-based). */
  registerTasks(
    provider: () => readonly { readonly id: string; readonly owner: string; readonly state: string }[],
  ): () => void {
    this.#taskProviders.add(provider);
    return () => this.#taskProviders.delete(provider);
  }

  /** Declares the selected solver and its capability tallies. */
  setSolver(id: string, support: Readonly<Record<string, string>>): void {
    let supported = 0;
    let unsupported = 0;
    for (const value of Object.values(support)) {
      if (value === "supported" || value === "partial") supported += 1;
      else unsupported += 1;
    }
    this.#solver = { id, supported, unsupported };
  }

  /** Tracks a resource; the returned release forgets it. */
  acquireResource(id: string, owner: string, atMs: number): () => void {
    this.#resources.set(id, { id, owner, acquiredAtMs: atMs });
    return () => this.#resources.delete(id);
  }

  /** Assembles the snapshot at the caller's now. */
  snapshot(nowMs: number): DiagnosticsSnapshot {
    const caches: Record<string, Readonly<Record<string, number>>> = {};
    for (const [name, provider] of this.#cacheProviders) caches[name] = provider();
    const tasks = [...this.#taskProviders].flatMap((provider) => [...provider()]);
    const leakWarnings = [...this.#resources.values()]
      .filter((resource) => nowMs - resource.acquiredAtMs >= this.#leakThresholdMs)
      .map((resource) => ({ id: resource.id, owner: resource.owner, aliveMs: nowMs - resource.acquiredAtMs }));
    return {
      invalidations: [...this.#invalidations],
      frameTiming: {
        frames: this.#frameCount,
        lastMs: this.#frameLastMs,
        averageMs: this.#frameCount === 0 ? 0 : this.#frameTotalMs / this.#frameCount,
        worstMs: this.#frameWorstMs,
      },
      cellDiff: {
        frames: this.#diffCount,
        lastCells: this.#diffLast,
        averageCells: this.#diffCount === 0 ? 0 : this.#diffTotal / this.#diffCount,
        worstCells: this.#diffWorst,
      },
      caches,
      tasks,
      ...(this.#solver ? { solver: { ...this.#solver } } : {}),
      leakWarnings,
    };
  }
}

/** Creates a diagnostics hub. */
export function createDiagnosticsHub(
  options: { readonly maxInvalidations?: number; readonly leakThresholdMs?: number } = {},
): DiagnosticsHub {
  return new DiagnosticsHub(options);
}
