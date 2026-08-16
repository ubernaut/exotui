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

/** A registered command. */
export interface TypedCommand<TInput = unknown, TResult = unknown> extends TypedCommandDescriptor {
  /** Runtime input gate; return an error message to reject. */
  validateInput?(input: unknown): string | undefined;
  run(input: TInput): Promise<TResult> | TResult;
}

/** Outcome of one invocation. */
export type CommandOutcome<TResult = unknown> =
  | { readonly status: "succeeded"; readonly result: TResult }
  | { readonly status: "rejected"; readonly reason: string }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "unknown-command"; readonly id: string };

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

  /** Invokes a command; incompatible input rejects before execution. */
  async invoke<TResult = unknown>(id: string, input: unknown): Promise<CommandOutcome<TResult>> {
    const command = this.#commands.get(id);
    if (!command) return { status: "unknown-command", id };
    const rejection = command.validateInput?.(input);
    if (rejection !== undefined) return { status: "rejected", reason: rejection };
    try {
      return { status: "succeeded", result: await command.run(input) as TResult };
    } catch (error) {
      return { status: "failed", error };
    }
  }

  has(id: string): boolean {
    return this.#commands.has(id);
  }
}

/** Creates a typed command registry. */
export function createTypedCommandRegistry(): TypedCommandRegistry {
  return new TypedCommandRegistry();
}
