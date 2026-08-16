// Copyright 2023 Im-Beast. MIT license.

// REM-005: a stalled client cannot grow host memory and resumes from the
// newest valid base.

import { assert, assertEquals } from "./deps.ts";
import { applyCellFrameDelta, type CellFrame, createFrameFlowController, decodeCellFrame } from "../mod.remote.ts";

function frame(stamp: number): CellFrame {
  // Only the first two cells carry the stamp — deltas stay small.
  return {
    columns: 4,
    rows: 2,
    cells: Array.from({ length: 8 }, (_, index) => ({
      char: index < 2 ? String.fromCharCode(65 + ((stamp + index) % 26)) : ".",
      style: index % 2 === 0 ? "a" : "b",
    })),
  };
}

Deno.test("frames chain as deltas after an initial full frame", () => {
  const flow = createFrameFlowController({ windowSize: 4 });
  const first = flow.offer(frame(0))!;
  assertEquals(first.sequence, 1);
  assertEquals(first.payload.kind, "full");
  const second = flow.offer(frame(1))!;
  assertEquals(second.sequence, 2);
  assertEquals(second.payload.kind, "delta");

  // The client can reconstruct exactly by applying in order.
  const base = decodeCellFrame(first.payload as never);
  assert(base.ok);
  const applied = applyCellFrameDelta(base.frame, second.payload as never);
  assert(applied.ok);
  assertEquals(applied.frame, frame(1));
});

Deno.test("a stalled client coalesces to constant memory and resumes newest", () => {
  const flow = createFrameFlowController({ windowSize: 2 });
  assert(flow.offer(frame(0)));
  assert(flow.offer(frame(1)));
  // Window full: a burst of 100 frames coalesces into ONE pending slot.
  for (let stamp = 2; stamp < 102; stamp += 1) {
    assertEquals(flow.offer(frame(stamp)), undefined);
  }
  const snapshot = flow.inspect();
  assertEquals(snapshot.inFlight, 2);
  assertEquals(snapshot.pending, true);
  assertEquals(snapshot.coalescedDrops, 99); // stale intermediates dropped, not stored

  // The ack releases exactly the NEWEST frame, not the backlog.
  const released = flow.ack(2)!;
  assertEquals(released.sequence, 3);
  const decodedTail = released.payload.kind === "delta";
  assert(decodedTail); // delta against the chain the client still holds
  assertEquals(flow.inspect().pending, false);
  assertEquals(flow.inspect().inFlight, 1);
});

Deno.test("resync clears the chain and the next frame is full", () => {
  const flow = createFrameFlowController({ windowSize: 4 });
  flow.offer(frame(0));
  flow.offer(frame(1));
  flow.resync();
  assertEquals(flow.inspect().inFlight, 0);
  const next = flow.offer(frame(2))!;
  assertEquals(next.payload.kind, "full"); // fresh base for the client
  const decoded = decodeCellFrame(next.payload as never);
  assert(decoded.ok);
  assertEquals(decoded.frame, frame(2));
});
