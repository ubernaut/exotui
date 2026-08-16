// Copyright 2023 Im-Beast. MIT license.

// PKG-002: generated code passes API policy and never overwrites an
// edited file without a diff/confirmation.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { applyPlan, generateArtifact, planGeneration, validateArtifactName } from "../mod.ts";

Deno.test("artifacts generate policy-compliant names with intentional exports", () => {
  const widget = generateArtifact("widget", "fancy-list");
  assertEquals(Object.keys(widget.files).sort(), ["src/app/fancy_list.ts", "tests/fancy_list.test.ts"]);
  assert(widget.files["src/app/fancy_list.ts"]!.includes("export function createFancyList(): FancyList"));
  // The export update is an explicit instruction, never a silent append.
  assertEquals(widget.exportInstruction, {
    file: "src/app/mod.ts",
    line: 'export * from "./fancy_list.ts";',
  });

  assertEquals(validateArtifactName("BadName"), 'name "BadName" must be kebab-case (api policy)');
  assertThrows(() => generateArtifact("controller", "Nope_nope"), TypeError, "kebab-case");
  // Examples and tests do not touch the public barrel.
  assertEquals(generateArtifact("example", "demo-thing").exportInstruction, undefined);
});

Deno.test("plans classify create/identical/conflict with diffs", () => {
  const artifact = generateArtifact("controller", "data-sync");
  const generated = artifact.files["src/app/data_sync.ts"]!;

  const fresh = planGeneration(artifact, {});
  assert(fresh.every((file) => file.action === "create"));

  const identical = planGeneration(artifact, { "src/app/data_sync.ts": generated });
  assertEquals(identical.find((file) => file.path === "src/app/data_sync.ts")!.action, "identical");

  const edited = planGeneration(artifact, { "src/app/data_sync.ts": generated + "// my local edit\n" });
  const conflict = edited.find((file) => file.path === "src/app/data_sync.ts")!;
  assertEquals(conflict.action, "conflict");
  assert(conflict.action === "conflict" && conflict.diff.some((line) => line.includes("my local edit")));
});

Deno.test("conflicts are never overwritten without per-file confirmation", () => {
  const artifact = generateArtifact("theme", "night-owl");
  const generated = artifact.files["src/app/night_owl.ts"]!;
  const plan = planGeneration(artifact, { "src/app/night_owl.ts": generated + "// edited\n" });

  const writes: string[] = [];
  const refused = applyPlan(plan, { write: (path) => writes.push(path) });
  assertEquals(refused.skippedConflicts, ["src/app/night_owl.ts"]); // no confirm = no write
  assert(!writes.includes("src/app/night_owl.ts"));

  const confirmations: string[] = [];
  const confirmed = applyPlan(plan, {
    write: (path) => writes.push(path),
    confirmOverwrite: (path, diff) => {
      confirmations.push(path);
      return diff.length > 0; // the diff was presented before consent
    },
  });
  assertEquals(confirmed.skippedConflicts, []);
  assert(writes.includes("src/app/night_owl.ts"));
  assertEquals(confirmations, ["src/app/night_owl.ts"]);
});
