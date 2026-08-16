// Copyright 2023 Im-Beast. MIT license.

// TXT-007: hyphenation providers — language-tag fallback lookup, unloading,
// soft-hyphen preservation, deterministic no-dictionary fallback, and exact
// source reconstruction from a display break.

import { assert, assertEquals } from "./deps.ts";
import { breakWordForDisplay, createHyphenationRegistry, stripSoftHyphens } from "../mod.ts";

const SHY = "­";

Deno.test("providers resolve through the language fallback chain and unload", () => {
  const registry = createHyphenationRegistry();
  const unload = registry.register({ language: "de", hyphenate: (word) => word === "Zeitung" ? [4] : [] });

  // A regional tag falls back to the base language provider.
  assertEquals(registry.opportunities("Zeitung", "de-CH"), [{ offset: 4, kind: "provider" }]);
  // A more specific provider wins over the base.
  registry.register({ language: "de-CH", hyphenate: () => [3] });
  assertEquals(registry.opportunities("Zeitung", "de-CH"), [{ offset: 3, kind: "provider" }]);
  assertEquals(registry.inspect().languages, ["de", "de-ch"]);

  unload();
  assertEquals(registry.opportunities("Zeitung", "de"), []); // no-dictionary fallback
  assertEquals(registry.opportunities("Zeitung", "de-CH"), [{ offset: 3, kind: "provider" }]);
});

Deno.test("soft hyphens always contribute and provider duplicates dedupe", () => {
  const registry = createHyphenationRegistry();
  const word = `hy${SHY}phen`;
  // Fallback with no provider: the soft hyphen alone.
  assertEquals(registry.opportunities(word, "en"), [{ offset: 3, kind: "soft-hyphen" }]);
  // A provider point at the same offset stays classified as soft-hyphen;
  // out-of-range points are rejected.
  registry.register({ language: "en", hyphenate: () => [3, 5, 0, 99] });
  assertEquals(registry.opportunities(word, "en"), [
    { offset: 3, kind: "soft-hyphen" },
    { offset: 5, kind: "provider" },
  ]);
});

Deno.test("display strips soft hyphens; copy reconstructs the original exactly", () => {
  const word = `Din${SHY}ner${SHY}zeit`;
  assertEquals(stripSoftHyphens(word), "Dinnerzeit");

  const broken = breakWordForDisplay(word, 4); // after the first soft hyphen
  assertEquals(broken.display, "Din-");
  assertEquals(broken.remainder, "nerzeit");
  assertEquals(broken.source, word); // lossless: the source is untouched

  // A prefix already ending in a visible hyphen gains no second hyphen.
  const dashed = breakWordForDisplay("um-editor", 3);
  assertEquals(dashed.display, "um-");
  assertEquals(dashed.remainder, "editor");
});
