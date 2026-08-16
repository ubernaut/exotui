// Copyright 2023 Im-Beast. MIT license.

// AUT-008: background jobs — attached jobs die with their owner, detached
// ones survive, pause/resume works when declared, retries re-run, and
// completion notifies exactly once.

import { assert, assertEquals } from "./deps.ts";
import { createBackgroundJobManager } from "../mod.ts";

function deferredJob() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

Deno.test("owner disposal cancels attached jobs; detached jobs survive", async () => {
  const manager = createBackgroundJobManager();
  const attached = deferredJob();
  const detached = deferredJob();
  const a = manager.start(({ signal }) => {
    signal.addEventListener("abort", () => attached.reject(new Error("aborted")));
    return attached.promise;
  }, { owner: "/route/editor", id: "attached" });
  const b = manager.start(() => detached.promise, { owner: "/route/editor", id: "detached" });

  b.detach();
  assertEquals(manager.disposeOwner("/route/editor"), 1); // only the attached one
  assertEquals(a.state, "cancelled");
  assertEquals(b.state, "running");

  detached.resolve("done");
  await Promise.resolve();
  assertEquals(b.state, "succeeded");
  // Everything stays inspectable, detached included.
  assertEquals(manager.inspect().map((job) => `${job.id}:${job.state}`).sort(), [
    "attached:cancelled",
    "detached:succeeded",
  ]);
});

Deno.test("pause works only when declared; completion notifies exactly once", async () => {
  const manager = createBackgroundJobManager();
  const pauses: boolean[] = [];
  const body = deferredJob();
  const job = manager.start(({ onPause }) => {
    onPause?.((paused) => pauses.push(paused));
    return body.promise;
  });
  await Promise.resolve(); // the body declared pause support
  assert(job.pausable);
  assert(job.pause());
  assertEquals(job.state, "paused");
  assert(job.resume());
  assertEquals(pauses, [true, false]);

  const outcomes: string[] = [];
  job.onComplete((outcome) => outcomes.push(outcome.state));
  job.onComplete((outcome) => outcomes.push(`again:${outcome.state}`));
  body.resolve("finished");
  await Promise.resolve();
  assertEquals(outcomes, ["succeeded", "again:succeeded"]);
  // A late listener gets the settled state immediately, but only once.
  job.onComplete((outcome) => outcomes.push(`late:${outcome.state}`));
  assertEquals(outcomes.length, 3);

  const unpausable = manager.start(() => deferredJob().promise);
  assertEquals(unpausable.pause(), false);
});

Deno.test("failed jobs retry through their factory", async () => {
  const manager = createBackgroundJobManager();
  let attempts = 0;
  const job = manager.start(() => {
    attempts += 1;
    return attempts === 1 ? Promise.reject(new Error("first try failed")) : Promise.resolve("second try");
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(job.state, "failed");
  assert(job.retry());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(job.state, "succeeded");
  assertEquals(attempts, 2);
  assertEquals(job.retry(), false); // succeeded jobs do not retry
});
