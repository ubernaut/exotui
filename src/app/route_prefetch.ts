// Copyright 2023 Im-Beast. MIT license.

// NAV-007: prefetch driven by explicit intent. Focus, hover, or command-
// search intent starts a route prefetch — bounded by a concurrency budget
// (refusal is explicit, never a hidden queue) and cancellable per route.
// Results carry a virtual-time validity window; activation consumes a valid
// result exactly once and stale or missing entries simply miss, so the
// loader path stays the source of truth.

/** Result of one intent signal. */
export type RoutePrefetchIntent = "started" | "cached" | "in-flight" | "over-budget";

/** Options for the prefetcher. */
export interface RoutePrefetchOptions {
  readonly fetch: (route: string, signal: AbortSignal) => Promise<unknown>;
  /** In-flight budget (default 2). */
  readonly maxConcurrent?: number;
  /** Cached-result cap; oldest evicts (default 8). */
  readonly maxCached?: number;
  /** Validity window from completion, virtual time (default 30s). */
  readonly ttlMs?: number;
}

interface CachedResult {
  readonly value: unknown;
  readonly completedAt: number;
}

/** The prefetcher. */
export class RoutePrefetcher {
  readonly #options: Required<RoutePrefetchOptions>;
  readonly #inFlight = new Map<string, AbortController>();
  readonly #cache = new Map<string, CachedResult>();

  constructor(options: RoutePrefetchOptions) {
    this.#options = {
      fetch: options.fetch,
      maxConcurrent: Math.max(1, options.maxConcurrent ?? 2),
      maxCached: Math.max(1, options.maxCached ?? 8),
      ttlMs: Math.max(1, options.ttlMs ?? 30_000),
    };
  }

  /** An intent signal for a route at `nowMs`. */
  intent(route: string, nowMs: number): RoutePrefetchIntent {
    if (this.#validCached(route, nowMs)) return "cached";
    if (this.#inFlight.has(route)) return "in-flight";
    if (this.#inFlight.size >= this.#options.maxConcurrent) return "over-budget";
    const controller = new AbortController();
    this.#inFlight.set(route, controller);
    this.#options.fetch(route, controller.signal).then(
      (value) => {
        if (this.#inFlight.get(route) !== controller) return; // cancelled
        this.#inFlight.delete(route);
        this.#cache.set(route, { value, completedAt: nowMs });
        while (this.#cache.size > this.#options.maxCached) {
          const oldest = this.#cache.keys().next().value;
          if (oldest === undefined) break;
          this.#cache.delete(oldest);
        }
      },
      () => {
        if (this.#inFlight.get(route) === controller) this.#inFlight.delete(route);
      },
    );
    return "started";
  }

  /** Cancels an in-flight prefetch. */
  cancel(route: string): boolean {
    const controller = this.#inFlight.get(route);
    if (!controller) return false;
    this.#inFlight.delete(route);
    controller.abort();
    return true;
  }

  /** Consumes a valid prefetched result for activation, if one exists. */
  activate(route: string, nowMs: number): unknown | undefined {
    if (!this.#validCached(route, nowMs)) {
      this.#cache.delete(route); // a stale entry is dead either way
      return undefined;
    }
    const cached = this.#cache.get(route)!;
    this.#cache.delete(route); // consumed exactly once
    return cached.value;
  }

  inspect(): { readonly inFlight: readonly string[]; readonly cached: readonly string[] } {
    return { inFlight: [...this.#inFlight.keys()], cached: [...this.#cache.keys()] };
  }

  #validCached(route: string, nowMs: number): boolean {
    const cached = this.#cache.get(route);
    return cached !== undefined && nowMs - cached.completedAt <= this.#options.ttlMs;
  }
}

/** Creates a route prefetcher. */
export function createRoutePrefetcher(options: RoutePrefetchOptions): RoutePrefetcher {
  return new RoutePrefetcher(options);
}
