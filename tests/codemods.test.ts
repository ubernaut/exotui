// Copyright 2023 Im-Beast. MIT license.

// PKG-003: running a migration twice produces no second diff and
// unsupported syntax is reported with locations.

import { assert, assertEquals } from "./deps.ts";
import { type Codemod, runCodemod } from "../mod.ts";

const MIGRATION: Codemod = {
  id: "rename-old-api",
  version: "2.0.0",
  description: "oldHelper -> newHelper; deps module moved",
  rules: [
    { kind: "rename-identifier", from: "oldHelper", to: "newHelper" },
    { kind: "rename-module", from: "./old/deps.ts", to: "./new/deps.ts" },
  ],
};

const SOURCE = `import { oldHelper } from "./old/deps.ts";
// oldHelper stays in comments untouched
const label = "oldHelper is just text here";
export const value = oldHelper(1) + myOldHelperVariant(2);
`;

Deno.test("codemods rename identifiers and module paths, sparing strings/comments", () => {
  const result = runCodemod(MIGRATION, SOURCE);
  assert(result.changed && result.idempotent);
  assert(result.output.includes('import { newHelper } from "./new/deps.ts"'));
  assert(result.output.includes("// oldHelper stays in comments untouched")); // comment intact
  assert(result.output.includes('"oldHelper is just text here"')); // string intact
  assert(result.output.includes("newHelper(1)"));
  assert(result.output.includes("myOldHelperVariant(2)")); // whole-word only
  // The dry-run diff names exactly the changed lines.
  assertEquals(result.diff.length, 4); // two changed lines, -/+ each
  assert(result.diff[0]!.startsWith("-1: import { oldHelper }"));
});

Deno.test("a second run produces no second diff (engine-enforced idempotence)", () => {
  const first = runCodemod(MIGRATION, SOURCE);
  const second = runCodemod(MIGRATION, first.output);
  assertEquals(second.changed, false);
  assertEquals(second.diff, []);
  assertEquals(second.output, first.output);

  // A structurally non-idempotent migration is REFUSED, not applied.
  const runaway: Codemod = {
    id: "runaway",
    version: "1.0.0",
    description: "grows on every pass: the target re-contains the source",
    rules: [{ kind: "rename-identifier", from: "spin", to: "spin(spin" }],
  };
  const refused = runCodemod(runaway, "const value = spin;");
  assertEquals(refused.idempotent, false);
  assertEquals(refused.output, "const value = spin;"); // untouched
  assertEquals(refused.diff, []);
});

Deno.test("unsupported syntax reports exact locations instead of mangling", () => {
  const broken = 'const a = oldHelper();\nconst s = "unterminated\nmore oldHelper';
  const result = runCodemod(MIGRATION, broken);
  assertEquals(result.unsupported.length, 1);
  assertEquals(result.unsupported[0]!.line, 2);
  assertEquals(result.unsupported[0]!.column, 11);
  assert(result.unsupported[0]!.reason.includes("unterminated string"));
  // Code before the breakage still migrated; the suspect region did not.
  assert(result.output.includes("newHelper()"));
  assert(result.output.includes("more oldHelper")); // inside the suspect string segment

  const comment = runCodemod(MIGRATION, "ok(); /* dangling");
  assert(comment.unsupported[0]!.reason.includes("block comment"));
});
