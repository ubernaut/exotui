// Copyright 2023 Im-Beast. MIT license.

// NAV-010: browser URLs and terminal deep links map to the same location,
// private state is excluded by schema, and old journals migrate or fail
// closed.

import { assert, assertEquals } from "./deps.ts";
import { createNavigationJournal } from "../mod.ts";

Deno.test("URL and deep-link spellings round-trip to the identical location", () => {
  const journal = createNavigationJournal({ schemaVersion: 2 });
  const location = { routeId: "users/detail", params: { id: "42", tab: "posts & more" } };
  const url = journal.toUrl(location);
  const deepLink = journal.toDeepLink(location);
  assertEquals(url, "/users/detail?id=42&tab=posts%20%26%20more");
  assertEquals(deepLink, "tui://users/detail?id=42&tab=posts%20%26%20more");
  assertEquals(journal.parse(url), { routeId: "users/detail", params: { id: "42", tab: "posts & more" } });
  assertEquals(journal.parse(deepLink), journal.parse(url));
  assertEquals(journal.parse("not-a-link"), undefined);
});

Deno.test("private state never reaches the serialized journal", () => {
  const journal = createNavigationJournal({ schemaVersion: 2, maxEntries: 2 });
  journal.record({ routeId: "a", params: {}, privateState: { secretToken: "hunter2" } });
  journal.record({ routeId: "b", params: { q: "x" } });
  journal.record({ routeId: "c", params: {} }); // bound: "a" drops
  const text = journal.serialize();
  assert(!text.includes("hunter2") && !text.includes("privateState"));
  assertEquals(JSON.parse(text).entries, [{ routeId: "b", params: { q: "x" } }, { routeId: "c", params: {} }]);
});

Deno.test("old journals migrate; unknown versions fail closed", () => {
  const journal = createNavigationJournal({
    schemaVersion: 2,
    migrations: { 1: (entries) => entries.map((entry) => ({ ...entry, params: { ...entry.params, v2: "yes" } })) },
  });
  const old = JSON.stringify({ schemaVersion: 1, entries: [{ routeId: "a", params: {} }] });
  assertEquals(journal.restore(old), { restored: 1 });
  assertEquals(journal.entries[0], { routeId: "a", params: { v2: "yes" } });

  const gapped = createNavigationJournal({ schemaVersion: 2 });
  assert(gapped.restore(old).error?.includes("no migration"));
  assertEquals(gapped.entries, []);

  const future = JSON.stringify({ schemaVersion: 9, entries: [] });
  assert(journal.restore(future).error?.includes("newer"));
});
