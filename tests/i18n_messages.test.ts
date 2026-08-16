// Copyright 2023 Im-Beast. MIT license.

// LOC-002: namespaced, versioned message bundles — lazy locale chunks and
// explicit fallback provenance, with structured diagnostics for duplicate
// keys, incompatible versions, and fallback hits.

import { assertEquals } from "./deps.ts";
import { createMessageBundleRegistry, createUnicodeLocaleContext } from "../mod.ts";
import type { MessageBundleChunk } from "../mod.ts";

const context = createUnicodeLocaleContext({
  requested: ["de-CH"],
  supported: ["de-CH", "de", "en"],
  defaultLocale: "en",
});

Deno.test("messages resolve with exact and fallback provenance along the chain", () => {
  const registry = createMessageBundleRegistry(context);
  registry.register({
    namespace: "app.settings",
    locale: "de-CH",
    version: "1.0",
    messages: { save: "Spychere" },
  });
  registry.register({
    namespace: "app.settings",
    locale: "de",
    version: "1.1",
    messages: { save: "Speichern", cancel: "Abbrechen" },
  });
  registry.register({
    namespace: "app.settings",
    locale: "en",
    version: "1.2",
    messages: { save: "Save", cancel: "Cancel", reset: "Reset" },
  });

  const exact = registry.resolve("app.settings", "save");
  assertEquals([exact.value, exact.locale, exact.provenance], ["Spychere", "de-CH", "exact"]);
  assertEquals(exact.consulted, ["de-CH"]);

  const fallback = registry.resolve("app.settings", "cancel");
  assertEquals([fallback.value, fallback.locale, fallback.provenance], ["Abbrechen", "de", "fallback"]);
  assertEquals(fallback.consulted, ["de-CH", "de"]);

  const missing = registry.resolve("app.settings", "nonexistent");
  assertEquals([missing.value, missing.provenance], [undefined, "missing"]);

  const kinds = registry.diagnostics().entries.map((entry) => entry.kind);
  assertEquals(kinds, ["fallback-hit", "missing-message"]);
});

Deno.test("duplicate keys and incompatible versions produce diagnostics, first writer wins", () => {
  const registry = createMessageBundleRegistry(context);
  registry.register({ namespace: "app", locale: "en", version: "1.0", messages: { title: "First" } });
  registry.register({ namespace: "app", locale: "en", version: "1.4", messages: { title: "Second", ok: "OK" } });
  // A different major rejects the chunk whole: none of its keys land.
  registry.register({ namespace: "app", locale: "en", version: "2.0", messages: { gone: "Gone" } });
  registry.register({ namespace: "app", locale: "en", version: "nope", messages: { alsoGone: "Gone" } });

  assertEquals(registry.resolve("app", "title").value, "First");
  assertEquals(registry.resolve("app", "ok").value, "OK");
  assertEquals(registry.resolve("app", "gone").provenance, "missing");
  // The "app" namespace only has English chunks, so each hit is a fallback hit.
  const kinds = registry.diagnostics().entries.map((entry) => entry.kind);
  assertEquals(kinds, [
    "duplicate-key",
    "incompatible-version",
    "incompatible-version",
    "fallback-hit",
    "fallback-hit",
    "missing-message",
  ]);
  assertEquals(registry.inspect(), [{ namespace: "app", version: "1.0", locales: ["en"] }]);
});

Deno.test("lazy chunks load once per namespace/locale pair and loader errors are diagnostics", async () => {
  const asked: string[] = [];
  const chunks: Record<string, MessageBundleChunk> = {
    "menu de": { namespace: "menu", locale: "de", version: "1.0", messages: { open: "Öffnen" } },
    "menu en": { namespace: "menu", locale: "en", version: "1.0", messages: { open: "Open", close: "Close" } },
  };
  const registry = createMessageBundleRegistry(context, {
    loader: (namespace, locale) => {
      asked.push(`${namespace} ${locale}`);
      if (locale === "de-CH") throw new Error("chunk store offline");
      return chunks[`${namespace} ${locale}`];
    },
  });

  await registry.ensureLoaded("menu");
  await registry.ensureLoaded("menu"); // memoized: no second round of asks
  assertEquals(asked, ["menu de-CH", "menu de", "menu en"]);

  const open = registry.resolve("menu", "open");
  assertEquals([open.value, open.locale, open.provenance], ["Öffnen", "de", "fallback"]);
  assertEquals(registry.diagnostics().entries[0], {
    kind: "loader-error",
    namespace: "menu",
    locale: "de-CH",
    detail: "chunk store offline",
  });
});
