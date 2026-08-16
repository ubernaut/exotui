// Copyright 2023 Im-Beast. MIT license.

// THEM-010: export/import is stable, unknown required fields fail closed,
// and old manifests migrate with a reviewable report.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  exportThemeDocument,
  importThemeDocument,
  migrateThemeDocument,
  THEME_INTERCHANGE_VERSION,
  ThemeInterchangeError,
} from "../mod.ts";

const DOCUMENT = {
  version: THEME_INTERCHANGE_VERSION,
  name: "night",
  tokens: { surface: [10, 20, 30], accent: [30, 200, 180] },
  computed: { "chart:line": { op: "ref", token: "accent" } },
  requires: ["computed-tokens"],
} as const;

Deno.test("export is canonical and round-trips byte-identically", () => {
  const first = exportThemeDocument(DOCUMENT);
  // Same content with scrambled key order exports identically.
  const scrambled = JSON.parse(JSON.stringify(DOCUMENT));
  const reordered = {
    requires: scrambled.requires,
    tokens: scrambled.tokens,
    name: scrambled.name,
    version: scrambled.version,
    computed: scrambled.computed,
  };
  assertEquals(exportThemeDocument(reordered as typeof DOCUMENT), first);
  // Import of the export round-trips to the same export.
  assertEquals(exportThemeDocument(importThemeDocument(first)), first);
  assert(first.includes('"version": 2'));
});

Deno.test("unknown fields and unsupported requirements fail closed", () => {
  assertThrows(
    () => importThemeDocument(JSON.stringify({ ...DOCUMENT, sneaky: true })),
    ThemeInterchangeError,
    'unknown field "sneaky"',
  );
  assertThrows(
    () => importThemeDocument(JSON.stringify({ ...DOCUMENT, requires: ["quantum-rendering"] })),
    ThemeInterchangeError,
    "unsupported required feature(s): quantum-rendering",
  );
  assertThrows(
    () => importThemeDocument(JSON.stringify({ ...DOCUMENT, tokens: { bad: [999, 0, 0] } })),
    ThemeInterchangeError,
  );
  // Computed expressions validate through THEM-003 at import.
  assertThrows(
    () =>
      importThemeDocument(JSON.stringify({
        version: 2,
        name: "x",
        tokens: {},
        computed: { "a:b": { op: "ref", token: "ghost" } },
      })),
    Error,
    "unknown token",
  );
});

Deno.test("v1 documents migrate with a reviewable per-field report", () => {
  const { document, report } = migrateThemeDocument({
    version: 1,
    name: "classic",
    colors: { surface: "#0a141e", accent: "#1ec8b4", broken: "teal" },
  });
  assertEquals(document.version, 2);
  assertEquals(document.tokens["surface"], [10, 20, 30]);
  assertEquals(document.tokens["accent"], [30, 200, 180]);
  assertEquals("broken" in document.tokens, false);

  const actions = Object.fromEntries(report.map((entry) => [entry.field, entry.action]));
  assertEquals(actions["colors.surface"], "converted");
  assertEquals(actions["colors.broken"], "dropped");
  assertEquals(actions["colors"], "renamed");
  assert(report.find((entry) => entry.field === "colors.broken")!.detail.includes("teal"));

  // Current documents pass through with an empty report.
  const passthrough = migrateThemeDocument(DOCUMENT);
  assertEquals(passthrough.report, []);
  assertThrows(() => migrateThemeDocument({ version: 99 }), ThemeInterchangeError);
});
