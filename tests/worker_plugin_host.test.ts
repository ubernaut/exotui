// Copyright 2023 Im-Beast. MIT license.

// SEC-004: plugin code cannot receive host object references or
// permissions outside its worker configuration.

import { assert, assertEquals } from "./deps.ts";
import { createWorkerPluginInstance } from "../mod.ts";

function stubWorker() {
  let terminated = 0;
  return {
    postMessage: () => {},
    terminate: () => void (terminated += 1),
    get terminatedCount() {
      return terminated;
    },
  };
}

Deno.test("results cross as detached clones — host references cannot escape", async () => {
  const hostSecret = { token: "s3cret", leak: () => "boom" };
  const instance = createWorkerPluginInstance(stubWorker(), [
    {
      name: "getConfig",
      handler: () => ({ theme: "dark", nested: { size: 4 } }),
    },
    {
      name: "getSecret",
      handler: () => hostSecret, // a careless handler returns a live object
    },
  ]);
  const config = await instance.call("getConfig", null, 0);
  assert(config.ok);
  assertEquals(config.result, { theme: "dark", nested: { size: 4 } });

  const secret = await instance.call("getSecret", null, 0);
  assert(secret.ok);
  // The function property could not cross; the clone is detached data.
  assertEquals(secret.result, { token: "s3cret" });
  assert(secret.result !== hostSecret);

  // Methods outside the configured surface do not exist for the plugin.
  const outside = await instance.call("readFile", { path: "/etc/passwd" }, 0);
  assert(!outside.ok && outside.error.includes("not on this instance's surface"));
  assertEquals(instance.surface(), ["getConfig", "getSecret"]);
});

Deno.test("schemas validate both directions and limits bound traffic", async () => {
  const instance = createWorkerPluginInstance(stubWorker(), [
    {
      name: "add",
      validateArgs: (args) =>
        Array.isArray(args) && args.every((n) => typeof n === "number") ? undefined : "expected number[]",
      validateResult: (result) => typeof result === "number" ? undefined : "expected number",
      handler: (args) => (args as number[]).reduce((a, b) => a + b, 0),
    },
  ], { maxMessageBytes: 64, maxCalls: 3 });

  const sum = await instance.call("add", [1, 2, 3], 0);
  assert(sum.ok && sum.result === 6);

  const badArgs = await instance.call("add", { evil: true }, 0);
  assert(!badArgs.ok && badArgs.error.includes("expected number[]"));

  const tooBig = await instance.call("add", Array.from({ length: 60 }, () => 9), 0);
  assert(!tooBig.ok && tooBig.error.includes("exceeds 64 bytes"));

  const overLimit = await instance.call("add", [1], 0); // 4th call
  assert(!overLimit.ok && overLimit.error.includes("call limit"));
});

Deno.test("prototype-polluting payloads are rejected at the boundary", async () => {
  const instance = createWorkerPluginInstance(stubWorker(), [
    { name: "echo", handler: (args) => args },
  ]);
  const polluted = await instance.call("echo", JSON.parse('{"__proto__": {"x": 1}}'), 0);
  assert(!polluted.ok && polluted.error.includes("prototype-polluting"));
});

Deno.test("deadlines expire on the caller clock and terminate severs everything", async () => {
  const worker = stubWorker();
  let release!: (value: string) => void;
  const instance = createWorkerPluginInstance(worker, [
    { name: "slow", handler: () => new Promise<string>((resolve) => release = resolve) },
    { name: "fast", handler: () => "quick" },
  ], { callDeadlineMs: 100 });

  const slow = instance.call("slow", null, 1000);
  await Promise.resolve();
  assertEquals(instance.expire(1050), 0); // not yet due
  assertEquals(instance.expire(1100), 1); // due now
  const timedOut = await slow;
  assert(!timedOut.ok && timedOut.error.includes("deadline"));
  release("late"); // the late completion is discarded, not delivered

  const inflight = instance.call("slow", null, 2000);
  await Promise.resolve();
  instance.terminate();
  const severed = await inflight;
  assert(!severed.ok && severed.error.includes("terminated"));
  assertEquals(worker.terminatedCount, 1);
  const after = await instance.call("fast", null, 3000);
  assert(!after.ok && after.error.includes("terminated"));
  instance.terminate(); // idempotent
  assertEquals(worker.terminatedCount, 1);
});
