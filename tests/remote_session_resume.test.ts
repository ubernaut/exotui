// Copyright 2023 Im-Beast. MIT license.

// REM-006: expired or replayed tokens fail, and successful resume neither
// duplicates input nor loses acknowledged output.

import { assert, assertEquals } from "./deps.ts";
import { type CellFrame, createRemoteInputSequencer, createSessionResumeManager } from "../mod.remote.ts";

const FRAME: CellFrame = {
  columns: 3,
  rows: 1,
  cells: [{ char: "o", style: "a" }, { char: "k", style: "a" }, { char: "!", style: "b" }],
};

Deno.test("tokens are single-use with caller-clock expiry", () => {
  const manager = createSessionResumeManager({ tokenTtlMs: 1000 });
  manager.checkpoint("s1", { frame: FRAME, frameSequence: 7, inputAck: 12 });

  const token = manager.issueToken("s1", 0);
  const resumed = manager.resume(token, 500);
  assert(resumed.ok);
  assertEquals(resumed.sessionId, "s1");
  assertEquals(resumed.checkpoint.frameSequence, 7);

  const replayed = manager.resume(token, 600);
  assert(!replayed.ok && replayed.reason === "replayed");

  const expired = manager.issueToken("s1", 0);
  const late = manager.resume(expired, 1000);
  assert(!late.ok && late.reason === "expired");

  assert(!manager.resume("forged", 10).ok);
  const bare = createSessionResumeManager();
  const noCheckpoint = bare.resume(bare.issueToken("sX", 0), 1);
  assert(!noCheckpoint.ok && noCheckpoint.reason === "no-checkpoint");
});

Deno.test("resume neither duplicates input nor loses acknowledged output", () => {
  const manager = createSessionResumeManager();
  const executed: number[] = [];
  const sequencer = createRemoteInputSequencer<string>({
    execute: (_input, sequence) => executed.push(sequence),
  });
  // The session processed inputs 1..3 and acked frame 5 before the drop.
  sequencer.submit(1, "a");
  sequencer.submit(2, "b");
  sequencer.submit(3, "c");
  manager.checkpoint("s1", { frame: FRAME, frameSequence: 5, inputAck: sequencer.ack() });

  const token = manager.issueToken("s1", 100);
  const resumed = manager.resume(token, 150);
  assert(resumed.ok);
  // Acknowledged output survives: the checkpoint carries the acked frame.
  assertEquals(resumed.checkpoint.frame, FRAME);
  // The client replays its unacked tail from inputAck + 1; anything at or
  // below the ack is an inert duplicate — nothing executes twice.
  assertEquals(resumed.checkpoint.inputAck, 3);
  assertEquals(sequencer.submit(2, "b").outcome, "duplicate");
  assertEquals(sequencer.submit(3, "c").outcome, "duplicate");
  assertEquals(sequencer.submit(4, "d").outcome, "executed");
  assertEquals(executed, [1, 2, 3, 4]);
});

Deno.test("sweep and session end release bounded state", () => {
  const manager = createSessionResumeManager({ tokenTtlMs: 100 });
  manager.checkpoint("s1", { frame: FRAME, frameSequence: 1, inputAck: 0 });
  manager.issueToken("s1", 0);
  const redeemable = manager.issueToken("s1", 0);
  manager.resume(redeemable, 10);
  assertEquals(manager.sweep(100), 2); // expired + redeemed both released
  manager.checkpoint("s1", { frame: FRAME, frameSequence: 2, inputAck: 1 }); // replaces, never accumulates
  assertEquals(manager.inspect().checkpoints, 1);
  manager.end("s1");
  assertEquals(manager.inspect(), { tokens: 0, checkpoints: 0 });
});
