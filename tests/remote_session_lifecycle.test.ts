// Copyright 2023 Im-Beast. MIT license.

// REM-010: each termination reason is deterministic and disposal releases
// the terminal backend exactly once.

import { assert, assertEquals } from "./deps.ts";
import { createSessionLifecycleManager } from "../mod.remote.ts";

function backend() {
  let disposals = 0;
  return {
    dispose: () => void (disposals += 1),
    get disposals() {
      return disposals;
    },
  };
}

Deno.test("idle and lifetime expiry terminate deterministically in order", () => {
  const manager = createSessionLifecycleManager({ idleMs: 100, lifetimeMs: 1000 });
  const first = backend();
  const second = backend();
  assert(manager.open("idle-one", "t1", first, 0));
  assert(manager.open("long-one", "t1", second, 0));

  manager.touch("long-one", 950); // keeps it non-idle
  const atIdle = manager.tick(150);
  assertEquals(atIdle.map((record) => `${record.sessionId}:${record.reason}`), ["idle-one:idle-expired"]);
  assertEquals(first.disposals, 1);

  // Lifetime outranks idleness: at 1000 the reason is lifetime, not idle.
  const atLifetime = manager.tick(1050);
  assertEquals(atLifetime.map((record) => record.reason), ["lifetime-expired"]);
  assertEquals(second.disposals, 1);

  // Determinism: rebuilding the same state yields the same reasons.
  const replayManager = createSessionLifecycleManager({ idleMs: 100, lifetimeMs: 1000 });
  const replayBackend = backend();
  replayManager.open("long-one", "t1", replayBackend, 0);
  replayManager.touch("long-one", 950);
  assertEquals(replayManager.tick(1050).map((record) => record.reason), ["lifetime-expired"]);
});

Deno.test("tenant quotas refuse with a journaled reason", () => {
  const manager = createSessionLifecycleManager({ maxSessionsPerTenant: 2 });
  assert(manager.open("a", "tenant", backend(), 0));
  assert(manager.open("b", "tenant", backend(), 0));
  assertEquals(manager.open("c", "tenant", backend(), 0), false);
  assert(manager.open("other", "different-tenant", backend(), 0)); // scoped per tenant
  assertEquals(manager.journal().map((record) => `${record.sessionId}:${record.reason}`), ["c:quota-rejected"]);
});

Deno.test("detach behavior and double-disposal guard", () => {
  const manager = createSessionLifecycleManager({ detachBehavior: "terminate" });
  const owned = backend();
  manager.open("s", "t", owned, 0);
  manager.attach("s", 1); // two clients now
  manager.detach("s", 2);
  assertEquals(owned.disposals, 0); // one client remains
  manager.detach("s", 3);
  assertEquals(owned.disposals, 1); // last detach terminates
  assertEquals(manager.terminate("s", 4), false); // already gone
  assertEquals(owned.disposals, 1); // exactly once, ever

  const keeper = createSessionLifecycleManager({ detachBehavior: "keep" });
  const kept = backend();
  keeper.open("k", "t", kept, 0);
  keeper.detach("k", 1);
  assertEquals(kept.disposals, 0); // survives detached
});

Deno.test("graceful drain refuses new sessions and ends existing after grace", () => {
  const manager = createSessionLifecycleManager({ drainGraceMs: 100 });
  const survivor = backend();
  manager.open("s", "t", survivor, 0);
  manager.drain(50);
  assertEquals(manager.open("late", "t", backend(), 60), false); // no new sessions
  assertEquals(manager.tick(100), []); // grace not elapsed
  const drained = manager.tick(150);
  assertEquals(drained.map((record) => record.reason), ["drained"]);
  assertEquals(survivor.disposals, 1);
  assertEquals(manager.inspect(), { sessions: 0, draining: true });
});
