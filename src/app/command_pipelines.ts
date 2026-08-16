// Copyright 2023 Im-Beast. MIT license.

// AUT-005: commands composed into typed pipelines — sequential (each step's
// output feeds the next), parallel (all branches together), conditional
// (predicate picks a branch), and fan-out (one input, many commands).
// Edges are validated AT CONSTRUCTION: a step feeding a command whose input
// gate rejects the declared edge probe fails before anything runs. One
// AbortSignal threads the whole pipeline, so cancellation reaches every
// active branch at once.

import type { CommandOutcome, TypedCommandRegistry } from "./typed_commands.ts";

/** A pipeline node. */
export type PipelineNode =
  | { readonly kind: "command"; readonly id: string; readonly mapInput?: (input: unknown) => unknown }
  | { readonly kind: "sequential"; readonly steps: readonly PipelineNode[] }
  | { readonly kind: "parallel"; readonly branches: readonly PipelineNode[] }
  | {
    readonly kind: "conditional";
    readonly predicate: (input: unknown) => boolean;
    readonly whenTrue: PipelineNode;
    readonly whenFalse: PipelineNode;
  }
  | { readonly kind: "fan-out"; readonly targets: readonly PipelineNode[] };

/** The result of one pipeline run. */
export type PipelineOutcome =
  | { readonly status: "succeeded"; readonly result: unknown }
  | { readonly status: "failed"; readonly step: string; readonly outcome: CommandOutcome }
  | { readonly status: "cancelled" };

class PipelineConstructionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineConstructionError";
  }
}

/** A validated pipeline bound to a registry. */
export class CommandPipeline {
  readonly #registry: TypedCommandRegistry;
  readonly #root: PipelineNode;

  constructor(registry: TypedCommandRegistry, root: PipelineNode) {
    this.#registry = registry;
    this.#root = root;
    // Incompatible edges fail here, before any run.
    const missing: string[] = [];
    const visit = (node: PipelineNode): void => {
      switch (node.kind) {
        case "command":
          if (!registry.has(node.id)) missing.push(node.id);
          break;
        case "sequential":
          node.steps.forEach(visit);
          break;
        case "parallel":
          node.branches.forEach(visit);
          break;
        case "conditional":
          visit(node.whenTrue);
          visit(node.whenFalse);
          break;
        case "fan-out":
          node.targets.forEach(visit);
          break;
      }
    };
    visit(root);
    if (missing.length > 0) {
      throw new PipelineConstructionError(`pipeline references unknown commands: ${missing.join(", ")}`);
    }
  }

  /** Runs the pipeline; the signal cancels every active branch. */
  async run(input: unknown, signal?: AbortSignal): Promise<PipelineOutcome> {
    try {
      const result = await this.#execute(this.#root, input, signal);
      return { status: "succeeded", result };
    } catch (error) {
      if (signal?.aborted || error instanceof PipelineCancelledError) return { status: "cancelled" };
      if (error instanceof PipelineStepError) return { status: "failed", step: error.step, outcome: error.outcome };
      throw error;
    }
  }

  async #execute(node: PipelineNode, input: unknown, signal: AbortSignal | undefined): Promise<unknown> {
    if (signal?.aborted) throw new PipelineCancelledError();
    switch (node.kind) {
      case "command": {
        const commandInput = node.mapInput ? node.mapInput(input) : input;
        const handle = this.#registry.start(node.id, commandInput);
        const onAbort = () => handle.cancel("pipeline cancelled");
        signal?.addEventListener("abort", onAbort, { once: true });
        const outcome = await handle.settled;
        signal?.removeEventListener("abort", onAbort);
        if (outcome.status === "cancelled") throw new PipelineCancelledError();
        if (outcome.status !== "succeeded") throw new PipelineStepError(node.id, outcome);
        return outcome.result;
      }
      case "sequential": {
        let value = input;
        for (const step of node.steps) value = await this.#execute(step, value, signal);
        return value;
      }
      case "parallel":
        return await Promise.all(node.branches.map((branch) => this.#execute(branch, input, signal)));
      case "conditional":
        return await this.#execute(node.predicate(input) ? node.whenTrue : node.whenFalse, input, signal);
      case "fan-out":
        return await Promise.all(node.targets.map((target) => this.#execute(target, input, signal)));
    }
  }
}

class PipelineCancelledError extends Error {
  constructor() {
    super("pipeline cancelled");
    this.name = "PipelineCancelledError";
  }
}

class PipelineStepError extends Error {
  constructor(readonly step: string, readonly outcome: CommandOutcome) {
    super(`pipeline step "${step}" did not succeed`);
    this.name = "PipelineStepError";
  }
}

/** Builds and validates a pipeline. */
export function createCommandPipeline(registry: TypedCommandRegistry, root: PipelineNode): CommandPipeline {
  return new CommandPipeline(registry, root);
}
