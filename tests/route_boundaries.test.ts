// Copyright 2023 Im-Beast. MIT license.

// NAV-006: error/not-found boundaries contain failures to their subtree,
// retry through recovery loaders, and escalate to the parent past the
// retry budget - siblings never notice.

import { assert, assertEquals } from "./deps.ts";
import { createRouteBoundaryRegistry } from "../mod.ts";

function fixture(recover?: (signal: AbortSignal) => Promise<void>) {
  const registry = createRouteBoundaryRegistry();
  registry.register("root", undefined);
  registry.register("users", "root");
  registry.register("detail", "users", { recover, maxRetries: 2 });
  registry.register("sidebar", "root"); // the sibling outlet
  return registry;
}

Deno.test("failures land in the nearest boundary; siblings stay ok", () => {
  const registry = fixture();
  assertEquals(registry.reportError("detail", new Error("fetch failed")), "detail");
  assertEquals(registry.state("detail").status, "error");
  assertEquals(registry.state("sidebar").status, "ok"); // untouched
  assertEquals(registry.state("users").status, "ok"); // containment
  assertEquals(registry.state("root").status, "ok"); // the layout survives

  assertEquals(registry.reportNotFound("sidebar"), "sidebar");
  assertEquals(registry.state("sidebar").status, "not-found");
});

Deno.test("retry restores a boundary through its recovery loader", async () => {
  let attempts = 0;
  const registry = fixture(() => {
    attempts += 1;
    return attempts >= 2 ? Promise.resolve() : Promise.reject(new Error("still down"));
  });
  registry.reportError("detail", new Error("initial"));

  const failed = await registry.retry("detail");
  assertEquals([failed.status, failed.retries], ["error", 1]);
  const recovered = await registry.retry("detail");
  assertEquals(recovered, { status: "ok", retries: 0 });
  assertEquals(attempts, 2);
});

Deno.test("exhausted retries escalate to the parent; the child resets", async () => {
  const registry = fixture(() => Promise.reject(new Error("permanently down")));
  registry.reportError("detail", new Error("initial"));

  await registry.retry("detail"); // retry 1: stays on the child
  const escalated = await registry.retry("detail"); // retry 2: budget reached
  assertEquals(escalated.status, "error"); // now the PARENT's state
  assertEquals(registry.state("users").status, "error");
  assertEquals(registry.state("detail").status, "ok"); // child reset under the fallback
  assertEquals(registry.state("sidebar").status, "ok"); // sibling still untouched
  assert(String((registry.state("users").error as Error).message).includes("permanently down"));
});
