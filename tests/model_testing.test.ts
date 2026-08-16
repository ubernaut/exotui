// Copyright 2023 Im-Beast. MIT license.

// QAL-001: model-based state-machine tests — random command sequences and
// invariants from a compact reference model; failures retain seed, shrunk
// sequence, initial state, and final inspection. Applied here to two real
// controllers.

import { assert, assertEquals } from "./deps.ts";
import { createRemoteInputSequencer, type RemoteInputSequencer } from "../mod.remote.ts";
import { createTransferListController, type TransferListController } from "../mod.ts";
import { formatModelTestFailure, type ModelCommand, runModelTest } from "../mod.testing.ts";

const ITEMS = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, label: `item-${id}` }));

type TransferModel = { source: string[]; target: string[]; selected: Set<string> };

const TRANSFER_COMMANDS: ModelCommand<TransferModel, TransferListController>[] = [
  {
    name: "toggle",
    generate: (random) => ITEMS[Math.floor(random() * ITEMS.length)]!.id,
    apply(model, args) {
      const id = args as string;
      if (model.selected.has(id)) model.selected.delete(id);
      else model.selected.add(id);
    },
    run: (real, args) => void real.toggle(args as string),
  },
  {
    name: "move-source",
    generate: (random) => random() < 0.5 ? "source" : "target",
    apply(model, args) {
      const from = args as "source" | "target";
      const to = from === "source" ? "target" : "source";
      const moving = model[from].filter((id) => model.selected.has(id));
      model[from] = model[from].filter((id) => !model.selected.has(id));
      model[to].push(...moving);
      model.selected.clear();
    },
    run: (real, args) => void real.move(args as "source" | "target"),
  },
];

Deno.test("transfer-list controller matches its reference model over 40 seeded runs", () => {
  const result = runModelTest<TransferModel, TransferListController>({
    seeds: 40,
    length: 30,
    setup: () => ({
      model: { source: ITEMS.map((item) => item.id), target: [], selected: new Set() },
      real: createTransferListController({ source: ITEMS }),
    }),
    commands: TRANSFER_COMMANDS,
    invariant(model, real) {
      assertEquals(real.items("source").map((item) => item.id), model.source);
      assertEquals(real.items("target").map((item) => item.id), model.target);
    },
    describe: (model) => ({ source: model.source, target: model.target }),
  });
  assert(result.ok, result.ok ? "" : formatModelTestFailure(result.failure));
  assert(result.steps > 500);
});

type SequencerModel = { nextExpected: number; executed: number[] };

Deno.test("input sequencer matches its reference model over 40 seeded runs", () => {
  const executedReal: number[] = [];
  const result = runModelTest<SequencerModel, RemoteInputSequencer<string>>({
    seeds: 40,
    length: 40,
    setup: () => {
      executedReal.length = 0;
      return {
        model: { nextExpected: 1, executed: [] },
        real: createRemoteInputSequencer<string>({
          execute: (_input, sequence) => executedReal.push(sequence),
          maxBuffered: 1000,
        }),
      };
    },
    commands: [{
      name: "submit",
      generate: (random, model) => model.nextExpected + Math.floor(random() * 6) - 2, // replays and jumps
      apply(model, args) {
        const sequence = args as number;
        if (sequence === model.nextExpected) {
          model.executed.push(sequence);
          model.nextExpected += 1;
          // buffered successors drain in the real controller; mirror that
          while (model.executed.includes(model.nextExpected)) model.nextExpected += 1;
        } else if (sequence > model.nextExpected && !model.executed.includes(sequence)) {
          model.executed.push(sequence); // will execute when the gap fills
          model.executed.sort((a, b) => a - b);
        }
      },
      run: (real, args) => void real.submit(args as number, `input-${args}`),
    }],
    invariant(model, real) {
      // The real sequencer executes exactly the contiguous prefix of the
      // model's accepted set.
      const contiguous: number[] = [];
      for (let expected = 1; model.executed.includes(expected); expected += 1) contiguous.push(expected);
      assertEquals(executedReal, contiguous);
      assertEquals(real.ack(), contiguous.length);
    },
  });
  assert(result.ok, result.ok ? "" : formatModelTestFailure(result.failure));
});

Deno.test("failures retain seed, shrunk sequence, initial state, and final inspection", () => {
  // A deliberately wrong model: it believes toggling is idempotent.
  const result = runModelTest<Set<string>, Set<string>>({
    seeds: 5,
    length: 20,
    setup: () => ({ model: new Set(), real: new Set() }),
    commands: [{
      name: "toggle",
      generate: (random) => ["x", "y"][Math.floor(random() * 2)],
      apply: (model, args) => void model.add(args as string), // wrong: never removes
      run(real, args) {
        const id = args as string;
        if (real.has(id)) real.delete(id);
        else real.add(id);
      },
    }],
    invariant(model, real) {
      assertEquals([...real].sort(), [...model].sort());
    },
    describe: (model, real) => ({ model: [...model], real: [...real] }),
  });
  assert(!result.ok);
  const failure = result.failure;
  assert(failure.seed >= 1); // reproducible seed retained
  // Greedy shrinking reduces the failure to the minimal double-toggle.
  assertEquals(failure.sequence.length, 2);
  assertEquals(failure.sequence[0]!.command, "toggle");
  assertEquals(failure.sequence[0]!.args, failure.sequence[1]!.args);
  assertEquals(failure.initialState, { model: [], real: [] });
  assert(failure.finalState !== undefined); // final inspection captured
  assert(failure.error.includes("AssertionError"));
  assert(formatModelTestFailure(failure).includes(`seed ${failure.seed}`));
});
