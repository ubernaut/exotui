// Copyright 2023 Im-Beast. MIT license.

// VIS-009: linked views share ONE state and ONE revision counter. A link
// group holds the shared domain, cursor, brush, and selection; any
// interaction applies a patch, which bumps exactly one revision and
// notifies every registered view once with the same revision — the
// origin included, so every view renders from identical state. Cycles
// are impossible by construction: applying a patch from inside a
// notification throws immediately instead of recursing, so a
// mis-wired listener surfaces as an error, never as an update storm.

/** The shared linked state. */
export interface LinkedChartState {
  readonly xDomain: readonly [number, number];
  readonly cursor?: { readonly dataX: number };
  readonly brush?: { readonly x0: number; readonly x1: number };
  readonly selection?: readonly string[];
}

/** One notification. */
export interface LinkUpdate {
  readonly revision: number;
  readonly origin: string;
  readonly state: LinkedChartState;
}

/** The link group. */
export class ChartLinkGroup {
  #state: LinkedChartState;
  #revision = 0;
  #notifying = false;
  readonly #views = new Map<string, (update: LinkUpdate) => void>();

  constructor(initial: LinkedChartState) {
    this.#state = initial;
  }

  /** Registers one view; returns its unsubscribe. */
  register(viewId: string, onUpdate: (update: LinkUpdate) => void): () => void {
    this.#views.set(viewId, onUpdate);
    return () => this.#views.delete(viewId);
  }

  state(): LinkedChartState {
    return this.#state;
  }

  revision(): number {
    return this.#revision;
  }

  /**
   * Applies one interaction. One call = one revision = one notification
   * per registered view. Re-entrant application throws.
   */
  apply(origin: string, patch: Partial<LinkedChartState>): number {
    if (this.#notifying) {
      throw new Error(`cyclic update: "${origin}" applied a patch from inside a notification`);
    }
    this.#state = { ...this.#state, ...patch };
    this.#revision += 1;
    const update: LinkUpdate = { revision: this.#revision, origin, state: this.#state };
    this.#notifying = true;
    try {
      for (const onUpdate of [...this.#views.values()]) onUpdate(update);
    } finally {
      this.#notifying = false;
    }
    return this.#revision;
  }
}

/** Creates a chart link group. */
export function createChartLinkGroup(initial: LinkedChartState): ChartLinkGroup {
  return new ChartLinkGroup(initial);
}
