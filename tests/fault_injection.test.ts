// Copyright 2023 Im-Beast. MIT license.

// QAL-005: each injected failure proves cleanup and a classified
// user-visible outcome.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { FaultInjected, type FaultInjector, sweepFaults } from "../mod.testing.ts";

// A transactional workload with allocation, storage, transport, and a
// lifecycle hook — each releases what it took on the failure path.
function makeSubject(options: { leakOnTransportFault?: boolean } = {}) {
  const open: string[] = [];
  let lastError: unknown;
  return {
    open,
    execute(injector: FaultInjector) {
      lastError = undefined;
      try {
        injector.checkpoint("allocate");
        open.push("buffer");
        injector.checkpoint("storage-write");
        open.push("file");
        injector.checkpoint("transport-send");
        injector.checkpoint("transport-send"); // two sends per run
        injector.checkpoint("lifecycle:commit");
        open.length = 0; // committed: everything handed off
      } catch (error) {
        lastError = error;
        if (!(options.leakOnTransportFault && String(error).includes("transport"))) {
          open.length = 0; // rollback releases everything
        }
        throw error;
      }
    },
    classifyOutcome(error: unknown) {
      if (error === undefined) return "committed" as const;
      if (error instanceof FaultInjected) {
        return error.site === "lifecycle:commit" ? ("aborted-at-commit" as const) : ("aborted-clean" as const);
      }
      return "unexpected" as const;
    },
    cleanupHolds: () => open.length === 0,
    reset() {
      open.length = 0;
      lastError = undefined;
    },
  };
}

Deno.test("the sweep enumerates every site occurrence deterministically", () => {
  const report = sweepFaults(makeSubject());
  assertEquals(report.sites, {
    "allocate": 1,
    "storage-write": 1,
    "transport-send": 2,
    "lifecycle:commit": 1,
  });
  assertEquals(report.injections.length, 5); // one per occurrence
  assertEquals(
    report.injections.map((injection) => `${injection.site}#${injection.occurrence}`),
    ["allocate#1", "storage-write#1", "transport-send#1", "transport-send#2", "lifecycle:commit#1"],
  );
  // Deterministic: a second sweep is identical.
  assertEquals(sweepFaults(makeSubject()), report);
});

Deno.test("every injection proves cleanup and carries a classified outcome", () => {
  const report = sweepFaults(makeSubject());
  assert(report.allCleanupHeld);
  const outcomes = report.injections.map((injection) => injection.outcome);
  assertEquals(outcomes, [
    "aborted-clean",
    "aborted-clean",
    "aborted-clean",
    "aborted-clean",
    "aborted-at-commit",
  ]);
});

Deno.test("a leaking failure path is caught, not assumed away", () => {
  const report = sweepFaults(makeSubject({ leakOnTransportFault: true }));
  assert(!report.allCleanupHeld);
  const leaks = report.injections.filter((injection) => !injection.cleanupHeld);
  assertEquals(leaks.map((injection) => injection.site), ["transport-send", "transport-send"]);
  // The clean paths still hold.
  assert(report.injections.filter((injection) => injection.site === "allocate").every((i) => i.cleanupHeld));
});

Deno.test("a dirty probe run refuses the sweep outright", () => {
  assertThrows(
    () =>
      sweepFaults({
        execute: () => {},
        classifyOutcome: () => "x" as const,
        cleanupHolds: () => false, // dirty before any fault
        reset: () => {},
      }),
    Error,
    "probe run",
  );
});
