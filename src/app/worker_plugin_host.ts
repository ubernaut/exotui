// Copyright 2023 Im-Beast. MIT license.

// SEC-004: the isolated worker-plugin host. A plugin runs behind a
// ProtocolWorkerLike boundary and talks to the host ONLY through
// schema-validated RPC methods the host declared: every outbound argument
// and inbound result crosses as a structured-clone-safe JSON value (a
// serialization round-trip is enforced, so host object references,
// functions, and prototypes physically cannot cross), message size and
// per-instance message-count limits bound traffic, per-call deadlines
// expire on the caller's clock, and terminate() severs the instance —
// in-flight calls reject and later calls refuse. The worker never sees
// the host app; its whole world is its configured method table.

import type { ProtocolWorkerLike } from "../runtime/worker_protocol.ts";

/** One RPC method's declared schema (host side of the contract). */
export interface WorkerRpcMethod {
  readonly name: string;
  /** Validates the plugin-supplied arguments (already clone-checked). */
  readonly validateArgs?: (args: unknown) => string | undefined;
  /** Validates the host handler's result before it crosses back. */
  readonly validateResult?: (result: unknown) => string | undefined;
  readonly handler: (args: unknown) => unknown | Promise<unknown>;
}

/** Host-side limits for one plugin instance. */
export interface WorkerPluginLimits {
  /** Max serialized bytes per message either direction. */
  readonly maxMessageBytes?: number;
  /** Max RPC calls over the instance lifetime. */
  readonly maxCalls?: number;
  /** Default per-call deadline in caller-clock milliseconds. */
  readonly callDeadlineMs?: number;
}

/** A call outcome crossing back to the worker. */
export type WorkerRpcOutcome =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: string };

const encoder = new TextEncoder();

/** Round-trips a value through JSON, proving it reference-free. */
function detach(value: unknown, maxBytes: number): { value: unknown; bytes: number } | { error: string } {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? "null";
  } catch {
    return { error: "value is not structured-clone-safe (serialization failed)" };
  }
  if (/"__proto__"|"constructor"/.test(serialized)) {
    return { error: "value contains prototype-polluting keys" };
  }
  const bytes = encoder.encode(serialized).byteLength;
  if (bytes > maxBytes) return { error: `message exceeds ${maxBytes} bytes` };
  return { value: JSON.parse(serialized), bytes };
}

/** One isolated plugin instance. */
export class WorkerPluginInstance {
  readonly #worker: ProtocolWorkerLike;
  readonly #methods = new Map<string, WorkerRpcMethod>();
  readonly #maxMessageBytes: number;
  readonly #maxCalls: number;
  readonly #callDeadlineMs: number;
  readonly #pending = new Map<number, { deadline: number; reject: (error: Error) => void }>();
  #calls = 0;
  #terminated = false;

  constructor(
    worker: ProtocolWorkerLike,
    methods: readonly WorkerRpcMethod[],
    limits: WorkerPluginLimits = {},
  ) {
    this.#worker = worker;
    for (const method of methods) this.#methods.set(method.name, method);
    this.#maxMessageBytes = limits.maxMessageBytes ?? 256 * 1024;
    this.#maxCalls = limits.maxCalls ?? 10_000;
    this.#callDeadlineMs = limits.callDeadlineMs ?? 5_000;
  }

  /** The RPC surface the plugin sees — method names only, never handlers. */
  surface(): readonly string[] {
    return [...this.#methods.keys()];
  }

  /**
   * Handles one RPC call arriving from the worker. Everything is validated
   * and detached; the worker never receives a live host value.
   */
  async call(name: string, args: unknown, nowMs: number): Promise<WorkerRpcOutcome> {
    if (this.#terminated) return { ok: false, error: "plugin instance is terminated" };
    if (this.#calls >= this.#maxCalls) return { ok: false, error: "call limit reached" };
    this.#calls += 1;

    const method = this.#methods.get(name);
    if (!method) return { ok: false, error: `method "${name}" is not on this instance's surface` };

    const inbound = detach(args, this.#maxMessageBytes);
    if ("error" in inbound) return { ok: false, error: inbound.error };
    const invalidArgs = method.validateArgs?.(inbound.value);
    if (invalidArgs) return { ok: false, error: `arguments rejected: ${invalidArgs}` };

    const callId = this.#calls;
    const deadline = nowMs + this.#callDeadlineMs;
    const outcome = await new Promise<WorkerRpcOutcome>((resolve) => {
      this.#pending.set(callId, {
        deadline,
        reject: (error) => resolve({ ok: false, error: error.message }),
      });
      Promise.resolve()
        .then(() => method.handler(inbound.value))
        .then((result) => {
          if (!this.#pending.has(callId)) return; // already expired/terminated
          const invalidResult = method.validateResult?.(result);
          if (invalidResult) resolve({ ok: false, error: `result rejected: ${invalidResult}` });
          else {
            const outbound = detach(result, this.#maxMessageBytes);
            if ("error" in outbound) resolve({ ok: false, error: outbound.error });
            else resolve({ ok: true, result: outbound.value });
          }
        })
        .catch((error) => resolve({ ok: false, error: `handler failed: ${String(error)}` }))
        .finally(() => this.#pending.delete(callId));
    });
    return outcome;
  }

  /** Expires overdue calls on the caller's clock. */
  expire(nowMs: number): number {
    let expired = 0;
    for (const [id, entry] of [...this.#pending]) {
      if (nowMs >= entry.deadline) {
        this.#pending.delete(id);
        entry.reject(new Error(`call ${id} missed its deadline`));
        expired += 1;
      }
    }
    return expired;
  }

  /** Severs the instance: in-flight calls reject, the worker terminates. */
  terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    for (const [id, entry] of [...this.#pending]) {
      this.#pending.delete(id);
      entry.reject(new Error(`call ${id} aborted: instance terminated`));
    }
    this.#worker.terminate();
  }

  get terminated(): boolean {
    return this.#terminated;
  }

  inspect(): { calls: number; pending: number; surface: readonly string[] } {
    return { calls: this.#calls, pending: this.#pending.size, surface: this.surface() };
  }
}

/** Creates one isolated worker-plugin instance. */
export function createWorkerPluginInstance(
  worker: ProtocolWorkerLike,
  methods: readonly WorkerRpcMethod[],
  limits: WorkerPluginLimits = {},
): WorkerPluginInstance {
  return new WorkerPluginInstance(worker, methods, limits);
}
