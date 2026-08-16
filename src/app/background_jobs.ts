// Copyright 2023 Im-Beast. MIT license.

// AUT-008: background jobs with explicit ownership. A job starts ATTACHED
// to an owner scope (a route, a window); disposing the owner cancels its
// attached jobs — surviving disposal requires an explicit detach() before
// it happens. Jobs pause and resume when their body declares support,
// retry through their factory, cancel through their invocation signal, and
// notify completion listeners exactly once; everything stays inspectable
// whether attached or detached.

/** A job body: receives lifecycle hooks, returns its result. */
export type BackgroundJobBody<TResult> = (context: {
  readonly signal: AbortSignal;
  /** Declares pause support: the callback fires on pause/resume. */
  onPause?(listener: (paused: boolean) => void): void;
}) => Promise<TResult>;

/** A job's observable state. */
export type BackgroundJobState = "running" | "paused" | "succeeded" | "failed" | "cancelled";

/** One managed job. */
export interface BackgroundJobHandle<TResult = unknown> {
  readonly id: string;
  readonly state: BackgroundJobState;
  readonly owner?: string;
  readonly pausable: boolean;
  detach(): void;
  pause(): boolean;
  resume(): boolean;
  cancel(): void;
  retry(): boolean;
  onComplete(listener: (outcome: { state: BackgroundJobState; result?: TResult; error?: unknown }) => void): void;
}

interface JobRecord<TResult> {
  readonly id: string;
  readonly factory: BackgroundJobBody<TResult>;
  owner: string | undefined;
  state: BackgroundJobState;
  pausable: boolean;
  paused: boolean;
  controller: AbortController;
  pauseListener?: (paused: boolean) => void;
  completions: Array<(outcome: { state: BackgroundJobState; result?: TResult; error?: unknown }) => void>;
  notified: boolean;
}

/** The manager. */
export class BackgroundJobManager {
  readonly #jobs = new Map<string, JobRecord<unknown>>();
  #counter = 0;

  /** Starts a job attached to an owner scope. */
  start<TResult>(
    factory: BackgroundJobBody<TResult>,
    options: { readonly owner?: string; readonly id?: string } = {},
  ): BackgroundJobHandle<TResult> {
    const id = options.id ?? `job-${++this.#counter}`;
    const record: JobRecord<TResult> = {
      id,
      factory,
      owner: options.owner,
      state: "running",
      pausable: false,
      paused: false,
      controller: new AbortController(),
      completions: [],
      notified: false,
    };
    this.#jobs.set(id, record as JobRecord<unknown>);
    this.#run(record);
    return this.#handle(record);
  }

  /** Disposes an owner scope: attached jobs cancel; detached ones survive. */
  disposeOwner(owner: string): number {
    let cancelled = 0;
    for (const record of this.#jobs.values()) {
      if (record.owner === owner && (record.state === "running" || record.state === "paused")) {
        this.#cancel(record);
        cancelled += 1;
      }
    }
    return cancelled;
  }

  /** Every job, attached or not, stays inspectable. */
  inspect(): ReadonlyArray<{ id: string; state: BackgroundJobState; owner?: string; pausable: boolean }> {
    return [...this.#jobs.values()].map((record) => ({
      id: record.id,
      state: record.state,
      owner: record.owner,
      pausable: record.pausable,
    }));
  }

  job(id: string): BackgroundJobHandle | undefined {
    const record = this.#jobs.get(id);
    return record ? this.#handle(record) : undefined;
  }

  #run<TResult>(record: JobRecord<TResult>): void {
    record.factory({
      signal: record.controller.signal,
      onPause: (listener) => {
        record.pausable = true;
        record.pauseListener = listener as (paused: boolean) => void;
      },
    }).then(
      (result) => this.#settle(record, "succeeded", { result }),
      (error) => {
        if (record.controller.signal.aborted) this.#settle(record, "cancelled", {});
        else this.#settle(record, "failed", { error });
      },
    );
  }

  #settle<TResult>(
    record: JobRecord<TResult>,
    state: BackgroundJobState,
    payload: { result?: TResult; error?: unknown },
  ): void {
    if (record.notified) return; // completion notifies exactly once
    record.state = state;
    record.notified = true;
    for (const listener of record.completions.splice(0)) listener({ state, ...payload });
  }

  #cancel(record: JobRecord<unknown>): void {
    if (record.state !== "running" && record.state !== "paused") return;
    record.controller.abort();
    this.#settle(record, "cancelled", {});
  }

  #handle<TResult>(record: JobRecord<TResult>): BackgroundJobHandle<TResult> {
    const manager = this;
    return {
      id: record.id,
      get state() {
        return record.state;
      },
      get owner() {
        return record.owner;
      },
      get pausable() {
        return record.pausable;
      },
      detach: () => {
        record.owner = undefined;
      },
      pause: () => {
        if (!record.pausable || record.state !== "running") return false;
        record.state = "paused";
        record.paused = true;
        record.pauseListener?.(true);
        return true;
      },
      resume: () => {
        if (record.state !== "paused") return false;
        record.state = "running";
        record.paused = false;
        record.pauseListener?.(false);
        return true;
      },
      cancel: () => manager.#cancel(record as JobRecord<unknown>),
      retry: () => {
        if (record.state !== "failed" && record.state !== "cancelled") return false;
        record.state = "running";
        record.notified = false;
        record.controller = new AbortController();
        manager.#run(record);
        return true;
      },
      onComplete: (listener) => {
        if (record.notified) {
          listener({ state: record.state });
          return;
        }
        record.completions.push(listener);
      },
    };
  }
}

/** Creates a background-job manager. */
export function createBackgroundJobManager(): BackgroundJobManager {
  return new BackgroundJobManager();
}
