// Copyright 2023 Im-Beast. MIT license.

// DAT-008: streams as resources — bounded buffering with the configured
// loss/backpressure policy, reconnect hooks, and cancellation that closes
// the producer.

import { assert, assertEquals } from "./deps.ts";
import { consumeIterableStream, consumePushStream } from "../mod.ts";

Deno.test("push sources buffer under the loss policy and dispose closes the producer", async () => {
  let emit!: (value: number) => void;
  let cleanedUp = false;
  let aborted = false;
  const resource = consumePushStream<number>((send, signal) => {
    emit = send;
    signal.addEventListener("abort", () => aborted = true);
    return () => cleanedUp = true;
  }, { capacity: 2, overflowPolicy: "drop-oldest" });

  emit(1);
  emit(2);
  emit(3); // capacity 2: the oldest (1) drops
  const iterator = resource.values()[Symbol.asyncIterator]();
  assertEquals((await iterator.next()).value, 2);
  assertEquals((await iterator.next()).value, 3);

  resource.dispose();
  assert(aborted && cleanedUp, "dispose must abort and clean up the producer");
  emit(99); // late emits are ignored
  assertEquals((await iterator.next()).done, true);
});

Deno.test("iterable sources reconnect through the hook up to their budget", async () => {
  let opens = 0;
  const reconnects: number[] = [];
  const resource = consumeIterableStream<number>(() => {
    opens += 1;
    const attempt = opens;
    return (async function* () {
      yield attempt * 10;
      if (attempt === 1) throw new Error("connection dropped");
      yield attempt * 10 + 1;
    })();
  }, { maxReconnects: 1, onReconnect: (attempt) => reconnects.push(attempt) });

  const received: number[] = [];
  for await (const value of resource.values()) received.push(value);
  assertEquals(received, [10, 20, 21]); // first connect's value, then the retry's
  assertEquals(reconnects, [1]);
  assertEquals(resource.inspect().reconnects, 1);
  assertEquals(opens, 2);
});

Deno.test("block policy applies real backpressure and cancellation stops the pull", async () => {
  let produced = 0;
  const resource = consumeIterableStream<number>(() =>
    (async function* () {
      for (let value = 0; value < 100; value += 1) {
        produced += 1;
        yield value;
      }
    })(), { capacity: 1, overflowPolicy: "block" });

  const iterator = resource.values()[Symbol.asyncIterator]();
  assertEquals((await iterator.next()).value, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // One delivered, one buffered, one awaiting its send: the producer paused.
  assert(produced <= 4, `producer ran ahead: ${produced}`);

  resource.dispose(); // cancellation closes the producer loop
  await new Promise((resolve) => setTimeout(resolve, 0));
  const after = produced;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(produced, after); // nothing pulls anymore
});
