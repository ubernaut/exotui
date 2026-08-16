// Copyright 2023 Im-Beast. MIT license.

// DAT-005: typed mutations — optimistic overlay, in-order server
// reconciliation for overlapping mutations, and per-mutation rollback.

import { assert, assertEquals } from "./deps.ts";
import { createMutationResource } from "../mod.ts";

interface Todo {
  readonly items: readonly string[];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

Deno.test("optimistic patches show immediately and reconcile on success", async () => {
  const resource = createMutationResource<Todo>({ items: ["a"] });
  const server = deferred<Todo>();
  const { settled } = resource.mutate({
    optimistic: (value) => ({ items: [...value.items, "b"] }),
    commit: () => server.promise,
  });
  assertEquals(resource.value.items, ["a", "b"]); // optimistic
  assertEquals(resource.confirmed.items, ["a"]); // server untouched

  server.resolve({ items: ["a", "b*"] }); // the server's authoritative shape
  assertEquals((await settled).status, "confirmed");
  assertEquals(resource.confirmed.items, ["a", "b*"]);
  assertEquals(resource.value.items, ["a", "b*"]);
});

Deno.test("overlapping mutations reconcile in submission order", async () => {
  const resource = createMutationResource<Todo>({ items: [] });
  const slow = deferred<(confirmed: Todo) => Todo>();
  const fast = deferred<(confirmed: Todo) => Todo>();
  const first = resource.mutate({
    optimistic: (value) => ({ items: [...value.items, "first"] }),
    commit: () => slow.promise,
  });
  const second = resource.mutate({
    optimistic: (value) => ({ items: [...value.items, "second"] }),
    commit: () => fast.promise,
  });
  assertEquals(resource.value.items, ["first", "second"]);

  // The second settles first — it must hold behind the first.
  fast.resolve((confirmed) => ({ items: [...confirmed.items, "second!"] }));
  await Promise.resolve();
  assertEquals(resource.confirmed.items, []);
  assertEquals(resource.inspect().held, [second.id]);

  slow.resolve((confirmed) => ({ items: [...confirmed.items, "first!"] }));
  await Promise.all([first.settled, second.settled]);
  assertEquals(resource.confirmed.items, ["first!", "second!"]); // submission order held
});

Deno.test("a failed mutation reverts only its own patch", async () => {
  const resource = createMutationResource<Todo>({ items: [] });
  const ok = deferred<(confirmed: Todo) => Todo>();
  const bad = deferred<(confirmed: Todo) => Todo>();
  const keep = resource.mutate({
    optimistic: (value) => ({ items: [...value.items, "keep"] }),
    commit: () => ok.promise,
  });
  const drop = resource.mutate({
    optimistic: (value) => ({ items: [...value.items, "drop"] }),
    commit: () => bad.promise,
  });
  assertEquals(resource.value.items, ["keep", "drop"]);

  bad.reject(new Error("server said no"));
  const dropped = await drop.settled;
  assertEquals(dropped.status, "rolled-back");
  assertEquals(resource.value.items, ["keep"]); // only its own patch reverted

  ok.resolve((confirmed) => ({ items: [...confirmed.items, "keep!"] }));
  assertEquals((await keep.settled).status, "confirmed");
  assertEquals(resource.value.items, ["keep!"]);
});

Deno.test("cancel aborts the commit and rolls back like a failure", async () => {
  const resource = createMutationResource<number>(10);
  let sawAbort = false;
  const { id, settled } = resource.mutate({
    optimistic: (value) => value + 5,
    commit: (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          sawAbort = true;
          reject(new Error("aborted"));
        });
      }),
  });
  assertEquals(resource.value, 15);
  assert(resource.cancel(id));
  assertEquals((await settled).status, "rolled-back");
  assert(sawAbort);
  assertEquals(resource.value, 10);
  assertEquals(resource.cancel(id), false); // already gone
});
