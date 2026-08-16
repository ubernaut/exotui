// Copyright 2023 Im-Beast. MIT license.

// DAT-010: pluggable conflict resolution — reject keeps conflicts open,
// last-write picks by timestamp, field merge combines non-overlapping
// changes, three-way delegates, and both versions persist until a declared
// resolution succeeds.

import { assert, assertEquals } from "./deps.ts";
import {
  createConflictLedger,
  fieldMergeResolver,
  lastWriteResolver,
  rejectResolver,
  threeWayResolver,
} from "../mod.ts";

const CONFLICT = {
  id: "doc-1",
  base: { title: "Notes", body: "hello", tags: "a" },
  local: { title: "My Notes", body: "hello", tags: "a" },
  remote: { title: "Notes", body: "hello world", tags: "a" },
  localAt: 100,
  remoteAt: 200,
};

Deno.test("reject keeps both versions; last-write picks by timestamp", () => {
  const ledger = createConflictLedger<typeof CONFLICT.base>();
  ledger.open(CONFLICT);
  const rejected = ledger.resolve("doc-1", rejectResolver())!;
  assertEquals(rejected.kind, "unresolved");
  // Both versions still intact after the failed resolution.
  assertEquals(ledger.conflict("doc-1")?.local.title, "My Notes");
  assertEquals(ledger.conflict("doc-1")?.remote.body, "hello world");

  const resolved = ledger.resolve("doc-1", lastWriteResolver())!;
  assertEquals(resolved, { kind: "resolved", value: CONFLICT.remote }); // remote is newer
  assertEquals(ledger.conflict("doc-1"), undefined);
  assertEquals(ledger.resolution("doc-1"), CONFLICT.remote);
});

Deno.test("field merge combines non-overlapping changes and holds overlaps", () => {
  const ledger = createConflictLedger<typeof CONFLICT.base>();
  ledger.open(CONFLICT);
  // title changed locally, body remotely: both merge cleanly.
  const merged = ledger.resolve("doc-1", fieldMergeResolver())!;
  assertEquals(merged, { kind: "resolved", value: { title: "My Notes", body: "hello world", tags: "a" } });

  // Overlapping edits stay unresolved without a chooser...
  const overlapping = {
    ...CONFLICT,
    id: "doc-2",
    local: { ...CONFLICT.base, title: "L" },
    remote: { ...CONFLICT.base, title: "R" },
  };
  ledger.open(overlapping);
  const held = ledger.resolve("doc-2", fieldMergeResolver())!;
  assertEquals(held.kind, "unresolved");
  assert(ledger.conflict("doc-2"));
  // ...and resolve once a chooser decides.
  const chosen = ledger.resolve("doc-2", fieldMergeResolver((_field, local) => local))!;
  assertEquals(chosen, { kind: "resolved", value: { ...CONFLICT.base, title: "L" } });
});

Deno.test("three-way merges delegate and a throwing resolver retains the conflict", () => {
  const ledger = createConflictLedger<typeof CONFLICT.base>();
  ledger.open(CONFLICT);
  const failed = ledger.resolve(
    "doc-1",
    threeWayResolver<typeof CONFLICT.base>(() => {
      throw new Error("merge driver crashed");
    }),
  )!;
  assertEquals(failed.kind, "unresolved");
  assert(ledger.conflict("doc-1"), "the conflict must survive a crashing resolver");

  const resolved = ledger.resolve(
    "doc-1",
    threeWayResolver((base, local, remote) => ({
      title: local.title,
      body: remote.body,
      tags: base.tags,
    })),
  )!;
  assertEquals(resolved.kind, "resolved");
  assertEquals(ledger.inspect(), { open: [], resolved: ["doc-1"] });
});
