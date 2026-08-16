// Copyright 2023 Im-Beast. MIT license.

// ASY-008: versioned worker protocol — incompatible workers rejected at
// attach, affinity and load-aware routing, verbatim transfer lists, and
// per-task deadlines.

import { assert, assertEquals, assertRejects } from "./deps.ts";
import { createVersionedWorkerRouter, type ProtocolWorkerLike } from "../mod.ts";

function fakeWorker() {
  const messages: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  const worker: ProtocolWorkerLike = {
    postMessage: (message, transfer) => messages.push({ message, transfer }),
    terminate: () => {},
  };
  return { worker, messages };
}

Deno.test("incompatible workers are rejected before any dispatch can reach them", () => {
  const router = createVersionedWorkerRouter({ protocolVersion: 3 });
  const stale = fakeWorker();
  const result = router.attach("old", stale.worker, { protocolVersion: 2 });
  assertEquals(result.accepted, false);
  assert(result.reason?.includes("protocol 2"));

  // With no compatible worker, dispatch refuses rather than misrouting.
  assertEquals(router.dispatch({ job: 1 }, { nowMs: 0 }), undefined);
  assertEquals(stale.messages.length, 0);
});

Deno.test("affinity is sticky and load-aware routing picks the least loaded", () => {
  const router = createVersionedWorkerRouter({ protocolVersion: 1 });
  const a = fakeWorker();
  const b = fakeWorker();
  router.attach("a", a.worker, { protocolVersion: 1 });
  router.attach("b", b.worker, { protocolVersion: 1 });

  const first = router.dispatch({ n: 1 }, { nowMs: 0, affinity: "session-42" })!;
  const second = router.dispatch({ n: 2 }, { nowMs: 0, affinity: "session-42" })!;
  assertEquals(second.workerId, first.workerId); // sticky

  // The sticky worker now carries 2 pending tasks: unaffiliated work routes
  // to the other worker.
  const third = router.dispatch({ n: 3 }, { nowMs: 0 })!;
  assert(third.workerId !== first.workerId);
  assertEquals(router.inspect().affinities["session-42"], first.workerId);

  // Responses settle and free load.
  router.handleResponse(first.taskId, { ok: true, result: "done" });
  return first.settled.then((value) => assertEquals(value, "done"));
});

Deno.test("transfer lists pass through verbatim - buffers move, not copy", () => {
  const router = createVersionedWorkerRouter({ protocolVersion: 1 });
  const target = fakeWorker();
  router.attach("gpu", target.worker, { protocolVersion: 1 });

  const buffer = new ArrayBuffer(1024);
  const transfer: Transferable[] = [buffer];
  router.dispatch({ pixels: buffer }, { nowMs: 0, transfer });
  assert(target.messages[0]!.transfer === transfer, "the caller's transfer array must arrive untouched");
  assert((target.messages[0]!.message as { payload: { pixels: ArrayBuffer } }).payload.pixels === buffer);
});

Deno.test("deadlines expire pending tasks on the caller's clock", async () => {
  const router = createVersionedWorkerRouter({ protocolVersion: 1 });
  const slow = fakeWorker();
  router.attach("slow", slow.worker, { protocolVersion: 1 });

  const task = router.dispatch({ n: 1 }, { nowMs: 0, deadlineMs: 500 })!;
  assertEquals(router.expire(400), 0);
  assertEquals(router.expire(500), 1);
  await assertRejects(() => task.settled, Error, "missed its deadline");
  // A late response after expiry is harmless.
  assertEquals(router.handleResponse(task.taskId, { ok: true, result: "late" }), false);
  assertEquals(router.inspect().pendingTasks, 0);
});
