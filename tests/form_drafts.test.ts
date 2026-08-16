// Copyright 2023 Im-Beast. MIT license.

// FRM-008: draft autosave — caller-clock debounce, secrets excluded by
// default, versioned migration, and corrupt/expired drafts that can never
// overwrite live values.

import { assert, assertEquals } from "./deps.ts";
import { createFormDraftAutosaver, type DraftStorage } from "../mod.ts";

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    read: (key) => data.get(key),
    write: (key, text) => void data.set(key, text),
    remove: (key) => void data.delete(key),
  };
}

Deno.test("debounced saves commit after the idle window on the caller's clock", () => {
  const storage = memoryStorage();
  const drafts = createFormDraftAutosaver(storage, { key: "compose", schemaVersion: 1, debounceMs: 300 });
  drafts.schedule({ body: "h" }, 0);
  drafts.schedule({ body: "hi" }, 100); // keystroke resets the pending value
  assertEquals(drafts.advance(350), false); // 250ms since last keystroke
  assert(drafts.advance(450)); // window passed: commit
  assertEquals(JSON.parse(storage.data.get("compose")!).values, { body: "hi" });
  assertEquals(drafts.advance(500), false); // nothing pending anymore
});

Deno.test("secret fields stay out of drafts unless allow-listed", () => {
  const storage = memoryStorage();
  const drafts = createFormDraftAutosaver(storage, {
    key: "signup",
    schemaVersion: 1,
    secretFields: ["password", "otp"],
    persistSecrets: ["otp"], // explicit opt-in
  });
  const report = drafts.saveNow({ email: "a@b.c", password: "hunter2", otp: "123456" }, 0);
  assertEquals(report.excludedFields, ["password"]);
  const stored = storage.data.get("signup")!;
  assert(!stored.includes("hunter2"));
  assert(stored.includes("123456"));
});

Deno.test("corrupt, expired, and unmigratable drafts never reach live values", () => {
  const storage = memoryStorage();
  const options = { key: "d", schemaVersion: 2, expiryMs: 1000 };

  storage.data.set("d", "{corrupt");
  assertEquals(createFormDraftAutosaver(storage, options).restore(0), undefined);
  assertEquals(storage.data.has("d"), false); // corrupt drafts are removed

  storage.data.set("d", JSON.stringify({ schemaVersion: 2, savedAt: 0, values: { a: 1 } }));
  assertEquals(createFormDraftAutosaver(storage, options).restore(5000), undefined); // expired

  storage.data.set("d", JSON.stringify({ schemaVersion: 1, savedAt: 0, values: { a: 1 } }));
  assertEquals(createFormDraftAutosaver(storage, options).restore(500), undefined); // no migration

  const migrating = createFormDraftAutosaver(storage, {
    ...options,
    migrations: { 1: (values) => ({ ...values, upgraded: true }) },
  });
  assertEquals(migrating.restore(500), { values: { a: 1, upgraded: true }, savedAt: 0, migratedFrom: 1 });

  migrating.discard();
  assertEquals(storage.data.has("d"), false);
});
