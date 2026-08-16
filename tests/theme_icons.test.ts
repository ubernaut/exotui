// Copyright 2023 Im-Beast. MIT license.

// THEM-009: every icon occupies its declared cells under all supported
// width profiles.

import { assert, assertEquals } from "./deps.ts";
import { CJK_WIDE_WIDTH_PROFILE, createIconRegistry, validateIconPack } from "../mod.ts";

const GOOD_PACK = {
  name: "core",
  icons: {
    check: { glyph: "✓", cells: 1, fallback: "v" },
    branch: { glyph: "⎇", cells: 1, fallback: "y" },
    // Ambiguous-width glyphs (e.g. "→", "•") are deliberately absent:
    // they measure 2 under the CJK profile and belong with fallbacks.
  },
};

Deno.test("a well-formed pack validates cleanly across all profiles", () => {
  assertEquals(validateIconPack(GOOD_PACK), []);
});

Deno.test("width-contract violations name icon, part, and profile", () => {
  const violations = validateIconPack({
    name: "broken",
    icons: {
      // An emoji is 2 cells but declared 1; fallback is fine at 1.
      rocket: { glyph: "🚀", cells: 1, fallback: "^" },
      // Fallback too wide for its declared width.
      badfall: { glyph: "✓", cells: 1, fallback: "()" },
    },
  });
  const rocket = violations.filter((violation) => violation.icon === "rocket");
  assert(rocket.length >= 1 && rocket.every((violation) => violation.part === "glyph"));
  assertEquals(rocket[0]!.declaredCells, 1);
  assertEquals(rocket[0]!.measuredCells, 2);
  const badfall = violations.filter((violation) => violation.icon === "badfall");
  assert(badfall.length >= 1 && badfall.every((violation) => violation.part === "fallback"));
  assert(violations.every((violation) => violation.pack === "broken" && violation.profile.length > 0));
});

Deno.test("resolution honors the active profile and falls back by contract", () => {
  const registry = createIconRegistry();
  assertEquals(registry.register(GOOD_PACK), []);
  const resolved = registry.resolve("core:check")!;
  assertEquals(resolved, { text: "✓", cells: 1, usedFallback: false });
  assertEquals(registry.resolve("core:missing"), undefined);
  assertEquals(registry.resolve("nope:check"), undefined);

  // A glyph that grows to 2 cells under the CJK-wide profile falls back
  // to ASCII there while keeping its declared cell count.
  registry.register({
    name: "shapes",
    icons: { dot: { glyph: "①", cells: 1, fallback: "1" } },
  });
  const narrow = registry.resolve("shapes:dot")!;
  const wide = registry.resolve("shapes:dot", CJK_WIDE_WIDTH_PROFILE)!;
  assertEquals(narrow.usedFallback, false);
  assertEquals(wide, { text: "1", cells: 1, usedFallback: true });
});
