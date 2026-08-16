// Copyright 2023 Im-Beast. MIT license.

// QAL-006: a captured failing run reproduces byte-identical state
// checkpoints offline.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { DeterministicRuntime, ReplayDivergenceError } from "../mod.testing.ts";

// A small program with time, randomness, input, and resize dependence.
function program(runtime: DeterministicRuntime): { frames: string[] } {
  const frames: string[] = [];
  const size = runtime.nextResize() ?? { columns: 80, rows: 24 };
  for (let frame = 0; frame < 3; frame += 1) {
    const at = runtime.now();
    const jitter = Math.floor(runtime.random() * 100);
    const key = runtime.nextInput() ?? "-";
    frames.push(`${size.columns}x${size.rows}@${at}+${jitter}:${key}`);
    runtime.checkpoint(`frame-${frame}`, frames);
  }
  return { frames };
}

function liveSources() {
  let tick = 1000;
  let randomState = 42;
  const inputs = ["a", "b"];
  return {
    now: () => (tick += 16),
    random: () => {
      randomState = (randomState * 1103515245 + 12345) % 2147483648;
      return randomState / 2147483648;
    },
    nextInput: () => inputs.shift(),
    nextResize: () => ({ columns: 100, rows: 30 }),
  };
}

Deno.test("record then replay reproduces byte-identical checkpoints", () => {
  const recorder = DeterministicRuntime.record(liveSources());
  const recorded = program(recorder);
  const journal = recorder.journal();
  assertEquals(journal.checkpoints.length, 3);
  assertEquals(journal.entries.filter((entry) => entry.kind === "time").length, 3);

  // Offline replay: no live sources at all — checkpoints must match.
  const replayer = DeterministicRuntime.replay(JSON.parse(JSON.stringify(journal)));
  const replayed = program(replayer);
  replayer.assertFullyReplayed();
  assertEquals(replayed.frames, recorded.frames);
});

Deno.test("a divergent program fails loudly at the exact checkpoint", () => {
  const recorder = DeterministicRuntime.record(liveSources());
  program(recorder);
  const journal = recorder.journal();

  const divergent = (runtime: DeterministicRuntime) => {
    runtime.nextResize();
    for (let frame = 0; frame < 3; frame += 1) {
      runtime.now();
      runtime.random();
      runtime.nextInput();
      // The state fed to the checkpoint differs from the recording.
      runtime.checkpoint(`frame-${frame}`, [`tampered-${frame}`]);
    }
  };
  const error = assertThrows(
    () => divergent(DeterministicRuntime.replay(journal)),
    ReplayDivergenceError,
  );
  assert(error.message.includes('"frame-0"') && error.message.includes("diverged"));
});

Deno.test("kind mismatches and journal overruns are named divergences", () => {
  const recorder = DeterministicRuntime.record(liveSources());
  recorder.now();
  const journal = recorder.journal();

  const wrongKind = DeterministicRuntime.replay(journal);
  const kindError = assertThrows(() => wrongKind.random(), ReplayDivergenceError);
  assert(kindError.message.includes("asked for random") && kindError.message.includes("time"));

  const overrun = DeterministicRuntime.replay(journal);
  overrun.now();
  assertThrows(() => overrun.now(), ReplayDivergenceError, "past the journal");

  // Unconsumed journal = the replayed run took a different path.
  const partial = DeterministicRuntime.replay(journal);
  assertThrows(() => partial.assertFullyReplayed(), ReplayDivergenceError, "0 of 1");
});
