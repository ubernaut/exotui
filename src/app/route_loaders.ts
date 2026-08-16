// Copyright 2023 Im-Beast. MIT license.

// NAV-005: loaders and resources owned by the route scope. Entering a route
// opens a new generation: every loader started under the previous one is
// aborted, every owned resource disposes, and a late resolution from an old
// generation is marked stale and discarded — it can never write into the
// new route's data. Loaders register against the CURRENT generation only,
// so ownership is structural rather than a convention.

/** Result of one route-scoped load. */
export interface RouteLoadResult<T> {
  readonly status: "loaded" | "stale" | "failed";
  readonly value?: T;
  readonly error?: unknown;
}

interface RouteGeneration {
  readonly routeId: string;
  readonly controller: AbortController;
  readonly data: Map<string, unknown>;
  readonly disposers: Array<() => void>;
  pending: number;
}

/** The scope: one live generation at a time. */
export class RouteLoaderScope {
  #generation: RouteGeneration | undefined;

  /** The current route id, if any. */
  get route(): string | undefined {
    return this.#generation?.routeId;
  }

  /** Enters a route, tearing the previous generation down completely. */
  enter(routeId: string): void {
    this.leave();
    this.#generation = {
      routeId,
      controller: new AbortController(),
      data: new Map(),
      disposers: [],
      pending: 0,
    };
  }

  /** Leaves the current route: aborts pending work, disposes owned resources. */
  leave(): void {
    const generation = this.#generation;
    if (!generation) return;
    this.#generation = undefined;
    generation.controller.abort();
    for (const dispose of generation.disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch {
        // A failing disposer must not block the rest of the teardown.
      }
    }
  }

  /** Registers a resource owned by the current route. */
  own(dispose: () => void): void {
    if (!this.#generation) throw new Error("no active route scope");
    this.#generation.disposers.push(dispose);
  }

  /**
   * Runs a loader under the current generation. The result lands in the
   * route's data only while that generation is still live; anything later
   * resolves as stale and is discarded.
   */
  async load<T>(name: string, loader: (signal: AbortSignal) => Promise<T>): Promise<RouteLoadResult<T>> {
    const generation = this.#generation;
    if (!generation) throw new Error("no active route scope");
    generation.pending += 1;
    try {
      const value = await loader(generation.controller.signal);
      if (this.#generation !== generation) return { status: "stale", value };
      generation.data.set(name, value);
      return { status: "loaded", value };
    } catch (error) {
      if (this.#generation !== generation) return { status: "stale", error };
      return { status: "failed", error };
    } finally {
      generation.pending -= 1;
    }
  }

  /** A loaded value on the current route. */
  data(name: string): unknown {
    return this.#generation?.data.get(name);
  }

  inspect(): { readonly route?: string; readonly pending: number; readonly loaded: readonly string[] } {
    return {
      route: this.#generation?.routeId,
      pending: this.#generation?.pending ?? 0,
      loaded: [...(this.#generation?.data.keys() ?? [])],
    };
  }
}

/** Creates a route loader scope. */
export function createRouteLoaderScope(): RouteLoaderScope {
  return new RouteLoaderScope();
}
