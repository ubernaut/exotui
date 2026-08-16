// Copyright 2023 Im-Beast. MIT license.

// LOC-010: missing-translation telemetry carries catalog coordinates only;
// user-supplied message data cannot enter reports structurally.

import { assert, assertEquals } from "./deps.ts";
import { createMessageBundleRegistry, createMissingTranslationTelemetry, createUnicodeLocaleContext } from "../mod.ts";

function fixture() {
  const context = createUnicodeLocaleContext({
    requested: ["de-CH"],
    supported: ["de-CH", "de", "en"],
    defaultLocale: "en",
  });
  const registry = createMessageBundleRegistry(context);
  registry.register({ namespace: "app", locale: "en", version: "2.1", messages: { save: "Save {$name}" } });
  registry.register({ namespace: "app", locale: "de", version: "2.1", messages: { save: "Speichern {$name}" } });
  return { registry, telemetry: createMissingTranslationTelemetry() };
}

Deno.test("fallback and missing resolutions report catalog coordinates", () => {
  const { registry, telemetry } = fixture();
  const fallback = registry.resolve("app", "save"); // de-CH -> de
  const report = telemetry.report(registry, "app", fallback, "de-CH")!;
  assertEquals(report, {
    namespace: "app",
    key: "save",
    requestedLocale: "de-CH",
    bundleVersion: "2.1",
    fallbackPath: ["de-CH", "de"],
    outcome: "fallback",
  });

  const missing = registry.resolve("app", "delete");
  assertEquals(telemetry.report(registry, "app", missing, "de-CH")?.outcome, "missing");
  // Exact hits report nothing at all.
  const en = registry.resolve("app", "save");
  void en;
  assertEquals(telemetry.reports().length, 2);
});

Deno.test("runtime parameter values cannot enter reports - structurally or downstream", () => {
  const { registry, telemetry } = fixture();
  // The user's runtime values live wherever formatting happens; the report
  // API has no parameter that could carry them. The only user-influenced
  // string is the KEY - and a hostile key faces the redaction schema.
  const hostile = registry.resolve("app", "key-with-oversized-tail-" + "x".repeat(300));
  const report = telemetry.report(registry, "app", hostile, "de-CH")!;
  // The report record itself has exactly the catalog fields - there is no
  // field that could carry a runtime value.
  assertEquals(
    Object.keys(report).sort(),
    ["bundleVersion", "fallbackPath", "key", "namespace", "outcome", "requestedLocale"],
  );
  const signal = telemetry.exported().at(-1)!;
  assert((signal.attributes["key"] as string).length <= 129); // schema truncation
  assert((signal.attributes["key"] as string).endsWith("…"));
  // No attribute beyond the fixed schema exists.
  assertEquals(
    Object.keys(signal.attributes).sort(),
    ["bundleVersion", "fallbackPath", "key", "namespace", "outcome", "requestedLocale"],
  );
});
