// Copyright 2023 Im-Beast. MIT license.

// ASY-002: supervisor strategies with bounded restart intensity — repeated
// failure trips the limit and the causal error chain stays inspectable.

import { assert, assertEquals } from "./deps.ts";
import { createSupervisor, type SupervisorStrategy } from "../mod.ts";

function child(log: string[], id: string, strategy: SupervisorStrategy) {
  return {
    id,
    strategy,
    start: () => log.push(`start:${id}`),
    stop: () => log.push(`stop:${id}`),
  };
}

Deno.test("stop, resume, and restart-one apply per child", () => {
  const log: string[] = [];
  const supervisor = createSupervisor({ maxRestarts: 5, windowMs: 1000 });
  supervisor.supervise(child(log, "a", "stop"));
  supervisor.supervise(child(log, "b", "resume"));
  supervisor.supervise(child(log, "c", "restart-one"));
  log.length = 0;

  assertEquals(supervisor.reportFailure("a", new Error("a1"), 0).action, "stopped");
  assertEquals(supervisor.childState("a"), "stopped");
  assertEquals(supervisor.reportFailure("b", new Error("b1"), 10).action, "resumed");
  assertEquals(supervisor.childState("b"), "running");
  assertEquals(supervisor.reportFailure("c", new Error("c1"), 20).action, "restarted-one");
  assertEquals(log, ["stop:a", "stop:c", "start:c"]);
});

Deno.test("restart-all restarts every running child together", () => {
  const log: string[] = [];
  const supervisor = createSupervisor();
  supervisor.supervise(child(log, "x", "restart-all"));
  supervisor.supervise(child(log, "y", "restart-one"));
  log.length = 0;
  assertEquals(supervisor.reportFailure("x", new Error("boom"), 0).action, "restarted-all");
  assertEquals(log, ["stop:x", "start:x", "stop:y", "start:y"]);
});

Deno.test("restart intensity trips the supervisor and preserves the causal chain", () => {
  const log: string[] = [];
  const supervisor = createSupervisor({ maxRestarts: 2, windowMs: 1000 });
  supervisor.supervise(child(log, "w", "restart-one"));

  assertEquals(supervisor.reportFailure("w", new Error("first"), 0).action, "restarted-one");
  assertEquals(supervisor.reportFailure("w", new Error("second"), 100).action, "restarted-one");
  const tripped = supervisor.reportFailure("w", new Error("third"), 200);
  assertEquals(tripped.action, "tripped");
  assert(supervisor.tripped);
  assertEquals(supervisor.childState("w"), "stopped");
  assertEquals(
    supervisor.failures().map((failure) => `${(failure.error as Error).message}:${failure.action}`),
    ["first:restarted-one", "second:restarted-one", "third:tripped"],
  );

  // Outside the window the same rate would have been fine.
  const relaxed = createSupervisor({ maxRestarts: 2, windowMs: 100 });
  const quiet: string[] = [];
  relaxed.supervise(child(quiet, "w", "restart-one"));
  relaxed.reportFailure("w", new Error("1"), 0);
  relaxed.reportFailure("w", new Error("2"), 500);
  assertEquals(relaxed.reportFailure("w", new Error("3"), 1000).action, "restarted-one");
  assert(!relaxed.tripped);
});
