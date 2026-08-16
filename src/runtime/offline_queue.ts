// Copyright 2023 Im-Beast. MIT license.

// DAT-009: the offline mutation queue. Mutations enqueue with idempotency
// keys and explicit dependencies; replay on reconnect is deterministic —
// dependency order first, enqueue order second — and an acknowledgement is
// keyed by idempotency key, so duplicates are harmless no-ops. Persistence
// is review-oriented: entries serialize WITHOUT their payloads by default
// (sensitive data stays off disk unless a mutation explicitly opts in), and
// the pending list is inspectable for the user-review surface.

/** One queued mutation. */
export interface OfflineMutation {
  /** Idempotency key: at-most-once semantics across replays and acks. */
  readonly key: string;
  /** Keys this mutation must replay after. */
  readonly dependsOn?: readonly string[];
  readonly payload: unknown;
  /** Opt-in: persist the payload (default false — sensitive-safe). */
  readonly persistPayload?: boolean;
  /** Human summary for the review surface. */
  readonly summary?: string;
}

/** Replay outcome for one mutation. */
export interface OfflineReplayResult {
  readonly key: string;
  readonly status: "sent" | "skipped-dependency" | "already-acknowledged";
}

/** The queue. */
export class OfflineMutationQueue {
  readonly #pending = new Map<string, OfflineMutation>();
  readonly #acknowledged = new Set<string>();

  /** Enqueues (idempotently: a known key is a no-op). */
  enqueue(mutation: OfflineMutation): boolean {
    if (this.#pending.has(mutation.key) || this.#acknowledged.has(mutation.key)) return false;
    this.#pending.set(mutation.key, mutation);
    return true;
  }

  /** Acknowledges a delivered mutation; duplicates are harmless. */
  acknowledge(key: string): boolean {
    const wasPending = this.#pending.delete(key);
    if (this.#acknowledged.has(key)) return false; // duplicate: no-op
    this.#acknowledged.add(key);
    return wasPending;
  }

  /**
   * Replays pending mutations deterministically: dependency order first
   * (a mutation waits for its dependencies), enqueue order second. A
   * mutation whose dependency is still pending after ordering (a cycle) is
   * skipped and reported, never sent out of order.
   */
  async replay(
    send: (mutation: OfflineMutation) => Promise<void>,
  ): Promise<readonly OfflineReplayResult[]> {
    const results: OfflineReplayResult[] = [];
    const remaining = new Map(this.#pending);
    const sent = new Set<string>();
    let progressed = true;
    while (progressed && remaining.size > 0) {
      progressed = false;
      for (const [key, mutation] of remaining) {
        const blockers = (mutation.dependsOn ?? []).filter((dependency) =>
          !this.#acknowledged.has(dependency) && !sent.has(dependency)
        );
        if (blockers.length > 0) continue;
        remaining.delete(key);
        if (this.#acknowledged.has(key)) {
          results.push({ key, status: "already-acknowledged" });
        } else {
          await send(mutation);
          sent.add(key);
          results.push({ key, status: "sent" });
        }
        progressed = true;
      }
    }
    for (const key of remaining.keys()) {
      results.push({ key, status: "skipped-dependency" });
    }
    return results;
  }

  /** The user-review surface: pending entries with their summaries. */
  review(): ReadonlyArray<{ key: string; summary?: string; dependsOn: readonly string[] }> {
    return [...this.#pending.values()].map((mutation) => ({
      key: mutation.key,
      summary: mutation.summary,
      dependsOn: mutation.dependsOn ?? [],
    }));
  }

  /** Removes a pending mutation after user review. */
  discard(key: string): boolean {
    return this.#pending.delete(key);
  }

  /**
   * Serializes for persistence. Payloads are EXCLUDED unless the mutation
   * opted in with `persistPayload` — sensitive data stays off disk by
   * default; excluded entries round-trip as review stubs.
   */
  serialize(): string {
    return JSON.stringify({
      version: 1,
      acknowledged: [...this.#acknowledged].sort(),
      pending: [...this.#pending.values()].map((mutation) => ({
        key: mutation.key,
        dependsOn: mutation.dependsOn ?? [],
        summary: mutation.summary,
        ...(mutation.persistPayload ? { payload: mutation.payload, persistPayload: true } : {}),
      })),
    });
  }

  /** Restores a serialized queue (payload-less entries become stubs). */
  restore(text: string): { readonly restored: number; readonly error?: string } {
    try {
      const parsed = JSON.parse(text) as {
        acknowledged?: string[];
        pending?: Array<OfflineMutation & { payload?: unknown }>;
      };
      for (const key of parsed.acknowledged ?? []) this.#acknowledged.add(key);
      let restored = 0;
      for (const entry of parsed.pending ?? []) {
        if (this.enqueue({ ...entry, payload: entry.payload })) restored += 1;
      }
      return { restored };
    } catch (error) {
      return { restored: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }

  inspect(): { readonly pending: number; readonly acknowledged: number } {
    return { pending: this.#pending.size, acknowledged: this.#acknowledged.size };
  }
}

/** Creates an offline mutation queue. */
export function createOfflineMutationQueue(): OfflineMutationQueue {
  return new OfflineMutationQueue();
}
