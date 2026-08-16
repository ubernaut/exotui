// Copyright 2023 Im-Beast. MIT license.

// QAL-001: model-based state-machine testing. A compact reference model
// and the real controller run the same randomly generated command
// sequence (seeded — every failure replays from its seed alone); an
// invariant compares them after every step. On failure the harness
// greedily SHRINKS the recorded sequence — replaying candidate
// subsequences from a fresh setup — and reports the seed, the shrunk
// sequence with concrete arguments, the initial state description, the
// final inspection of both sides, and the error, so a red run is a
// minimal reproducible recipe rather than a random stack trace.

/** Deterministic PRNG (mulberry32) so failures replay from their seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One command the harness can generate, apply, and run. */
export interface ModelCommand<M, R> {
  readonly name: string;
  /** Generates arguments; undefined = not applicable in this state. */
  generate(random: () => number, model: M): unknown | undefined;
  /** Advances the reference model. */
  apply(model: M, args: unknown): void;
  /** Drives the real controller. */
  run(real: R, args: unknown): void;
}

/** One recorded step (concrete args — replays never regenerate). */
export interface ModelStep {
  readonly command: string;
  readonly args: unknown;
}

/** Harness options. */
export interface ModelTestOptions<M, R> {
  /** Independent seeded runs. */
  readonly seeds: number;
  /** Commands per run. */
  readonly length: number;
  /** Builds a fresh model/controller pair. */
  setup(): { model: M; real: R };
  readonly commands: readonly ModelCommand<M, R>[];
  /** Throws when model and real disagree. */
  invariant(model: M, real: R): void;
  /** Serializable views for failure reports. */
  describe?(model: M, real: R): unknown;
  /** Base offset so suites use disjoint seed spaces. */
  readonly seedBase?: number;
}

/** A failing run's full reproduction recipe. */
export interface ModelTestFailure {
  readonly seed: number;
  /** The shrunk sequence — minimal under greedy removal. */
  readonly sequence: readonly ModelStep[];
  readonly initialState: unknown;
  readonly finalState: unknown;
  readonly error: string;
}

/** The harness outcome. */
export type ModelTestResult =
  | { readonly ok: true; readonly runs: number; readonly steps: number }
  | { readonly ok: false; readonly failure: ModelTestFailure };

function replay<M, R>(
  options: ModelTestOptions<M, R>,
  sequence: readonly ModelStep[],
): { failed: boolean; error?: string; finalState?: unknown } {
  const { model, real } = options.setup();
  const byName = new Map(options.commands.map((command) => [command.name, command]));
  try {
    for (const step of sequence) {
      const command = byName.get(step.command)!;
      command.apply(model, step.args);
      command.run(real, step.args);
      options.invariant(model, real);
    }
    return { failed: false };
  } catch (error) {
    return { failed: true, error: String(error), finalState: options.describe?.(model, real) };
  }
}

function shrink<M, R>(options: ModelTestOptions<M, R>, sequence: ModelStep[]): ModelStep[] {
  let current = sequence;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let index = 0; index < current.length; index += 1) {
      const candidate = [...current.slice(0, index), ...current.slice(index + 1)];
      if (replay(options, candidate).failed) {
        current = candidate;
        progressed = true;
        break;
      }
    }
  }
  return current;
}

/** Runs the model test across every seed. */
export function runModelTest<M, R>(options: ModelTestOptions<M, R>): ModelTestResult {
  let totalSteps = 0;
  for (let run = 0; run < options.seeds; run += 1) {
    const seed = (options.seedBase ?? 1) + run;
    const random = seededRandom(seed * 2654435761);
    const { model, real } = options.setup();
    const initialState = options.describe?.(model, real);
    const recorded: ModelStep[] = [];
    try {
      for (let step = 0; step < options.length; step += 1) {
        const command = options.commands[Math.floor(random() * options.commands.length)]!;
        const args = command.generate(random, model);
        if (args === undefined) continue;
        recorded.push({ command: command.name, args });
        command.apply(model, args);
        command.run(real, args);
        options.invariant(model, real);
        totalSteps += 1;
      }
    } catch (error) {
      const shrunk = shrink(options, recorded);
      const final = replay(options, shrunk);
      return {
        ok: false,
        failure: {
          seed,
          sequence: shrunk,
          initialState,
          finalState: final.finalState,
          error: final.error ?? String(error),
        },
      };
    }
  }
  return { ok: true, runs: options.seeds, steps: totalSteps };
}

/** Formats a failure as a paste-ready reproduction block. */
export function formatModelTestFailure(failure: ModelTestFailure): string {
  const steps = failure.sequence
    .map((step, index) => `  ${index + 1}. ${step.command}(${JSON.stringify(step.args)})`)
    .join("\n");
  return [
    `Model test failed (seed ${failure.seed}):`,
    `initial: ${JSON.stringify(failure.initialState)}`,
    steps,
    `final: ${JSON.stringify(failure.finalState)}`,
    `error: ${failure.error}`,
  ].join("\n");
}
