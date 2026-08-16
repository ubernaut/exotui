// Copyright 2023 Im-Beast. MIT license.

// OBS-010: support bundles include sensitive sections only under separate
// approval, with a preview manifest listing inclusions and exclusions.

import { assert, assertEquals } from "./deps.ts";
import { createHealthMonitor, createSupportBundleBuilder } from "../mod.ts";

function inputs() {
  return {
    configSchemas: { theme: { type: "string" } },
    versions: { exotui: "1.4.0", deno: "2.9.1" },
    health: createHealthMonitor().snapshot(100),
    redactedDiagnostics: [{ name: "i18n.missing-translation", attributes: { key: "save" }, dropped: [] }],
    sensitive: {
      "screen-text": "SECRET-on-screen-content",
      "environment": { HOME: "/home/cos", AWS_KEY: "AKIA-secret" },
      "paths": ["/home/cos/projects/exotui"],
    },
  };
}

Deno.test("the manifest previews inclusions and unapproved exclusions", () => {
  const builder = createSupportBundleBuilder(inputs());
  const manifest = builder.manifest();
  assertEquals(manifest.included, ["config-schemas", "versions", "health", "redacted-diagnostics"]);
  assertEquals([...manifest.excluded].sort(), ["environment", "paths", "screen-text"]);
  assertEquals(manifest.approvedSensitive, []);
});

Deno.test("unapproved sensitive sections are structurally absent from the bundle", () => {
  const builder = createSupportBundleBuilder(inputs());
  const bundle = builder.build();
  assert(!bundle.includes("SECRET-on-screen-content"));
  assert(!bundle.includes("AKIA-secret"));
  assert(!bundle.includes("/home/cos"));
  assert(!bundle.includes('"screen-text":') || false);
  const parsed = JSON.parse(bundle);
  assertEquals(Object.keys(parsed).sort(), [
    "config-schemas",
    "health",
    "manifest",
    "redacted-diagnostics",
    "versions",
  ]);
});

Deno.test("each sensitive section needs its own approval", () => {
  const builder = createSupportBundleBuilder(inputs());
  builder.approve("paths"); // ONLY paths
  const manifest = builder.manifest();
  assertEquals(manifest.approvedSensitive, ["paths"]);
  assertEquals([...manifest.excluded].sort(), ["environment", "screen-text"]);

  const bundle = builder.build();
  assert(bundle.includes("/home/cos/projects/exotui")); // approved
  assert(!bundle.includes("AKIA-secret")); // still excluded
  assert(!bundle.includes("SECRET-on-screen-content"));
});
