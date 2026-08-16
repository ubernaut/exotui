// Copyright 2023 Im-Beast. MIT license.

// PLG-008: migration runs before activation, retains a backup, and
// failure restores the prior plugin/state pair.

import { assert, assertEquals } from "./deps.ts";
import { createPluginStateStore, type StateMigration } from "../mod.ts";

const MIGRATIONS: StateMigration[] = [
  { fromVersion: 1, toVersion: 2, migrate: (state) => ({ ...(state as object), theme: "dark" }) },
  { fromVersion: 2, toVersion: 3, migrate: (state) => ({ ...(state as object), layout: "grid" }) },
];

Deno.test("migration chains run before activation and land the new pair", () => {
  const store = createPluginStateStore();
  store.set("p", { version: 1, state: { openFiles: ["a.ts"] } });
  const seen: unknown[] = [];
  const result = store.upgrade("p", 3, MIGRATIONS, (state) => {
    seen.push(state); // activation sees fully migrated state
    return "ok";
  });
  assert(result.ok);
  assertEquals(result.fromVersion, 1);
  assertEquals(result.toVersion, 3);
  assertEquals(seen, [{ openFiles: ["a.ts"], theme: "dark", layout: "grid" }]);
  assertEquals(store.get("p"), { version: 3, state: { openFiles: ["a.ts"], theme: "dark", layout: "grid" } });
  assertEquals(store.backup("p"), { version: 1, state: { openFiles: ["a.ts"] } }); // retained
});

Deno.test("activation failure restores the prior plugin/state pair", () => {
  const store = createPluginStateStore();
  store.set("p", { version: 2, state: { theme: "light" } });
  const result = store.upgrade("p", 3, MIGRATIONS, () => {
    throw new Error("new plugin crashed on boot");
  });
  assert(!result.ok && result.reason === "activation-failed" && result.restored);
  assertEquals(store.get("p"), { version: 2, state: { theme: "light" } }); // untouched pair
});

Deno.test("a plugin can decline the hot upgrade and request restart", () => {
  const store = createPluginStateStore();
  store.set("p", { version: 2, state: { theme: "light" } });
  const result = store.upgrade("p", 3, MIGRATIONS, () => "decline-restart");
  assert(!result.ok && result.reason === "declined");
  assertEquals(result.restartRequested, true);
  assertEquals(result.restored, true);
  assertEquals(store.get("p"), { version: 2, state: { theme: "light" } });
});

Deno.test("missing and failing migrations report without touching state", () => {
  const store = createPluginStateStore();
  store.set("p", { version: 0, state: {} });
  const missing = store.upgrade("p", 3, MIGRATIONS, () => "ok"); // no 0->1 step
  assert(!missing.ok && missing.reason === "missing-migration");
  assertEquals(store.get("p"), { version: 0, state: {} });

  const failing = store.upgrade("q", 2, [
    {
      fromVersion: 0,
      toVersion: 2,
      migrate: () => {
        throw new Error("corrupt");
      },
    },
  ], () => "ok");
  assert(!failing.ok && failing.reason === "migration-failed" && failing.detail.includes("corrupt"));
  assertEquals(store.get("q"), undefined); // never written
});
