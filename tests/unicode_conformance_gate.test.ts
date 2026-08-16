// Copyright 2023 Im-Beast. MIT license.

// QAL-003: an update requires an explicit expected-diff report by
// rule/data version — the gate compares live conformance counts against
// the checked-in baseline exactly.

import { assert, assertEquals } from "./deps.ts";
import {
  runBidiConformance,
  runEmojiConformance,
  runGraphemeConformance,
  runLineBreakConformance,
  runWidthConformance,
} from "../mod.ts";

const DATA_VERSION = "17.0.0";
const fixtures = new URL("./fixtures/unicode/", import.meta.url);

Deno.test("all five gates match the checked-in conformance baseline exactly", async () => {
  const baseline: Record<string, { dataVersion: string; total: number; passed: number }> = JSON.parse(
    await Deno.readTextFile(new URL("../budgets/unicode_conformance.json", import.meta.url)),
  );
  const gates = [
    runGraphemeConformance(
      await Deno.readTextFile(new URL(`GraphemeBreakTest-${DATA_VERSION}.txt`, fixtures)),
      DATA_VERSION,
    ),
    runLineBreakConformance(
      await Deno.readTextFile(new URL(`LineBreakTest-${DATA_VERSION}.txt`, fixtures)),
      DATA_VERSION,
    ),
    runBidiConformance(
      await Deno.readTextFile(new URL(`BidiCharacterTest-${DATA_VERSION}.txt`, fixtures)),
      DATA_VERSION,
    ),
    runWidthConformance(DATA_VERSION),
    runEmojiConformance(DATA_VERSION),
  ];
  for (const gate of gates) {
    const expected = baseline[gate.gate];
    assert(expected, `gate "${gate.gate}" has no baseline entry`);
    // Exact comparison: ANY drift — data version, totals, or pass counts —
    // demands the explicit regeneration report
    // (scripts/update_unicode_conformance_baseline.ts).
    assertEquals(
      { dataVersion: gate.dataVersion, total: gate.total, passed: gate.passed },
      expected,
      `${gate.gate}: live ${gate.passed}/${gate.total} @${gate.dataVersion} != baseline ` +
        `${expected.passed}/${expected.total} @${expected.dataVersion} — review and regenerate the baseline`,
    );
  }
  // The corpora gates carry full official coverage; regressions to less
  // than 100% would already fail the exact comparison above.
  assertEquals(baseline["grapheme"]!.passed, baseline["grapheme"]!.total);
  assertEquals(baseline["line-break"]!.passed, baseline["line-break"]!.total);
  assertEquals(baseline["bidi"]!.passed, baseline["bidi"]!.total);
});
