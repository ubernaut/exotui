// Copyright 2023 Im-Beast. MIT license.

// 036 T1: the terminal-size × key-sequence test matrix. One scenario runs
// once per (size, sequence) cell against a FRESH headless app (the factory
// builds new options per cell so no signal or component leaks across
// cells), and every entry carries a reproducible label, the exact keys
// replayed, and the full scene capture for assertions or visual reports.

import type { KeyPressEvent } from "../input_reader/types.ts";
import type { ConsoleSize } from "../types.ts";
import type { Action } from "../app/actions.ts";
import type { Route } from "../app/router.ts";
import type { TestKeyPressOptions } from "./input.ts";
import type { TerminalSceneCapture } from "./scene.ts";
import { createTestTerminalApp, type TestTerminalAppHarness, type TestTerminalAppOptions } from "./app.ts";

/** One key step: a bare key name or a key with modifiers. */
export type PilotMatrixKey = KeyPressEvent["key"] | ({ key: KeyPressEvent["key"] } & TestKeyPressOptions);

/** One named key sequence. */
export interface PilotMatrixSequence {
  label?: string;
  keys: readonly PilotMatrixKey[];
}

/** The cell context handed to the per-cell options factory and scenario. */
export interface PilotMatrixCell {
  size: ConsoleSize;
  sequence: PilotMatrixSequence;
  /** Reproducible cell label, e.g. `80x24 / tab tab enter`. */
  label: string;
}

/** Matrix run options. */
export interface PilotMatrixOptions<TAction extends Action = Action, TRoute extends Route = Route> {
  sizes: readonly ConsoleSize[];
  sequences: readonly PilotMatrixSequence[];
  /** Builds fresh app options for one cell — called once per cell. */
  app: (cell: PilotMatrixCell) => TestTerminalAppOptions<TAction, TRoute>;
  /** Optional extra interaction after the key sequence, before capture. */
  scenario?: (harness: TestTerminalAppHarness<TAction, TRoute>, cell: PilotMatrixCell) => Promise<void> | void;
}

/** One matrix cell's result. */
export interface PilotMatrixEntry {
  label: string;
  size: ConsoleSize;
  sequenceLabel: string;
  keys: readonly PilotMatrixKey[];
  capture: TerminalSceneCapture;
}

function sequenceLabel(sequence: PilotMatrixSequence): string {
  if (sequence.label) return sequence.label;
  if (sequence.keys.length === 0) return "(no keys)";
  return sequence.keys.map((step) => typeof step === "string" ? step : step.key).join(" ");
}

/** Runs the scenario over every size × sequence cell. */
export async function runPilotMatrix<TAction extends Action = Action, TRoute extends Route = Route>(
  options: PilotMatrixOptions<TAction, TRoute>,
): Promise<PilotMatrixEntry[]> {
  const entries: PilotMatrixEntry[] = [];
  for (const size of options.sizes) {
    for (const sequence of options.sequences) {
      const label = `${size.columns}x${size.rows} / ${sequenceLabel(sequence)}`;
      const cell: PilotMatrixCell = { size, sequence, label };
      const harness = await createTestTerminalApp<TAction, TRoute>({ ...options.app(cell), size });
      try {
        for (const step of sequence.keys) {
          if (typeof step === "string") await harness.pilot.press(step);
          else {
            const { key, ...modifiers } = step;
            await harness.pilot.press(key, modifiers);
          }
        }
        await options.scenario?.(harness, cell);
        entries.push({
          label,
          size,
          sequenceLabel: sequenceLabel(sequence),
          keys: sequence.keys,
          capture: harness.pilot.capture(),
        });
      } finally {
        harness.destroy();
      }
    }
  }
  return entries;
}
