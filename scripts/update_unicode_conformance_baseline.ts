// Copyright 2023 Im-Beast. MIT license.

/**
 * QAL-003: regenerates the Unicode conformance baseline WITH a report.
 *
 *   deno run -A scripts/update_unicode_conformance_baseline.ts
 *
 * Prints the per-gate diff against the previous baseline — the explicit
 * expected-diff report an update must review — then writes the new one.
 */

import {
  runBidiConformance,
  runEmojiConformance,
  runGraphemeConformance,
  runLineBreakConformance,
  runWidthConformance,
} from "../src/unicode/mod.ts";

const DATA_VERSION = "17.0.0";
const fixtures = new URL("../tests/fixtures/unicode/", import.meta.url);
const gates = [
  runGraphemeConformance(
    await Deno.readTextFile(new URL(`GraphemeBreakTest-${DATA_VERSION}.txt`, fixtures)),
    DATA_VERSION,
  ),
  runLineBreakConformance(
    await Deno.readTextFile(new URL(`LineBreakTest-${DATA_VERSION}.txt`, fixtures)),
    DATA_VERSION,
  ),
  runBidiConformance(await Deno.readTextFile(new URL(`BidiCharacterTest-${DATA_VERSION}.txt`, fixtures)), DATA_VERSION),
  runWidthConformance(DATA_VERSION),
  runEmojiConformance(DATA_VERSION),
];

const baselinePath = new URL("../budgets/unicode_conformance.json", import.meta.url);
let previous: Record<string, { dataVersion: string; total: number; passed: number }> = {};
try {
  previous = JSON.parse(await Deno.readTextFile(baselinePath));
} catch {
  console.log("(no previous baseline)");
}
for (const gate of gates) {
  const before = previous[gate.gate];
  const status = before
    ? (before.passed === gate.passed && before.total === gate.total && before.dataVersion === gate.dataVersion
      ? "unchanged"
      : `CHANGED ${before.dataVersion} ${before.passed}/${before.total} -> ${gate.dataVersion} ${gate.passed}/${gate.total}`)
    : "new gate";
  console.log(`${gate.gate}: ${gate.passed}/${gate.total} (${gate.dataVersion}) — ${status}`);
}
await Deno.writeTextFile(
  baselinePath,
  JSON.stringify(
    Object.fromEntries(
      gates.map((gate) => [gate.gate, { dataVersion: gate.dataVersion, total: gate.total, passed: gate.passed }]),
    ),
    null,
    2,
  ) + "\n",
);
console.log("baseline written");
