// Copyright 2023 Im-Beast. MIT license.

// DAT-005: typed mutation resources. The confirmed (server) value and the
// optimistic overlay are separate: `value` is the confirmed base with every
// pending mutation's pure patch applied in submission order. Server results
// reconcile strictly in that same order — a later mutation settling first
// holds until its predecessors settle, so overlapping mutations can never
// reorder the confirmed history — and a failure rolls back exactly its own
// patch: later optimistic patches simply re-apply on top of the shorter
// pending chain.

/** Outcome of one mutation. */
export interface MutationOutcome {
  readonly id: string;
  readonly status: "confirmed" | "rolled-back";
  readonly error?: unknown;
}

/** One mutation request. */
export interface MutationRequest<T> {
  readonly id?: string;
  /** Pure optimistic patch applied to the display value immediately. */
  readonly optimistic: (value: T) => T;
  /**
   * The server operation. Resolves the reconciled value — either the
   * authoritative value itself or a reconciler over the confirmed base.
   */
  readonly commit: (signal: AbortSignal) => Promise<T | ((confirmed: T) => T)>;
}

interface PendingMutation<T> {
  readonly id: string;
  readonly optimistic: (value: T) => T;
  readonly controller: AbortController;
  settled?: { readonly ok: boolean; readonly result?: T | ((confirmed: T) => T); readonly error?: unknown };
  readonly resolve: (outcome: MutationOutcome) => void;
}

/** A typed value under optimistic mutation. */
export class MutationResource<T> {
  #confirmed: T;
  #pending: PendingMutation<T>[] = [];
  #counter = 0;

  constructor(initial: T) {
    this.#confirmed = initial;
  }

  /** The server-confirmed value. */
  get confirmed(): T {
    return this.#confirmed;
  }

  /** The display value: confirmed + pending patches in submission order. */
  get value(): T {
    return this.#pending.reduce((accumulator, mutation) => mutation.optimistic(accumulator), this.#confirmed);
  }

  /** Submits a mutation; the optimistic patch shows immediately. */
  mutate(request: MutationRequest<T>): { readonly id: string; readonly settled: Promise<MutationOutcome> } {
    const id = request.id ?? `mutation-${++this.#counter}`;
    const controller = new AbortController();
    let resolve!: (outcome: MutationOutcome) => void;
    const settled = new Promise<MutationOutcome>((r) => resolve = r);
    const pending: PendingMutation<T> = { id, optimistic: request.optimistic, controller, resolve };
    this.#pending.push(pending);

    request.commit(controller.signal).then(
      (result) => {
        pending.settled = { ok: true, result };
        this.#reconcile();
      },
      (error) => {
        pending.settled = { ok: false, error };
        this.#reconcile();
      },
    );
    return { id, settled };
  }

  /** Aborts a pending mutation; it rolls back like a failure. */
  cancel(id: string): boolean {
    const pending = this.#pending.find((mutation) => mutation.id === id);
    if (!pending || pending.settled) return false;
    pending.controller.abort();
    pending.settled = { ok: false, error: new Error("mutation cancelled") };
    this.#reconcile();
    return true;
  }

  inspect(): { readonly pending: readonly string[]; readonly held: readonly string[] } {
    return {
      pending: this.#pending.map((mutation) => mutation.id),
      held: this.#pending.filter((mutation) => mutation.settled).map((mutation) => mutation.id),
    };
  }

  /**
   * Applies settled results strictly from the head of the submission order:
   * a settled successor waits behind an unsettled predecessor, and a failed
   * head drops only its own patch.
   */
  #reconcile(): void {
    while (this.#pending.length > 0 && this.#pending[0]!.settled) {
      const head = this.#pending.shift()!;
      const settled = head.settled!;
      if (settled.ok) {
        this.#confirmed = typeof settled.result === "function"
          ? (settled.result as (confirmed: T) => T)(this.#confirmed)
          : settled.result as T;
        head.resolve({ id: head.id, status: "confirmed" });
      } else {
        head.resolve({ id: head.id, status: "rolled-back", error: settled.error });
      }
    }
    // A failed mutation that is NOT the head still rolls back immediately:
    // its patch leaves the overlay while its predecessors stay pending.
    this.#pending = this.#pending.filter((mutation) => {
      if (mutation.settled && !mutation.settled.ok) {
        mutation.resolve({ id: mutation.id, status: "rolled-back", error: mutation.settled.error });
        return false;
      }
      return true;
    });
  }
}

/** Creates a mutation resource over an initial value. */
export function createMutationResource<T>(initial: T): MutationResource<T> {
  return new MutationResource(initial);
}
