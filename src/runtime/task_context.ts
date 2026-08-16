// Copyright 2023 Im-Beast. MIT license.

// ASY-009: task-local immutable context. Values (trace IDs, locale,
// permissions, request metadata) attach to a task with `run` and follow its
// awaited work through AsyncLocalStorage; nested runs layer immutably over
// their parent, and unrelated sibling tasks each see exactly their own
// context — nothing leaks sideways and nothing mutates in place.

import { AsyncLocalStorage } from "node:async_hooks";

/** The context payload; values are treated as immutable. */
export type TaskContextValues = Readonly<Record<string, unknown>>;

const EMPTY: TaskContextValues = Object.freeze({});

/** Task-local context carrier. */
export class TaskContext {
  readonly #storage = new AsyncLocalStorage<TaskContextValues>();

  /** Runs `fn` with `values` layered over the current context. */
  run<T>(values: TaskContextValues, fn: () => T): T {
    const merged = Object.freeze({ ...this.current(), ...values });
    return this.#storage.run(merged, fn);
  }

  /** The current merged context (frozen; empty outside any run). */
  current(): TaskContextValues {
    return this.#storage.getStore() ?? EMPTY;
  }

  /** One value from the current context. */
  get(key: string): unknown {
    return this.current()[key];
  }
}

/** Creates a task-context carrier. */
export function createTaskContext(): TaskContext {
  return new TaskContext();
}
