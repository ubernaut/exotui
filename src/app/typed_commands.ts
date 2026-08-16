// Copyright 2023 Im-Beast. MIT license.

// AUT-001: commands as typed, described, validated units. Every command
// carries a runtime descriptor (id, titles, input/result summaries) that
// registry inspection exposes for tooling, and an input validator that runs
// BEFORE execution — incompatible input rejects without the command body
// ever starting, with the rejection reason in the outcome.

/** The tooling-facing descriptor. */
export interface TypedCommandDescriptor {
  readonly id: string;
  readonly title?: string;
  /** Human/tooling description of the expected input shape. */
  readonly inputSummary?: string;
  readonly resultSummary?: string;
}

/** AUT-004: the per-invocation lifecycle every command body receives. */
export interface CommandInvocationContext {
  /** Aborts on cancel() or a passed deadline. */
  readonly signal: AbortSignal;
  readonly deadlineMs?: number;
  /** Registers a resource owned by this invocation; disposed on settle. */
  own(dispose: () => void): void;
}

/** A registered command. */
export interface TypedCommand<TInput = unknown, TResult = unknown> extends TypedCommandDescriptor {
  /** Runtime input gate; return an error message to reject. */
  validateInput?(input: unknown): string | undefined;
  run(input: TInput, context: CommandInvocationContext): Promise<TResult> | TResult;
}

/** Outcome of one invocation. */
export type CommandOutcome<TResult = unknown> =
  | { readonly status: "succeeded"; readonly result: TResult }
  | { readonly status: "rejected"; readonly reason: string }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "cancelled"; readonly reason: string }
  | { readonly status: "unknown-command"; readonly id: string };

/** A running invocation. */
export interface CommandInvocationHandle<TResult = unknown> {
  readonly settled: Promise<CommandOutcome<TResult>>;
  /** Cancels: aborts the signal, disposes owned resources, and fixes the
   * outcome as cancelled — a later body resolution can never turn it into
   * success. */
  cancel(reason?: string): void;
}

/** The registry. */
export class TypedCommandRegistry {
  readonly #commands = new Map<string, TypedCommand>();

  /** Registers a command; returns its disposer. */
  register<TInput, TResult>(command: TypedCommand<TInput, TResult>): () => void {
    this.#commands.set(command.id, command as TypedCommand);
    return () => {
      if (this.#commands.get(command.id) === command) this.#commands.delete(command.id);
    };
  }

  /** Descriptors for tooling, stable-sorted by id. */
  descriptors(): readonly TypedCommandDescriptor[] {
    return [...this.#commands.values()]
      .map(({ id, title, inputSummary, resultSummary }) => ({ id, title, inputSummary, resultSummary }))
      .sort((left, right) => left.id < right.id ? -1 : 1);
  }

  /** Invokes a command to completion; see start() for the handle form. */
  invoke<TResult = unknown>(
    id: string,
    input: unknown,
    options: { readonly deadlineMs?: number } = {},
  ): Promise<CommandOutcome<TResult>> {
    return this.start<TResult>(id, input, options).settled;
  }

  /**
   * Starts an invocation. Every run gets an AbortSignal, an optional
   * deadline (enforced by advance() on the caller's clock), and a disposal
   * scope; cancellation preempts — the outcome is fixed as cancelled and
   * owned resources dispose immediately.
   */
  start<TResult = unknown>(
    id: string,
    input: unknown,
    options: { readonly deadlineMs?: number } = {},
  ): CommandInvocationHandle<TResult> {
    const command = this.#commands.get(id);
    if (!command) {
      return { settled: Promise.resolve({ status: "unknown-command", id }), cancel: () => {} };
    }
    const rejection = command.validateInput?.(input);
    if (rejection !== undefined) {
      return { settled: Promise.resolve({ status: "rejected", reason: rejection }), cancel: () => {} };
    }

    const controller = new AbortController();
    const disposers: Array<() => void> = [];
    let settled = false;
    let resolveOutcome!: (outcome: CommandOutcome<TResult>) => void;
    const outcome = new Promise<CommandOutcome<TResult>>((resolve) => resolveOutcome = resolve);
    const settle = (result: CommandOutcome<TResult>): void => {
      if (settled) return; // first settlement wins; cancel preempts success
      settled = true;
      this.#running.delete(handleRecord);
      for (const dispose of disposers.splice(0).reverse()) {
        try {
          dispose();
        } catch {
          // Scope teardown never blocks settlement.
        }
      }
      resolveOutcome(result);
    };

    const context: CommandInvocationContext = {
      signal: controller.signal,
      deadlineMs: options.deadlineMs,
      own: (dispose) => {
        if (settled) dispose();
        else disposers.push(dispose);
      },
    };
    const cancel = (reason = "cancelled"): void => {
      if (settled) return;
      controller.abort();
      settle({ status: "cancelled", reason });
    };
    const handleRecord = { deadlineMs: options.deadlineMs, cancel };
    this.#running.add(handleRecord);

    Promise.resolve()
      .then(() => command.run(input, context))
      .then(
        (result) => settle({ status: "succeeded", result: result as TResult }),
        (error) => {
          if (controller.signal.aborted) settle({ status: "cancelled", reason: "cancelled" });
          else settle({ status: "failed", error });
        },
      );
    return { settled: outcome, cancel };
  }

  /** Cancels every running invocation whose deadline passed. */
  advance(nowMs: number): number {
    let expired = 0;
    for (const running of [...this.#running]) {
      if (running.deadlineMs !== undefined && nowMs >= running.deadlineMs) {
        running.cancel("deadline");
        expired += 1;
      }
    }
    return expired;
  }

  has(id: string): boolean {
    return this.#commands.has(id);
  }

  readonly #running = new Set<{ readonly deadlineMs?: number; readonly cancel: (reason?: string) => void }>();
}

/** Creates a typed command registry. */
export function createTypedCommandRegistry(): TypedCommandRegistry {
  return new TypedCommandRegistry();
}
