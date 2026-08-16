// Copyright 2023 Im-Beast. MIT license.

// NAV-005: route-owned loaders and resources — leaving a route cancels its
// work, disposes what it owned, and late results can never update the new
// route.

import { assert, assertEquals } from "./deps.ts";
import { createRouteLoaderScope } from "../mod.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => resolve = res);
  return { promise, resolve };
}

Deno.test("loaders land on the current route and accumulate data", async () => {
  const scope = createRouteLoaderScope();
  scope.enter("/inbox");
  const result = await scope.load("messages", () => Promise.resolve(["a", "b"]));
  assertEquals(result, { status: "loaded", value: ["a", "b"] });
  assertEquals(scope.data("messages"), ["a", "b"]);
  await scope.load("labels", () => Promise.resolve(["work"]));
  assertEquals(scope.inspect(), { route: "/inbox", pending: 0, loaded: ["messages", "labels"] });
});

Deno.test("leaving a route aborts pending work; late results are stale", async () => {
  const scope = createRouteLoaderScope();
  scope.enter("/inbox");
  const server = deferred<string>();
  let sawAbort = false;
  const pending = scope.load("slow", (signal) => {
    signal.addEventListener("abort", () => sawAbort = true);
    return server.promise;
  });

  scope.enter("/settings"); // navigation: the old generation tears down
  assert(sawAbort, "leaving must abort in-flight loaders");
  await scope.load("prefs", () => Promise.resolve({ theme: "dark" }));

  server.resolve("too late");
  const result = await pending;
  assertEquals(result.status, "stale");
  // The late result never polluted the new route.
  assertEquals(scope.data("slow"), undefined);
  assertEquals(scope.inspect().loaded, ["prefs"]);
});

Deno.test("owned resources dispose on leave, in reverse order; failures do not block", () => {
  const scope = createRouteLoaderScope();
  const log: string[] = [];
  scope.enter("/editor");
  scope.own(() => log.push("first"));
  scope.own(() => {
    log.push("boom");
    throw new Error("dispose failed");
  });
  scope.own(() => log.push("last"));
  scope.leave();
  assertEquals(log, ["last", "boom", "first"]);
  assertEquals(scope.route, undefined);

  // Failed loads on a live route report failed, not stale.
  scope.enter("/x");
  return scope.load("bad", () => Promise.reject(new Error("nope"))).then((result) => {
    assertEquals(result.status, "failed");
  });
});
