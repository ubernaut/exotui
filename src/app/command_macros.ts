// Copyright 2023 Im-Beast. MIT license.

// AUT-006: macros as data, never code. A macro records a sequence of
// (command id, arguments) pairs — recording accepts only allowlisted ids
// with arguments the command's own gate validates, so a macro can never
// smuggle arbitrary behavior. Playback first previews the required
// permissions (the union the recorded ids declare), and execution is
// transactional per step: the first failing step stops the macro
// atomically, reporting what ran and what never started.

import type { CommandOutcome, TypedCommandRegistry } from "./typed_commands.ts";

/** One recorded macro step. */
export interface MacroStep {
  readonly commandId: string;
  readonly args: unknown;
}

/** A recorded macro. */
export interface CommandMacro {
  readonly name: string;
  readonly steps: readonly MacroStep[];
}

/** Playback preview: what the macro will need. */
export interface MacroPlaybackPreview {
  readonly steps: readonly string[];
  /** Union of permissions declared for the recorded ids. */
  readonly permissions: readonly string[];
}

/** Result of one playback. */
export interface MacroPlaybackResult {
  readonly status: "completed" | "stopped";
  /** Outcomes of the steps that ran, in order. */
  readonly ran: ReadonlyArray<{ commandId: string; outcome: CommandOutcome }>;
  /** Steps that never started because an earlier one failed. */
  readonly skipped: readonly string[];
}

/** Records and plays macros over an allowlist. */
export class CommandMacroRecorder {
  readonly #registry: TypedCommandRegistry;
  readonly #allowlist: ReadonlySet<string>;
  readonly #permissions: ReadonlyMap<string, readonly string[]>;
  readonly #macros = new Map<string, CommandMacro>();
  #recording: { name: string; steps: MacroStep[] } | undefined;

  constructor(
    registry: TypedCommandRegistry,
    options: {
      readonly allowlist: readonly string[];
      /** Permissions each command id requires, for playback previews. */
      readonly permissions?: Readonly<Record<string, readonly string[]>>;
    },
  ) {
    this.#registry = registry;
    this.#allowlist = new Set(options.allowlist);
    this.#permissions = new Map(Object.entries(options.permissions ?? {}));
  }

  startRecording(name: string): void {
    this.#recording = { name, steps: [] };
  }

  /**
   * Live recording: performs the user's action through the registry and
   * captures it as a step. Non-allowlisted ids are refused outright, and a
   * gate-rejected invocation records nothing — a macro holds only command
   * references with arguments their own gates accepted.
   */
  async recordStep(commandId: string, args: unknown): Promise<{ readonly ok: boolean; readonly reason?: string }> {
    if (!this.#recording) return { ok: false, reason: "not recording" };
    if (!this.#allowlist.has(commandId)) return { ok: false, reason: `"${commandId}" is not allowlisted for macros` };
    const outcome = await this.#registry.invoke(commandId, args, {});
    if (outcome.status === "rejected") return { ok: false, reason: outcome.reason };
    if (outcome.status === "unknown-command") return { ok: false, reason: `unknown command "${commandId}"` };
    if (outcome.status !== "succeeded") return { ok: false, reason: "the recorded action did not succeed" };
    this.#recording.steps.push({ commandId, args });
    return { ok: true };
  }

  stopRecording(): CommandMacro | undefined {
    if (!this.#recording) return undefined;
    const macro: CommandMacro = { name: this.#recording.name, steps: [...this.#recording.steps] };
    this.#macros.set(macro.name, macro);
    this.#recording = undefined;
    return macro;
  }

  /** The playback preview: step ids and the union of their permissions. */
  preview(name: string): MacroPlaybackPreview | undefined {
    const macro = this.#macros.get(name);
    if (!macro) return undefined;
    const permissions = new Set<string>();
    for (const step of macro.steps) {
      for (const permission of this.#permissions.get(step.commandId) ?? []) permissions.add(permission);
    }
    return { steps: macro.steps.map((step) => step.commandId), permissions: [...permissions].sort() };
  }

  /** Plays a macro; the first failing step stops it atomically. */
  async play(name: string): Promise<MacroPlaybackResult | undefined> {
    const macro = this.#macros.get(name);
    if (!macro) return undefined;
    const ran: Array<{ commandId: string; outcome: CommandOutcome }> = [];
    for (let index = 0; index < macro.steps.length; index += 1) {
      const step = macro.steps[index]!;
      const outcome = await this.#registry.invoke(step.commandId, step.args);
      ran.push({ commandId: step.commandId, outcome });
      if (outcome.status !== "succeeded") {
        return {
          status: "stopped",
          ran,
          skipped: macro.steps.slice(index + 1).map((skippedStep) => skippedStep.commandId),
        };
      }
    }
    return { status: "completed", ran, skipped: [] };
  }
}

/** Creates a macro recorder over a typed registry and allowlist. */
export function createCommandMacroRecorder(
  registry: TypedCommandRegistry,
  options: {
    readonly allowlist: readonly string[];
    readonly permissions?: Readonly<Record<string, readonly string[]>>;
  },
): CommandMacroRecorder {
  return new CommandMacroRecorder(registry, options);
}
