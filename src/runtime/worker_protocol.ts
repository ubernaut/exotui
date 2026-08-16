// Copyright 2023 Im-Beast. MIT license.

// ASY-008: the versioned worker protocol. Workers attach with a handshake;
// an incompatible protocol version is rejected AT ATTACH — such a worker can
// never receive a dispatch. Dispatch routes by affinity first (same key,
// same worker — for workers holding warmed state), least-load second, passes
// the caller's transfer list through to postMessage verbatim (transferred
// buffers move, they are never copied by this layer), and records per-task
// deadlines that expire() rejects on the caller's clock.

/** The transferable-aware worker surface. */
export interface ProtocolWorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

/** A worker's attach handshake. */
export interface WorkerHandshake {
  readonly protocolVersion: number;
}

/** Error a task rejects with when its deadline passes. */
export class WorkerDeadlineError extends Error {
  constructor(taskId: number) {
    super(`worker task ${taskId} missed its deadline`);
    this.name = "WorkerDeadlineError";
  }
}

interface AttachedWorker {
  readonly id: string;
  readonly worker: ProtocolWorkerLike;
  readonly version: number;
  pending: number;
}

interface PendingDispatch<TResult> {
  readonly workerId: string;
  readonly deadlineMs?: number;
  readonly resolve: (value: TResult) => void;
  readonly reject: (error: Error) => void;
}

/** The router. */
export class VersionedWorkerRouter<TPayload = unknown, TResult = unknown> {
  readonly #protocolVersion: number;
  readonly #workers = new Map<string, AttachedWorker>();
  readonly #affinities = new Map<string, string>();
  readonly #pending = new Map<number, PendingDispatch<TResult>>();
  #taskCounter = 0;

  constructor(options: { readonly protocolVersion: number }) {
    this.#protocolVersion = options.protocolVersion;
  }

  /** Attaches a worker; an incompatible version is rejected here, never later. */
  attach(id: string, worker: ProtocolWorkerLike, handshake: WorkerHandshake): { accepted: boolean; reason?: string } {
    if (handshake.protocolVersion !== this.#protocolVersion) {
      return {
        accepted: false,
        reason: `worker speaks protocol ${handshake.protocolVersion}, router requires ${this.#protocolVersion}`,
      };
    }
    this.#workers.set(id, { id, worker, version: handshake.protocolVersion, pending: 0 });
    return { accepted: true };
  }

  detach(id: string): boolean {
    const worker = this.#workers.get(id);
    if (!worker) return false;
    this.#workers.delete(id);
    for (const [key, affinity] of this.#affinities) {
      if (affinity === id) this.#affinities.delete(key);
    }
    return true;
  }

  /**
   * Dispatches a task. Routing: the affinity key's sticky worker when set,
   * else the least-loaded worker. The transfer list passes through verbatim.
   */
  dispatch(
    payload: TPayload,
    options: {
      readonly nowMs: number;
      readonly affinity?: string;
      readonly transfer?: Transferable[];
      readonly deadlineMs?: number;
    },
  ): { readonly taskId: number; readonly workerId: string; readonly settled: Promise<TResult> } | undefined {
    const target = this.#route(options.affinity);
    if (!target) return undefined;
    const taskId = ++this.#taskCounter;
    let resolve!: (value: TResult) => void;
    let reject!: (error: Error) => void;
    const settled = new Promise<TResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.#pending.set(taskId, { workerId: target.id, deadlineMs: options.deadlineMs, resolve, reject });
    target.pending += 1;
    if (options.affinity) this.#affinities.set(options.affinity, target.id);
    // The transfer list is the CALLER'S array, forwarded untouched — the
    // buffers move with the message instead of being structured-cloned.
    target.worker.postMessage({ protocolVersion: this.#protocolVersion, taskId, payload }, options.transfer);
    return { taskId, workerId: target.id, settled };
  }

  /** Settles a worker's response. */
  handleResponse(
    taskId: number,
    response: { readonly ok: boolean; readonly result?: TResult; readonly error?: string },
  ): boolean {
    const pending = this.#pending.get(taskId);
    if (!pending) return false; // late response after expiry: harmless
    this.#pending.delete(taskId);
    const worker = this.#workers.get(pending.workerId);
    if (worker) worker.pending = Math.max(0, worker.pending - 1);
    if (response.ok) pending.resolve(response.result as TResult);
    else pending.reject(new Error(response.error ?? "worker task failed"));
    return true;
  }

  /** Rejects every pending task whose deadline passed. */
  expire(nowMs: number): number {
    let expired = 0;
    for (const [taskId, pending] of [...this.#pending]) {
      if (pending.deadlineMs === undefined || nowMs < pending.deadlineMs) continue;
      this.#pending.delete(taskId);
      const worker = this.#workers.get(pending.workerId);
      if (worker) worker.pending = Math.max(0, worker.pending - 1);
      pending.reject(new WorkerDeadlineError(taskId));
      expired += 1;
    }
    return expired;
  }

  inspect(): {
    readonly workers: ReadonlyArray<{ id: string; pending: number; version: number }>;
    readonly affinities: Readonly<Record<string, string>>;
    readonly pendingTasks: number;
  } {
    return {
      workers: [...this.#workers.values()].map((worker) => ({
        id: worker.id,
        pending: worker.pending,
        version: worker.version,
      })),
      affinities: Object.fromEntries(this.#affinities),
      pendingTasks: this.#pending.size,
    };
  }

  #route(affinity: string | undefined): AttachedWorker | undefined {
    if (affinity) {
      const sticky = this.#affinities.get(affinity);
      const worker = sticky ? this.#workers.get(sticky) : undefined;
      if (worker) return worker;
    }
    let best: AttachedWorker | undefined;
    for (const worker of this.#workers.values()) {
      if (!best || worker.pending < best.pending) best = worker;
    }
    return best;
  }
}

/** Creates a versioned worker router. */
export function createVersionedWorkerRouter<TPayload = unknown, TResult = unknown>(
  options: { readonly protocolVersion: number },
): VersionedWorkerRouter<TPayload, TResult> {
  return new VersionedWorkerRouter(options);
}
