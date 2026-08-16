// Copyright 2023 Im-Beast. MIT license.

// LOC-009: pseudo-locales for stress testing — MF2 syntax survives every
// transform, messages still compile and format, and the pseudo loader makes
// missing-key fallbacks structurally impossible.

import { assert, assertEquals } from "./deps.ts";
import {
  bidiParagraphOfText,
  compileMessageFormat,
  createMessageBundleRegistry,
  createUnicodeLocaleContext,
  type MessageBundleChunk,
  PSEUDO_LOCALE_TAGS,
  type PseudoLocaleKind,
  pseudoLocaleLoader,
  pseudoLocalizeText,
} from "../mod.ts";

const MESSAGE = "Hello, {$name}! You have {$count :number} items.";

Deno.test("every transform preserves MF2 placeholders and stays compilable", () => {
  const en = createUnicodeLocaleContext({ requested: ["en"], supported: ["en"] });
  for (const kind of Object.keys(PSEUDO_LOCALE_TAGS) as PseudoLocaleKind[]) {
    const transformed = pseudoLocalizeText(MESSAGE, kind);
    assert(transformed.includes("{$name}"), `${kind} must keep placeholders: ${transformed}`);
    assert(transformed.includes("{$count :number}"), `${kind} must keep annotations`);
    const formatted = compileMessageFormat(transformed, en).format({ name: "cos", count: 3 });
    assert(formatted.includes("cos") && formatted.includes("3"), `${kind} still formats: ${formatted}`);
  }
  // Expansion grows the text; mirrored wraps in real isolates.
  assert(pseudoLocalizeText("Save", "expansion").length > "Save".length * 1.3);
  const mirrored = pseudoLocalizeText("Save", "mirrored-rtl");
  const analysis = bidiParagraphOfText(mirrored);
  assert(analysis.runs.length >= 1, "mirrored text engages the bidi engine");
});

Deno.test("the pseudo loader makes missing keys structurally impossible", async () => {
  const base = (namespace: string, locale: string): MessageBundleChunk | undefined =>
    locale === "en" ? { namespace, locale, version: "1.0", messages: { save: "Save", open: "Open file" } } : undefined;

  const context = createUnicodeLocaleContext({
    requested: ["en-XA"],
    supported: ["en-XA", "en"],
    defaultLocale: "en",
  });
  const registry = createMessageBundleRegistry(context, { loader: pseudoLocaleLoader(base) });
  await registry.ensureLoaded("app");

  const save = registry.resolve("app", "save");
  assertEquals(save.provenance, "exact"); // en-XA itself resolves: no fallback
  assert(save.value !== "Save" && String(save.value).includes("Save"));
  const open = registry.resolve("app", "open");
  assertEquals(open.provenance, "exact");
  // Non-pseudo locales pass through to the base loader untouched.
  assertEquals((await pseudoLocaleLoader(base)("app", "en"))?.messages["save"], "Save");
});
