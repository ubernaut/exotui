// Copyright 2023 Im-Beast. MIT license.

// QAL-009: CI distinguishes framework regressions from documented
// emulator differences.

import { assert, assertEquals } from "./deps.ts";
import { runDifferential, runOperationCore, runReferenceCore } from "../mod.testing.ts";

const FIXTURES = [
  { id: "plain-print", input: "hello world" },
  { id: "cursor-position", input: "\x1b[2;3Habc\x1b[1;1HX" },
  { id: "movement-mix", input: "line1\r\nline2\x1b[Aup\x1b[3Dxx" },
  { id: "erase-line", input: "wipe-tail\x1b[1;5H\x1b[K" },
  { id: "clear-screen", input: "junk\x1b[2Jclean" },
  { id: "wrap", input: "abcdefghijklmnopqrstuvwx" },
];

Deno.test("the two independent cores agree on the protocol fixtures", () => {
  const report = runDifferential(FIXTURES, []);
  assertEquals(report.fixtures, 6);
  assertEquals(report.regressions, []);
  assertEquals(report.agreements, 6);
  // Spot-check one core's actual output for correctness, not just agreement.
  assertEquals(runOperationCore("\x1b[2;3Habc", 20, 6)[1], "  abc");
});

Deno.test("an undocumented divergence is a regression; a documented one is not", () => {
  // A deliberately divergent fixture: our operation core treats VT (0x0b)
  // as line-feed; the naive reference core ignores it.
  const divergent = { id: "vertical-tab", input: "a\x0bb" };
  assert(
    JSON.stringify(runOperationCore(divergent.input, 20, 6)) !==
      JSON.stringify(runReferenceCore(divergent.input, 20, 6)),
  );

  const undocumented = runDifferential([...FIXTURES, divergent], []);
  assertEquals(undocumented.regressions.length, 1);
  assertEquals(undocumented.regressions[0]!.fixtureId, "vertical-tab");
  // The divergence is preserved in normalized form for review.
  assert(undocumented.divergences[0]!.ours.length > 0);
  assert(undocumented.divergences[0]!.reference.length > 0);

  const documented = runDifferential([...FIXTURES, divergent], [
    { fixtureId: "vertical-tab", explanation: "reference core ignores VT; ours maps it to LF per ECMA-48" },
  ]);
  assertEquals(documented.regressions, []); // distinguished, not silenced
  assertEquals(documented.divergences.length, 1); // still visible
});

Deno.test("stale ledger entries are reported when cores re-converge", () => {
  const report = runDifferential(FIXTURES, [
    { fixtureId: "plain-print", explanation: "outdated: this used to diverge" },
  ]);
  assertEquals(report.staleDocumentation, ["plain-print"]);
  assertEquals(report.regressions, []);
});
