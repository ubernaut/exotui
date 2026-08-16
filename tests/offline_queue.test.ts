// Copyright 2023 Im-Beast. MIT license.

// DAT-009: offline mutations — deterministic dependency-ordered replay,
// harmless duplicate acknowledgements, review surface, and payloads kept
// off disk unless opted in.

import { assert, assertEquals } from "./deps.ts";
import { createOfflineMutationQueue } from "../mod.ts";

Deno.test("replay follows dependency order deterministically; cycles are skipped", async () => {
  const queue = createOfflineMutationQueue();
  queue.enqueue({ key: "update", dependsOn: ["create"], payload: { field: "x" } });
  queue.enqueue({ key: "create", payload: { name: "row" } });
  queue.enqueue({ key: "tag", dependsOn: ["update"], payload: {} });
  queue.enqueue({ key: "cyclic-a", dependsOn: ["cyclic-b"], payload: {} });
  queue.enqueue({ key: "cyclic-b", dependsOn: ["cyclic-a"], payload: {} });

  const sent: string[] = [];
  const results = await queue.replay((mutation) => {
    sent.push(mutation.key);
    return Promise.resolve();
  });
  assertEquals(sent, ["create", "update", "tag"]); // dependencies first
  assertEquals(
    results.filter((result) => result.status === "skipped-dependency").map((result) => result.key).sort(),
    ["cyclic-a", "cyclic-b"],
  );
});

Deno.test("duplicate acknowledgements are harmless and re-enqueues are idempotent", async () => {
  const queue = createOfflineMutationQueue();
  assert(queue.enqueue({ key: "save", payload: 1 }));
  assertEquals(queue.enqueue({ key: "save", payload: 2 }), false); // same key: no-op
  assert(queue.acknowledge("save"));
  assertEquals(queue.acknowledge("save"), false); // duplicate ack: no-op
  assertEquals(queue.enqueue({ key: "save", payload: 3 }), false); // acked keys stay done
  const results = await queue.replay(() => Promise.resolve());
  assertEquals(results, []);
  assertEquals(queue.inspect(), { pending: 0, acknowledged: 1 });
});

Deno.test("sensitive payloads stay off disk by default; review lists pending work", () => {
  const queue = createOfflineMutationQueue();
  queue.enqueue({ key: "card", payload: { pan: "4111111111111111" }, summary: "save card" });
  queue.enqueue({ key: "note", payload: { text: "hello" }, persistPayload: true, summary: "save note" });

  const text = queue.serialize();
  assert(!text.includes("4111111111111111"), "sensitive payloads must not persist by default");
  assert(text.includes('"hello"'), "opted-in payloads do persist");

  assertEquals(queue.review().map((entry) => entry.summary), ["save card", "save note"]);
  assert(queue.discard("card"));
  assertEquals(queue.review().length, 1);

  // A restored queue keeps stubs and acknowledged keys.
  const restored = createOfflineMutationQueue();
  const report = restored.restore(text);
  assertEquals(report.restored, 2);
  assertEquals(restored.inspect().pending, 2);
});
