// Copyright 2023 Im-Beast. MIT license.

// SEC-009: resource limits that fail locally. Each subsystem registers its
// own budget scope — memory estimate, queued work, output bytes, control
// strings, cache entries, restart rate — and every charge answers whether
// the scope is within budget, degraded (soft limit), or stopped (hard
// limit). A breach affects ONLY the owning scope: sibling scopes never see
// it, and each breach emits a classified diagnostic naming the scope, the
// dimension, and the observed value.

/** The budgeted dimensions. */
export type LimitDimension =
  | "memory-bytes"
  | "queued-work"
  | "output-bytes"
  | "control-strings"
  | "cache-entries"
  | "restarts";

/** One scope's declared budgets. */
export type LimitBudgets = Partial<
  Record<LimitDimension, { readonly soft: number; readonly hard: number; readonly windowMs?: number }>
>;

/** A scope's state. */
export type LimitState = "ok" | "degraded" | "stopped";

/** One classified breach diagnostic. */
export interface LimitDiagnostic {
  readonly scope: string;
  readonly dimension: LimitDimension;
  readonly classification: "soft-breach" | "hard-breach";
  readonly observed: number;
  readonly limit: number;
  readonly at: number;
}

interface ScopeState {
  readonly budgets: LimitBudgets;
  readonly counters: Map<LimitDimension, number>;
  readonly windows: Map<LimitDimension, number[]>;
  state: LimitState;
}

/** The per-subsystem limit registry. */
export class ResourceLimitRegistry {
  readonly #scopes = new Map<string, ScopeState>();
  #diagnostics: LimitDiagnostic[] = [];

  /** Declares a subsystem scope with its budgets. */
  declare(scope: string, budgets: LimitBudgets): void {
    this.#scopes.set(scope, { budgets, counters: new Map(), windows: new Map(), state: "ok" });
  }

  /**
   * Charges usage against a scope's dimension. Windowed dimensions (like
   * restarts) count events inside `windowMs`; the rest accumulate until
   * release(). Returns the scope's state after the charge.
   */
  charge(scope: string, dimension: LimitDimension, amount: number, nowMs: number): LimitState {
    const state = this.#scopes.get(scope);
    if (!state) return "ok"; // undeclared scopes are unmanaged
    const budget = state.budgets[dimension];
    if (!budget) return state.state;

    let observed: number;
    if (budget.windowMs !== undefined) {
      const events = (state.windows.get(dimension) ?? []).filter((at) => nowMs - at < budget.windowMs!);
      events.push(nowMs);
      state.windows.set(dimension, events);
      observed = events.length;
    } else {
      observed = (state.counters.get(dimension) ?? 0) + amount;
      state.counters.set(dimension, observed);
    }

    if (observed > budget.hard) {
      state.state = "stopped";
      this.#report(scope, dimension, "hard-breach", observed, budget.hard, nowMs);
    } else if (observed > budget.soft && state.state === "ok") {
      state.state = "degraded";
      this.#report(scope, dimension, "soft-breach", observed, budget.soft, nowMs);
    }
    return state.state;
  }

  /** Releases accumulated usage (freed cache entries, drained queues). */
  release(scope: string, dimension: LimitDimension, amount: number): void {
    const state = this.#scopes.get(scope);
    if (!state) return;
    const current = state.counters.get(dimension) ?? 0;
    const next = Math.max(0, current - amount);
    state.counters.set(dimension, next);
    // Dropping back under the soft limit recovers a degraded scope; a
    // stopped scope stays stopped until the host resets it explicitly.
    const budget = state.budgets[dimension];
    if (state.state === "degraded" && budget && next <= budget.soft) state.state = "ok";
  }

  /** Explicit host reset of a stopped scope. */
  reset(scope: string): boolean {
    const state = this.#scopes.get(scope);
    if (!state) return false;
    state.counters.clear();
    state.windows.clear();
    state.state = "ok";
    return true;
  }

  state(scope: string): LimitState {
    return this.#scopes.get(scope)?.state ?? "ok";
  }

  diagnostics(): readonly LimitDiagnostic[] {
    return [...this.#diagnostics];
  }

  #report(
    scope: string,
    dimension: LimitDimension,
    classification: LimitDiagnostic["classification"],
    observed: number,
    limit: number,
    at: number,
  ): void {
    if (this.#diagnostics.length >= 128) this.#diagnostics.shift();
    this.#diagnostics.push({ scope, dimension, classification, observed, limit, at });
  }
}

/** Creates a resource-limit registry. */
export function createResourceLimitRegistry(): ResourceLimitRegistry {
  return new ResourceLimitRegistry();
}
