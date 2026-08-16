// Copyright 2023 Im-Beast. MIT license.

// DAT-010: conflicts resolve by declared policy, never by accident. A
// conflict holds the local version, the remote version, and their common
// base, and it RETAINS both versions until a declared resolver succeeds —
// reject keeps the conflict open for the application, last-write picks by
// timestamp, field-merge combines non-overlapping field changes (an
// overlapping field is itself a conflict unless a chooser decides), and
// three-way delegates to an application-owned merge. A resolver that throws
// or declines leaves the conflict untouched, both versions intact.

/** One live conflict. */
export interface Conflict<T> {
  readonly id: string;
  readonly base: T;
  readonly local: T;
  readonly remote: T;
  readonly localAt: number;
  readonly remoteAt: number;
}

/** A resolution verdict. */
export type ConflictResolution<T> =
  | { readonly kind: "resolved"; readonly value: T }
  | { readonly kind: "unresolved"; readonly reason: string };

/** A pluggable resolver. */
export type ConflictResolver<T> = (conflict: Conflict<T>) => ConflictResolution<T>;

/** The built-in reject resolver: keeps every conflict open. */
export function rejectResolver<T>(): ConflictResolver<T> {
  return () => ({ kind: "unresolved", reason: "policy rejects automatic resolution" });
}

/** Last-write-wins by timestamp (ties prefer local). */
export function lastWriteResolver<T>(): ConflictResolver<T> {
  return (conflict) => ({
    kind: "resolved",
    value: conflict.remoteAt > conflict.localAt ? conflict.remote : conflict.local,
  });
}

/**
 * Field-level merge for record values: fields changed on only one side take
 * that side; a field changed on both sides asks the chooser — without one,
 * the whole conflict stays unresolved (both versions retained).
 */
export function fieldMergeResolver<T extends Record<string, unknown>>(
  chooser?: (field: string, local: unknown, remote: unknown) => unknown,
): ConflictResolver<T> {
  return (conflict) => {
    const merged: Record<string, unknown> = { ...conflict.base };
    const fields = new Set([
      ...Object.keys(conflict.base),
      ...Object.keys(conflict.local),
      ...Object.keys(conflict.remote),
    ]);
    for (const field of fields) {
      const base = conflict.base[field];
      const local = conflict.local[field];
      const remote = conflict.remote[field];
      const localChanged = !Object.is(base, local);
      const remoteChanged = !Object.is(base, remote);
      if (localChanged && remoteChanged && !Object.is(local, remote)) {
        if (!chooser) return { kind: "unresolved", reason: `field "${field}" changed on both sides` };
        merged[field] = chooser(field, local, remote);
      } else if (localChanged) merged[field] = local;
      else if (remoteChanged) merged[field] = remote;
      else merged[field] = base;
    }
    return { kind: "resolved", value: merged as T };
  };
}

/** Application-owned three-way merge. */
export function threeWayResolver<T>(merge: (base: T, local: T, remote: T) => T): ConflictResolver<T> {
  return (conflict) => {
    try {
      return { kind: "resolved", value: merge(conflict.base, conflict.local, conflict.remote) };
    } catch (error) {
      return { kind: "unresolved", reason: error instanceof Error ? error.message : String(error) };
    }
  };
}

/** The conflict ledger: retains both versions until resolution succeeds. */
export class ConflictLedger<T> {
  readonly #conflicts = new Map<string, Conflict<T>>();
  readonly #resolved = new Map<string, T>();

  /** Registers a conflict; both versions are retained. */
  open(conflict: Conflict<T>): void {
    if (!this.#conflicts.has(conflict.id) && !this.#resolved.has(conflict.id)) {
      this.#conflicts.set(conflict.id, conflict);
    }
  }

  /** Attempts resolution by a declared resolver; failure retains everything. */
  resolve(id: string, resolver: ConflictResolver<T>): ConflictResolution<T> | undefined {
    const conflict = this.#conflicts.get(id);
    if (!conflict) return undefined;
    let resolution: ConflictResolution<T>;
    try {
      resolution = resolver(conflict);
    } catch (error) {
      resolution = { kind: "unresolved", reason: error instanceof Error ? error.message : String(error) };
    }
    if (resolution.kind === "resolved") {
      this.#conflicts.delete(id);
      this.#resolved.set(id, resolution.value);
    }
    return resolution;
  }

  /** A still-open conflict, both versions intact. */
  conflict(id: string): Conflict<T> | undefined {
    return this.#conflicts.get(id);
  }

  resolution(id: string): T | undefined {
    return this.#resolved.get(id);
  }

  inspect(): { readonly open: readonly string[]; readonly resolved: readonly string[] } {
    return { open: [...this.#conflicts.keys()].sort(), resolved: [...this.#resolved.keys()].sort() };
  }
}

/** Creates a conflict ledger. */
export function createConflictLedger<T>(): ConflictLedger<T> {
  return new ConflictLedger<T>();
}
