// Copyright 2023 Im-Beast. MIT license.

// ASY-004: virtual-time rate limiters — burst, refill, FIFO fairness, and
// abortable queued acquisition, all deterministic under an explicit clock.

import { assert, assertEquals, assertRejects } from "./deps.ts";
import { createLeakyBucketRateLimiter, createTokenBucketRateLimiter } from "../mod.ts";

Deno.test("token bucket allows a burst, then refills over virtual time", () => {
  const limiter = createTokenBucketRateLimiter({ capacity: 3, refillPerSecond: 1 });
  assert(limiter.tryAcquire(1, 0));
  assert(limiter.tryAcquire(2, 0)); // the full burst
  assertEquals(limiter.tryAcquire(1, 0), false);
  assertEquals(limiter.tryAcquire(1, 500), false); // half a token: not yet
  assert(limiter.tryAcquire(1, 1000)); // one second refilled one token
  assertEquals(limiter.inspect().tokens, 0);
});

Deno.test("queued acquisition is FIFO: a small request waits behind a large one", async () => {
  const limiter = createTokenBucketRateLimiter({ capacity: 3, refillPerSecond: 1 });
  assert(limiter.tryAcquire(3, 0)); // drain
  const order: string[] = [];
  const big = limiter.acquire(3, 0).then(() => order.push("big"));
  const small = limiter.acquire(1, 0).then(() => order.push("small"));

  limiter.advance(1000); // one token: enough for small, but big is the head
  await Promise.resolve();
  assertEquals(order, []);
  limiter.advance(3000); // three tokens: big grants, small still short
  await Promise.resolve();
  assertEquals(order, ["big"]);
  limiter.advance(4000);
  await Promise.all([big, small]);
  assertEquals(order, ["big", "small"]);
});

Deno.test("aborting a queued waiter rejects it and unblocks the queue order", async () => {
  const limiter = createTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1 });
  assert(limiter.tryAcquire(1, 0));
  const controller = new AbortController();
  const aborted = limiter.acquire(1, 0, controller.signal);
  const follower = limiter.acquire(1, 0);
  controller.abort();
  await assertRejects(() => aborted, Error, "aborted");
  limiter.advance(1000);
  await follower; // the abort removed the head; the follower proceeds
  await assertRejects(() => limiter.acquire(5, 1000), RangeError);
});

Deno.test("leaky bucket admits to capacity and drains at its rate", async () => {
  const limiter = createLeakyBucketRateLimiter({ capacity: 2, leakPerSecond: 1 });
  assert(limiter.tryAcquire(0));
  assert(limiter.tryAcquire(0));
  assertEquals(limiter.tryAcquire(0), false); // full
  const queued = limiter.acquire(0);
  limiter.advance(500); // half a unit drained: still full for a whole unit
  assertEquals(limiter.inspect().queued, 1);
  limiter.advance(1500); // 1.5 units drained since start
  await queued;
  assertEquals(limiter.inspect().queued, 0);
});
