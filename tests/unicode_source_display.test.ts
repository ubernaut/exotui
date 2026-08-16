// Copyright 2023 Im-Beast. MIT license.

// TXT-009: UTS #55 source display — distinct token streams cannot render
// as an indistinguishable line without a warning; atoms isolate, controls
// become visible, confusables and disguised breaks are diagnosed.

import { assert, assertEquals } from "./deps.ts";
import { analyzeSourceLine, renderSourceLineSafely, tokenizeSourceLine } from "../mod.ts";

// The classic trojan-source early-return: RLO + isolates disguise a
// comment as live code.
const TROJAN = `if (accessLevel != "user‮ ⁦// Check if admin⁩ ⁦") {`;
const HONEST = `if (accessLevel != "user") { // Check if admin`;

Deno.test("trojan-source lines carry warnings; honest lines are clean", () => {
  const findings = analyzeSourceLine(TROJAN);
  assert(findings.some((finding) => finding.kind === "bidi-control"));
  assertEquals(findings.filter((finding) => finding.kind === "bidi-control").length, 4); // RLO + 2 LRI + PDI
  assertEquals(analyzeSourceLine(HONEST), []);
});

Deno.test("distinct token streams stay distinguishable in the safe rendering", () => {
  const trojanSafe = renderSourceLineSafely(TROJAN);
  const honestSafe = renderSourceLineSafely(HONEST);
  // The bidi controls surface as visible markers instead of reordering.
  assert(trojanSafe.includes("⟦U+202E⟧") && trojanSafe.includes("⟦U+2066⟧"));
  assert(!honestSafe.includes("⟦U+"));
  assert(trojanSafe !== honestSafe);
});

Deno.test("confusables in mixed-script context and disguised breaks are diagnosed", () => {
  // "sсope" with a Cyrillic с — visually identical to "scope".
  const confusable = analyzeSourceLine("const sсope = 1;");
  assert(confusable.some((finding) => finding.kind === "confusable"));
  // Purely non-Latin identifiers are NOT flagged: no mixed-script context.
  assertEquals(analyzeSourceLine("слово"), []);

  const disguised = analyzeSourceLine("const a = 1; return b;");
  assert(disguised.some((finding) => finding.kind === "disguised-line-break"));
  const invisible = analyzeSourceLine("pass​word");
  assert(invisible.some((finding) => finding.kind === "invisible"));
});

Deno.test("tokenization yields lexical atoms and the safe form isolates them", () => {
  const atoms = tokenizeSourceLine(`if (x == "he llo") // done`);
  assertEquals(atoms.filter((atom) => atom.kind === "identifier").map((atom) => atom.text), ["if", "x"]);
  assertEquals(atoms.find((atom) => atom.kind === "string")?.text, `"he llo"`);
  assertEquals(atoms.find((atom) => atom.kind === "comment")?.text, "// done");

  const safe = renderSourceLineSafely(`ab cd`);
  // Two isolated atoms with the space between them un-isolated.
  assertEquals(safe, "⁨ab⁩ ⁨cd⁩");
});
