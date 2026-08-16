// Copyright 2023 Im-Beast. MIT license.

// PER-004: partial-write fixtures reconstruct exact output and memory
// stays bounded for a stalled sink.

import { assert, assertEquals } from "./deps.ts";
import { createTerminalWriteCoalescer } from "../mod.ts";

function partialSink(acceptPattern: number[]) {
  let received = "";
  let call = 0;
  return {
    write(data: string) {
      const accept = Math.min(data.length, acceptPattern[call % acceptPattern.length]!);
      call += 1;
      received += data.slice(0, accept);
      return accept;
    },
    get received() {
      return received;
    },
  };
}

Deno.test("partial writes reconstruct the exact byte stream", () => {
  const sink = partialSink([3, 1, 5, 2, 100]);
  const coalescer = createTerminalWriteCoalescer(sink);
  coalescer.enqueue("\x1b[1;1Hhello", "frame");
  coalescer.enqueue("\x1b[2;1Hworld", "frame");
  coalescer.enqueue("\x1b[?25h", "sync");
  // Flush repeatedly against the miserly sink until drained.
  for (let round = 0; round < 20 && coalescer.pendingBytes() > 0; round += 1) coalescer.flush();
  assertEquals(sink.received, "\x1b[1;1Hhello\x1b[2;1Hworld\x1b[?25h"); // byte-exact, in order
});

Deno.test("a stalled sink stays memory-bounded by shedding old whole frames", () => {
  const sink = { write: () => 0 }; // fully stalled
  const coalescer = createTerminalWriteCoalescer(sink, { maxPendingBytes: 64 });
  for (let frame = 0; frame < 100; frame += 1) {
    coalescer.enqueue(`\x1b[1;1Hframe-${String(frame).padStart(3, "0")}-payload`, "frame");
  }
  assert(coalescer.pendingBytes() <= 64 + 32, `pending ${coalescer.pendingBytes()}`);
  const flushed = coalescer.flush();
  assert(flushed.droppedFrames >= 90); // counted, not silent
  assert(coalescer.inspect().pendingChunks >= 1); // the newest frame is retained
});

Deno.test("newest frame survives shedding and sync chunks are never dropped", () => {
  let out = "";
  let stalled = true;
  const sink = { write: (data: string) => stalled ? 0 : (out += data, data.length) };
  const coalescer = createTerminalWriteCoalescer(sink, { maxPendingBytes: 40 });
  coalescer.enqueue("SYNC-BEGIN", "sync");
  for (let frame = 0; frame < 50; frame += 1) coalescer.enqueue(`frame-${frame}-xxxxxxxx`, "frame");
  coalescer.enqueue("SYNC-END", "sync");
  stalled = false;
  const result = coalescer.flush();
  assert(result.droppedFrames >= 48);
  assert(out.startsWith("SYNC-BEGIN")); // sync survived and ordered
  assert(out.includes("frame-49")); // the newest frame survived
  assert(out.endsWith("SYNC-END"));
  assert(!out.includes("frame-0-")); // old frames were the ones shed
});

Deno.test("urgent cursor teardown jumps the queue but never splits a partial", () => {
  const accepts: number[] = [4]; // first write: partial (4 bytes of the frame)
  let out = "";
  const sink = {
    write(data: string) {
      const accept = accepts.length > 0 ? accepts.shift()! : data.length;
      out += data.slice(0, accept);
      return accept;
    },
  };
  const coalescer = createTerminalWriteCoalescer(sink);
  coalescer.enqueue("\x1b[5;5HFRAME", "frame");
  coalescer.flush(); // head is now partially written
  coalescer.enqueue("\x1b[?25h\x1b[0m", "urgent"); // teardown arrives
  coalescer.enqueue("another-frame", "frame");
  coalescer.flush();
  // The partial head completed first, THEN the urgent chunk, then frames.
  assertEquals(out, "\x1b[5;5HFRAME\x1b[?25h\x1b[0manother-frame");
});
