// Copyright 2023 Im-Beast. MIT license.

// PLG-005: malformed or late replies fail only the calling contribution.

import { assert, assertEquals } from "./deps.ts";
import { ContributionRpcError, createContributionProxy, createContributionProxyRegistry } from "../mod.ts";

Deno.test("valid replies pass schema validation; malformed ones scope-fail", async () => {
  const registry = createContributionProxyRegistry();
  const goodProxy = createContributionProxy<{ q: string }, string[]>({
    contribution: { kind: "data-source", name: "search" },
    transport: (method, args) => Promise.resolve([`${method}:${(args as { q: string }).q}`]),
    validateReply: (reply) => Array.isArray(reply) ? undefined : "expected string[]",
  });
  const badProxy = createContributionProxy<null, string[]>({
    contribution: { kind: "widget", name: "clock" },
    transport: () => Promise.resolve({ evil: true }),
    validateReply: (reply) => Array.isArray(reply) ? undefined : "expected string[]",
  });
  registry.register(goodProxy);
  registry.register(badProxy);

  assertEquals(await goodProxy.invoke({ q: "x" }), ["data-source:search:x"]);

  let error: unknown;
  try {
    await badProxy.invoke(null);
  } catch (thrown) {
    error = thrown;
  }
  assert(error instanceof ContributionRpcError);
  assert(error.message.includes('widget "clock"') && error.message.includes("malformed"));

  // Only the failing contribution is degraded; the sibling still works.
  assertEquals(await goodProxy.invoke({ q: "again" }), ["data-source:search:again"]);
  const health = Object.fromEntries(registry.health().map((entry) => [entry.contribution.name, entry.failureCount]));
  assertEquals(health, { search: 0, clock: 1 });
});

Deno.test("cancellation rejects immediately and discards the late reply", async () => {
  let release!: (value: unknown) => void;
  const proxy = createContributionProxy<null, string>({
    contribution: { kind: "command", name: "slow" },
    transport: () => new Promise((resolve) => release = resolve),
    validateReply: (reply) => typeof reply === "string" ? undefined : "expected string",
  });
  const controller = new AbortController();
  const invocation = proxy.invoke(null, { signal: controller.signal });
  controller.abort();
  let error: unknown;
  try {
    await invocation;
  } catch (thrown) {
    error = thrown;
  }
  assert(error instanceof ContributionRpcError && error.message.includes("cancelled"));

  release("too late"); // the orphaned reply is recorded, never delivered
  await Promise.resolve();
  const reasons = proxy.failures().map((failure) => failure.reason);
  assertEquals(reasons, ["cancelled", "late reply discarded after cancellation"]);

  // An already-aborted signal never dispatches.
  const preAborted = new AbortController();
  preAborted.abort();
  let early: unknown;
  try {
    await proxy.invoke(null, { signal: preAborted.signal });
  } catch (thrown) {
    early = thrown;
  }
  assert(early instanceof ContributionRpcError && early.message.includes("before dispatch"));
});

Deno.test("transport faults reject with the contribution named", async () => {
  const proxy = createContributionProxy<null, string>({
    contribution: { kind: "theme", name: "night" },
    transport: () => Promise.reject(new Error("worker died")),
    validateReply: () => undefined,
  });
  let error: unknown;
  try {
    await proxy.invoke(null);
  } catch (thrown) {
    error = thrown;
  }
  assert(error instanceof ContributionRpcError);
  assert(error.message.includes('theme "night"') && error.message.includes("worker died"));
});
