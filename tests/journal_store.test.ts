// Copyright 2023 Im-Beast. MIT license.

// HIS-008: redaction before serialization, retention on save, chained
// migrations on load, and failed migrations that preserve the original bytes.

import { assert, assertEquals } from "./deps.ts";
import { createRedactingJournalStore, type JournalStoreIo } from "../mod.ts";

function memoryIo(initial?: string): JournalStoreIo & { text: string | undefined } {
  return {
    text: initial,
    read() {
      return this.text;
    },
    write(text: string) {
      this.text = text;
    },
  };
}

Deno.test("sensitive fields never reach the stored bytes; retention drops on save", () => {
  const io = memoryIo();
  const store = createRedactingJournalStore(io, {
    schemaVersion: 2,
    redact: ["payload.password", "meta.token"],
    retain: (_entry, index, total) => index >= total - 2, // keep the last two
  });
  const report = store.save([
    { id: 1, payload: { password: "old-secret", text: "a" } },
    { id: 2, payload: { password: "hunter2", text: "b" }, meta: { token: "t" } },
    { id: 3, payload: { text: "c" } },
  ]);
  assertEquals(report, { written: 2, droppedByRetention: 1, redactedFields: 2 });
  assert(!io.text!.includes("hunter2") && !io.text!.includes('"token"'));
  // The caller's entries are untouched (redaction works on clones).
  assertEquals(store.load().entries, [
    { id: 2, payload: { text: "b" }, meta: {} },
    { id: 3, payload: { text: "c" } },
  ]);
});

Deno.test("loads migrate through chained schema upgraders", () => {
  const io = memoryIo(JSON.stringify({ schemaVersion: 1, entries: [{ v: 1 }] }));
  const store = createRedactingJournalStore(io, {
    schemaVersion: 3,
    migrations: {
      1: (entries) => entries.map((entry) => ({ ...(entry as object), two: true })),
      2: (entries) => entries.map((entry) => ({ ...(entry as object), three: true })),
    },
  });
  const report = store.load();
  assertEquals(report.migratedFrom, 1);
  assertEquals(report.entries, [{ v: 1, two: true, three: true }]);
});

Deno.test("failed or missing migrations preserve the original bytes exactly", () => {
  const original = JSON.stringify({ schemaVersion: 1, entries: [{ v: 1 }] });
  const failing = memoryIo(original);
  const store = createRedactingJournalStore(failing, {
    schemaVersion: 2,
    migrations: {
      1: () => {
        throw new Error("corrupt shape");
      },
    },
  });
  const report = store.load();
  assertEquals(report.entries, []);
  assert(report.error?.includes("corrupt shape"));
  assertEquals(failing.text, original); // bytes untouched

  const missing = memoryIo(original);
  const gapped = createRedactingJournalStore(missing, { schemaVersion: 2 });
  assert(gapped.load().error?.includes("no migration"));
  assertEquals(missing.text, original);

  // Newer-than-supported schemas fail closed.
  const future = memoryIo(JSON.stringify({ schemaVersion: 9, entries: [] }));
  const reader = createRedactingJournalStore(future, { schemaVersion: 2 });
  assert(reader.load().error?.includes("newer"));
});
