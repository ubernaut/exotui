// Copyright 2023 Im-Beast. MIT license.

// REM-007: reordered/replayed input cannot execute twice, and missing
// input forces an explicit recovery policy.

import { assert, assertEquals } from "./deps.ts";
import { createRemoteInputSequencer } from "../mod.remote.ts";

function sequencer(authorize?: (input: string) => boolean) {
  const executed: Array<[number, string]> = [];
  const instance = createRemoteInputSequencer<string>({
    execute: (input, sequence) => executed.push([sequence, input]),
    authorize,
    maxBuffered: 3,
  });
  return { instance, executed };
}

Deno.test("in-order input executes once; replays only re-acknowledge", () => {
  const { instance, executed } = sequencer();
  assertEquals(instance.submit(1, "a").outcome, "executed");
  assertEquals(instance.submit(2, "b").outcome, "executed");
  const replay = instance.submit(2, "b");
  assertEquals(replay.outcome, "duplicate");
  assertEquals(replay.ack, 2);
  assertEquals(instance.submit(1, "a").outcome, "duplicate");
  assertEquals(executed, [[1, "a"], [2, "b"]]); // exactly once each
});

Deno.test("out-of-order arrivals buffer and drain in order when the gap fills", () => {
  const { instance, executed } = sequencer();
  assertEquals(instance.submit(1, "a").outcome, "executed");
  const early = instance.submit(3, "c");
  assertEquals(early.outcome, "buffered");
  assertEquals(early.missingSequence, 2); // the gap is named
  assertEquals(instance.submit(4, "d").outcome, "buffered");
  assertEquals(executed.length, 1); // nothing skips ahead

  const filler = instance.submit(2, "b");
  assertEquals(filler.outcome, "executed");
  assertEquals(filler.ack, 4); // the whole buffer drained
  assertEquals(executed, [[1, "a"], [2, "b"], [3, "c"], [4, "d"]]);
  assertEquals(instance.pendingGap(), undefined);
});

Deno.test("missing input demands explicit recovery; the hole is dropped knowingly", () => {
  const { instance, executed } = sequencer();
  instance.submit(1, "a");
  instance.submit(3, "c");
  instance.submit(4, "d");
  instance.submit(5, "e");
  assertEquals(instance.submit(6, "f").outcome, "buffer-overflow"); // bound holds
  assertEquals(executed.length, 1);
  assertEquals(instance.pendingGap()!.missingSequence, 2);

  // The host decides: resync to 3, knowingly dropping sequence 2.
  const dropped = instance.recover(3);
  assertEquals(dropped, 0); // nothing buffered below 3
  assertEquals(executed.map(([seq]) => seq), [1, 3, 4, 5]);
  assertEquals(instance.ack(), 5);

  // A late replay of the dropped input cannot execute anymore.
  assertEquals(instance.submit(2, "b").outcome, "duplicate");
  assertEquals(executed.length, 4);
});

Deno.test("role checks record denials without jamming the stream", () => {
  const { instance, executed } = sequencer((input) => input !== "forbidden");
  assertEquals(instance.submit(1, "ok").outcome, "executed");
  const denied = instance.submit(2, "forbidden");
  assertEquals(denied.outcome, "unauthorized");
  assertEquals(denied.ack, 2); // the stream advances
  assertEquals(instance.submit(3, "next").outcome, "executed");
  assertEquals(executed.map(([, input]) => input), ["ok", "next"]);
  assertEquals(instance.inspect().denied, 1);
  // Replaying the denied input cannot execute it either.
  assertEquals(instance.submit(2, "forbidden").outcome, "duplicate");
});
