// Copyright 2023 Im-Beast. MIT license.

// LOC-008: extraction finds call sites with source locations, and the
// linter reports missing/stale keys, parameter drift (call-site and
// cross-locale), invalid messages, and untranslated defaults.

import { assertEquals } from "./deps.ts";
import { extractMessageUsages, lintMessages, type MessageBundleChunk } from "../mod.ts";

const SOURCE = `const a = t("app:greeting", { name: user.name });
const b = t("app:missing", {});
const c = messages.resolve("app", "plain");
`;

const BUNDLES: readonly MessageBundleChunk[] = [
  {
    namespace: "app",
    locale: "en",
    version: "1.0",
    messages: {
      greeting: "Hello, {$name}!",
      plain: "Plain text",
      stale: "Nobody calls me",
      broken: ".match {$n :number}\none {{x}}", // no * fallback: invalid
    },
  },
  {
    namespace: "app",
    locale: "de",
    version: "1.0",
    messages: {
      greeting: "Hallo, {$name} ({$title})!", // extra parameter: drift
      plain: "Plain text", // untranslated
    },
  },
];

Deno.test("extraction reports namespaces, keys, parameters, and source lines", () => {
  const usages = extractMessageUsages(SOURCE, "app.ts");
  assertEquals(usages, [
    { namespace: "app", key: "greeting", parameters: ["name"], source: { file: "app.ts", line: 1 } },
    { namespace: "app", key: "missing", parameters: [], source: { file: "app.ts", line: 2 } },
    { namespace: "app", key: "plain", parameters: [], source: { file: "app.ts", line: 3 } },
  ]);
});

Deno.test("the linter reports every catalog defect with locations", () => {
  const findings = lintMessages({
    usages: extractMessageUsages(SOURCE, "app.ts"),
    bundles: BUNDLES,
    defaultLocale: "en",
  });
  const kinds = findings.map((finding) => `${finding.kind}:${finding.key ?? ""}`).sort();
  assertEquals(kinds, [
    "invalid-message:broken",
    "missing-key:missing",
    "parameter-drift:greeting", // de defines $title the default lacks
    "stale-key:broken",
    "stale-key:stale",
    "untranslated-default:plain",
  ]);
  const missing = findings.find((finding) => finding.kind === "missing-key")!;
  assertEquals(missing.source, { file: "app.ts", line: 2 });
});

Deno.test("call-site parameter drift fails with the call's location", () => {
  const findings = lintMessages({
    usages: [{ namespace: "app", key: "greeting", parameters: [], source: { file: "b.ts", line: 7 } }],
    bundles: [BUNDLES[0]!],
    defaultLocale: "en",
  });
  const drift = findings.find((finding) => finding.kind === "parameter-drift")!;
  assertEquals(drift.source, { file: "b.ts", line: 7 });
  assertEquals(drift.detail, "call passes [] but the message needs [name]");
});
