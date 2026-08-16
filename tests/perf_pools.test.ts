// Copyright 2023 Im-Beast. MIT license.

// PER-001: allocation reduction is measured, and tests detect
// use-after-release and double-release.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createBufferPool, PoolOwnershipError } from "../mod.ts";

Deno.test("leases are zeroed, size-classed, and reused", () => {
  const pool = createBufferPool();
  const first = pool.lease(100); // rounds up to the 256 class
  assertEquals(first.view.length, 100);
  first.view.fill(0xdeadbeef);
  first.release();

  const second = pool.lease(200); // same class: reuse
  assertEquals(second.view.length, 200);
  assert(second.view.every((value) => value === 0)); // zeroed on release
  const stats = pool.stats();
  assertEquals(stats.allocations, 1);
  assertEquals(stats.reuses, 1);
  second.release();

  assertThrows(() => pool.lease(1_000_000), PoolOwnershipError, "size class");
});

Deno.test("a frame-loop workload shows measured allocation reduction", () => {
  const pool = createBufferPool();
  // 60 simulated frames, each leasing three transient buffers.
  for (let frame = 0; frame < 60; frame += 1) {
    const cells = pool.lease(2000);
    const spans = pool.lease(120);
    const packet = pool.lease(48);
    cells.view[0] = frame;
    packet.release();
    spans.release();
    cells.release();
  }
  const stats = pool.stats();
  assertEquals(stats.allocations, 3); // one per class, first frame only
  assertEquals(stats.reuses, 177); // every later lease reused
  assertEquals(stats.outstanding, 0);
  assert(stats.reuses / (stats.allocations + stats.reuses) > 0.95);
});

Deno.test("double release and use-after-release throw with ownership errors", () => {
  const pool = createBufferPool();
  const lease = pool.lease(10);
  lease.assertLive();
  lease.release();
  assertThrows(() => lease.release(), PoolOwnershipError, "double release");
  assertThrows(() => lease.assertLive(), PoolOwnershipError, "use after release");

  // A stale lease cannot release the buffer out from under a NEW lease.
  const fresh = pool.lease(10);
  assertThrows(() => lease.release(), PoolOwnershipError);
  fresh.assertLive(); // unharmed
  fresh.release();
});

Deno.test("the free list is bounded per class", () => {
  const pool = createBufferPool({ maxPerClass: 2 });
  const leases = Array.from({ length: 5 }, () => pool.lease(32));
  for (const lease of leases) lease.release();
  assertEquals(pool.stats().pooledBuffers, 2); // excess buffers dropped
});
