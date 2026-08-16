// Copyright 2023 Im-Beast. MIT license.

// NAV-006: error and not-found boundaries per route node. A failure reports
// into the nearest boundary at or above the failing node — never wider — so
// one failing outlet degrades alone while sibling outlets and the global
// window layout stay untouched. Boundaries retry (re-running the registered
// recovery loader) and fall back to the parent boundary when they have none
// of their own or when their own recovery keeps failing past its budget.

/** A boundary's current state. */
export interface RouteBoundaryState {
  readonly status: "ok" | "error" | "not-found";
  readonly error?: unknown;
  readonly retries: number;
}

/** Options for one boundary registration. */
export interface RouteBoundaryOptions {
  /** Recovery loader; retry() re-runs it. */
  readonly recover?: (signal: AbortSignal) => Promise<void>;
  /** Retries allowed before the failure escalates to the parent (default 2). */
  readonly maxRetries?: number;
}

interface Boundary {
  readonly nodeId: string;
  readonly parent: string | undefined;
  readonly options: RouteBoundaryOptions;
  state: RouteBoundaryState;
  controller: AbortController | undefined;
}

/** The boundary registry over a route chain. */
export class RouteBoundaryRegistry {
  readonly #boundaries = new Map<string, Boundary>();

  /** Registers a boundary for a route node under its parent node. */
  register(nodeId: string, parent: string | undefined, options: RouteBoundaryOptions = {}): () => void {
    this.#boundaries.set(nodeId, {
      nodeId,
      parent,
      options,
      state: { status: "ok", retries: 0 },
      controller: undefined,
    });
    return () => {
      this.#boundaries.delete(nodeId);
    };
  }

  /**
   * Reports a failure at a node. It lands in the nearest boundary at or
   * above the node; siblings and everything outside that subtree are
   * untouched. Returns the boundary that absorbed it, if any.
   */
  reportError(nodeId: string, error: unknown): string | undefined {
    const boundary = this.#nearest(nodeId);
    if (!boundary) return undefined;
    boundary.state = { status: "error", error, retries: boundary.state.retries };
    return boundary.nodeId;
  }

  /** Reports a not-found at a node; same containment rules. */
  reportNotFound(nodeId: string): string | undefined {
    const boundary = this.#nearest(nodeId);
    if (!boundary) return undefined;
    boundary.state = { status: "not-found", retries: boundary.state.retries };
    return boundary.nodeId;
  }

  /**
   * Retries a failed boundary. Success restores ok; a failure past the
   * retry budget escalates to the parent boundary, clearing this one so the
   * subtree can re-render under the parent's fallback.
   */
  async retry(nodeId: string): Promise<RouteBoundaryState> {
    const boundary = this.#boundaries.get(nodeId);
    if (!boundary || boundary.state.status === "ok") return boundary?.state ?? { status: "ok", retries: 0 };
    boundary.controller?.abort();
    const controller = new AbortController();
    boundary.controller = controller;
    try {
      await boundary.options.recover?.(controller.signal);
      boundary.state = { status: "ok", retries: 0 };
      return boundary.state;
    } catch (error) {
      const retries = boundary.state.retries + 1;
      if (retries >= (boundary.options.maxRetries ?? 2) && boundary.parent) {
        // Escalate: the parent boundary absorbs, this one resets.
        boundary.state = { status: "ok", retries: 0 };
        this.reportError(boundary.parent, error);
        return this.#boundaries.get(boundary.parent)?.state ?? boundary.state;
      }
      boundary.state = { status: "error", error, retries };
      return boundary.state;
    }
  }

  /** A boundary's state (ok for unregistered nodes). */
  state(nodeId: string): RouteBoundaryState {
    return this.#boundaries.get(nodeId)?.state ?? { status: "ok", retries: 0 };
  }

  inspect(): ReadonlyArray<{ nodeId: string; status: RouteBoundaryState["status"]; retries: number }> {
    return [...this.#boundaries.values()].map((boundary) => ({
      nodeId: boundary.nodeId,
      status: boundary.state.status,
      retries: boundary.state.retries,
    }));
  }

  /** The nearest boundary at or above a node, walking parent links. */
  #nearest(nodeId: string): Boundary | undefined {
    let current: string | undefined = nodeId;
    while (current !== undefined) {
      const boundary = this.#boundaries.get(current);
      if (boundary) return boundary;
      current = this.#parentOf(current);
    }
    return undefined;
  }

  #parentOf(nodeId: string): string | undefined {
    for (const boundary of this.#boundaries.values()) {
      if (boundary.nodeId === nodeId) return boundary.parent;
    }
    // Unregistered nodes report through their nearest registered ancestor,
    // which callers encode by reporting at that ancestor directly.
    return undefined;
  }
}

/** Creates a route boundary registry. */
export function createRouteBoundaryRegistry(): RouteBoundaryRegistry {
  return new RouteBoundaryRegistry();
}
