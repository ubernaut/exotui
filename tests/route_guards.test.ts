// Copyright 2023 Im-Beast. MIT license.

// NAV-004: ordered guards allow/cancel/redirect with loop detection, and a
// newer navigation aborts obsolete guard runs.

import { assert, assertEquals } from "./deps.ts";
import { createRouteGuardPipeline } from "../mod.ts";

Deno.test("guards run in order; cancel short-circuits; redirects re-run the order", async () => {
  const pipeline = createRouteGuardPipeline();
  const seen: string[] = [];
  pipeline.register(({ to }) => {
    seen.push(`auth:${to}`);
    return to === "/admin" ? { kind: "redirect", to: "/login" } : { kind: "allow" };
  }, { name: "auth" });
  pipeline.register(({ to }) => {
    seen.push(`log:${to}`);
    return { kind: "allow" };
  }, { name: "log" });

  const allowed = await pipeline.run("/home");
  assertEquals(allowed, { kind: "allowed", to: "/home", chain: ["/home"] });
  assertEquals(seen, ["auth:/home", "log:/home"]);

  seen.length = 0;
  const redirected = await pipeline.run("/admin");
  assertEquals(redirected, { kind: "allowed", to: "/login", chain: ["/admin", "/login"] });
  // The redirect re-ran the FULL order against /login.
  assertEquals(seen, ["auth:/admin", "auth:/login", "log:/login"]);

  pipeline.register(() => ({ kind: "cancel", reason: "maintenance" }), { name: "gate" });
  const cancelled = await pipeline.run("/home");
  assertEquals([cancelled.kind, cancelled.reason], ["cancelled", "maintenance"]);
});

Deno.test("a redirect cycle yields one structured redirect-loop outcome", async () => {
  const pipeline = createRouteGuardPipeline();
  pipeline.register(({ to }) => {
    if (to === "/a") return { kind: "redirect", to: "/b" };
    if (to === "/b") return { kind: "redirect", to: "/a" };
    return { kind: "allow" };
  }, { name: "bouncer" });

  const outcome = await pipeline.run("/a");
  assertEquals(outcome.kind, "redirect-loop");
  assertEquals(outcome.chain, ["/a", "/b", "/a"]);
  assert(outcome.reason?.includes("bouncer"));
});

Deno.test("a concurrent navigation aborts the obsolete run", async () => {
  const pipeline = createRouteGuardPipeline();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => release = resolve);
  const aborts: string[] = [];
  pipeline.register(async ({ to, signal }) => {
    if (to === "/slow") {
      signal.addEventListener("abort", () => aborts.push(to));
      await gate;
    }
    return { kind: "allow" };
  });

  const first = pipeline.run("/slow");
  const second = await pipeline.run("/fast"); // supersedes the first
  release();
  const firstOutcome = await first;
  assertEquals(firstOutcome.kind, "aborted");
  assertEquals(aborts, ["/slow"]);
  assertEquals(second, { kind: "allowed", to: "/fast", chain: ["/fast"] });

  // A guard that throws (not via abort) cancels with its error in the reason.
  pipeline.register(() => {
    throw new Error("guard exploded");
  }, { name: "boom" });
  const failed = await pipeline.run("/home");
  assertEquals(failed.kind, "cancelled");
  assert(failed.reason?.includes("boom") && failed.reason.includes("guard exploded"));
});
