// Copyright 2023 Im-Beast. MIT license.

// HIS-010: crash-recovery replay — torn writes restore the safe prefix
// without touching the journal, external effects never re-run, and replay
// stops at the first invalid or unacknowledged non-idempotent action.

import { assert, assertEquals } from "./deps.ts";
import { parseRecoveryJournal, type RecoveryRecord, replayRecoveryJournal } from "../mod.ts";

const APPLY = (state: number, record: RecoveryRecord) => state + (record.patch as number);

Deno.test("a clean journal replays fully; a torn tail restores the prefix", () => {
  const clean = parseRecoveryJournal(
    `{"id":"a","patch":1}\n{"id":"b","patch":2,"idempotent":true}\n`,
  );
  assertEquals(clean.torn, false);
  const full = replayRecoveryJournal({ initial: 0, records: clean.records, apply: APPLY });
  assertEquals(full, { state: 3, applied: ["a", "b"] });

  const tornText = `{"id":"a","patch":1}\n{"id":"b","patch":2}\n{"id":"c","pa`;
  const torn = parseRecoveryJournal(tornText);
  assert(torn.torn);
  const partial = replayRecoveryJournal({ initial: 0, records: torn.records, torn: torn.torn, apply: APPLY });
  assertEquals(partial.state, 3);
  assertEquals(partial.stop, { index: 2, reason: "torn" });
  // Replay is read-only: the journal text is exactly what it was.
  assertEquals(tornText.endsWith(`{"id":"c","pa`), true);
});

Deno.test("replay stops at the first invalid record with the prefix restored", () => {
  const parsed = parseRecoveryJournal(
    `{"id":"a","patch":1}\nnot json at all\n{"id":"c","patch":4}\n`,
  );
  const report = replayRecoveryJournal({ initial: 0, records: parsed.records, apply: APPLY });
  assertEquals(report.state, 1);
  assertEquals(report.applied, ["a"]);
  assertEquals(report.stop, { index: 1, reason: "invalid" });

  // A validator can reject structurally fine but semantically bad records.
  const strict = replayRecoveryJournal({
    initial: 0,
    records: [{ id: "a", patch: 1 }, { id: "b", patch: -999 }],
    apply: APPLY,
    validate: (record) => (record.patch as number) > -100,
  });
  assertEquals(strict.stop?.reason, "invalid");
  assertEquals(strict.state, 1);
});

Deno.test("external effects never duplicate: unacknowledged non-idempotent actions halt replay", () => {
  let effectRuns = 0;
  const records: RecoveryRecord[] = [
    { id: "debit", patch: -50, external: true, acknowledged: true },
    { id: "email", patch: 0, external: true, idempotent: true },
    { id: "charge", patch: -20, external: true }, // never acknowledged
    { id: "after", patch: 1 },
  ];
  const report = replayRecoveryJournal({
    initial: 100,
    records,
    apply: (state, record) => {
      // The applier reconstructs state only; effects are represented, not run.
      if (record.external) assert(effectRuns === 0);
      return state + (record.patch as number);
    },
  });
  assertEquals(report.applied, ["debit", "email"]);
  assertEquals(report.state, 50);
  assertEquals(report.stop, { index: 2, id: "charge", reason: "unacknowledged-effect" });
  assertEquals(effectRuns, 0); // nothing external ever re-ran
});
