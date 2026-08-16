// Copyright 2023 Im-Beast. MIT license.

// ASY-002: supervision as declared strategy. Children register under a
// supervisor with one of four strategies — stop (a failure terminates the
// child), resume (the failure is recorded and the child keeps its state),
// restart-one (the failed child restarts alone), restart-all (every child
// restarts) — under a bounded restart intensity: more than `maxRestarts`
// within `windowMs` of virtual time trips the supervisor, which stops
// everything and exposes the full causal error chain in order.

/** Strategy applied when a child fails. */
export type SupervisorStrategy = "stop" | "resume" | "restart-one" | "restart-all";

/** A supervised child: start() builds it, stop() tears it down. */
export interface SupervisedChildSpec {
  readonly id: string;
  readonly strategy: SupervisorStrategy;
  readonly start: () => void;
  readonly stop?: () => void;
}

/** One recorded failure, with its causal position. */
export interface SupervisorFailure {
  readonly childId: string;
  readonly error: unknown;
  readonly at: number;
  readonly action: "stopped" | "resumed" | "restarted-one" | "restarted-all" | "tripped";
}

/** Options bounding restart intensity. */
export interface SupervisorOptions {
  /** Restarts tolerated within the window before tripping (default 3). */
  readonly maxRestarts?: number;
  readonly windowMs?: number;
}

type ChildState = "running" | "stopped";

/** A one-for-one/one-for-all supervisor over caller-driven children. */
export class Supervisor {
  readonly #maxRestarts: number;
  readonly #windowMs: number;
  readonly #children = new Map<string, { spec: SupervisedChildSpec; state: ChildState; restarts: number }>();
  #restartTimestamps: number[] = [];
  #failures: SupervisorFailure[] = [];
  #tripped = false;

  constructor(options: SupervisorOptions = {}) {
    this.#maxRestarts = Math.max(1, options.maxRestarts ?? 3);
    this.#windowMs = Math.max(1, options.windowMs ?? 10_000);
  }

  /** Registers and starts a child. */
  supervise(spec: SupervisedChildSpec): void {
    if (this.#tripped) throw new Error("supervisor is tripped");
    if (this.#children.has(spec.id)) throw new Error(`child "${spec.id}" already supervised`);
    this.#children.set(spec.id, { spec, state: "running", restarts: 0 });
    spec.start();
  }

  /** Reports a child failure at `nowMs`; applies its strategy. */
  reportFailure(childId: string, error: unknown, nowMs: number): SupervisorFailure {
    const child = this.#children.get(childId);
    if (!child) throw new Error(`unknown child "${childId}"`);
    if (this.#tripped || child.state === "stopped") {
      const record: SupervisorFailure = { childId, error, at: nowMs, action: "stopped" };
      this.#failures.push(record);
      return record;
    }

    let action: SupervisorFailure["action"];
    switch (child.spec.strategy) {
      case "stop":
        child.spec.stop?.();
        child.state = "stopped";
        action = "stopped";
        break;
      case "resume":
        action = "resumed";
        break;
      case "restart-one":
        action = this.#restart(nowMs, [child]) ? "restarted-one" : "tripped";
        break;
      case "restart-all":
        action = this.#restart(nowMs, [...this.#children.values()]) ? "restarted-all" : "tripped";
        break;
    }
    const record: SupervisorFailure = { childId, error, at: nowMs, action };
    this.#failures.push(record);
    return record;
  }

  /** The causal error chain, oldest first. */
  failures(): readonly SupervisorFailure[] {
    return [...this.#failures];
  }

  get tripped(): boolean {
    return this.#tripped;
  }

  childState(id: string): ChildState | undefined {
    return this.#children.get(id)?.state;
  }

  inspect(): {
    readonly tripped: boolean;
    readonly children: ReadonlyArray<{ id: string; state: ChildState; restarts: number }>;
    readonly recentRestarts: number;
  } {
    return {
      tripped: this.#tripped,
      children: [...this.#children.values()].map((child) => ({
        id: child.spec.id,
        state: child.state,
        restarts: child.restarts,
      })),
      recentRestarts: this.#restartTimestamps.length,
    };
  }

  /** Stops every child (also the trip path). */
  stopAll(): void {
    for (const child of this.#children.values()) {
      if (child.state === "running") {
        child.spec.stop?.();
        child.state = "stopped";
      }
    }
  }

  #restart(
    nowMs: number,
    children: Array<{ spec: SupervisedChildSpec; state: ChildState; restarts: number }>,
  ): boolean {
    this.#restartTimestamps = this.#restartTimestamps.filter((at) => nowMs - at < this.#windowMs);
    if (this.#restartTimestamps.length >= this.#maxRestarts) {
      this.#tripped = true;
      this.stopAll();
      return false;
    }
    this.#restartTimestamps.push(nowMs);
    for (const child of children) {
      if (child.state !== "running") continue;
      child.spec.stop?.();
      child.spec.start();
      child.restarts += 1;
    }
    return true;
  }
}

/** Creates a supervisor. */
export function createSupervisor(options: SupervisorOptions = {}): Supervisor {
  return new Supervisor(options);
}
