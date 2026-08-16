// Copyright 2023 Im-Beast. MIT license.

// PLG-001: manifests validate without importing plugin code.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { hostApiSatisfies, parsePluginManifest, PluginManifestError, validatePluginManifest } from "../mod.ts";

const VALID = {
  schemaVersion: 1,
  id: "git-lens",
  version: "2.1.0",
  hostApi: "^1.4.0",
  entrypoints: { main: "mod.ts", worker: "worker.ts" },
  contributions: { commands: ["gitlens.blame"], slots: ["status-bar"] },
  permissions: {
    required: [{ kind: "read", operation: "content", target: ".git" }],
    optional: [{ kind: "network", operation: "connect", target: "api.github.com" }],
  },
  stateSchema: { lastView: "string", collapsed: "boolean" },
};

Deno.test("a full manifest validates from pure data with SEC-001 permissions attached", () => {
  const manifest = parsePluginManifest(JSON.stringify(VALID));
  assertEquals(manifest.id, "git-lens");
  assertEquals(manifest.entrypoints, { main: "mod.ts", worker: "worker.ts" });
  assertEquals(manifest.contributions.commands, ["gitlens.blame"]);
  assertEquals(manifest.contributions.routes, []); // absent kinds normalize empty
  assertEquals(manifest.permissions.adapterId, "git-lens");
  assertEquals(manifest.permissions.required.length, 1);
  assertEquals(manifest.stateSchema, { lastView: "string", collapsed: "boolean" });
  assert(Object.isFrozen(manifest) && Object.isFrozen(manifest.contributions));
});

Deno.test("identity, versions, and escape-capable entrypoints are rejected", () => {
  const reject = (patch: Record<string, unknown>, path: string) => {
    const error = assertThrows(
      () => validatePluginManifest({ ...VALID, ...patch }),
      PluginManifestError,
    );
    assert(error.message.includes(path), `${error.message} should mention ${path}`);
  };
  reject({ id: "Bad Name!" }, "$.id");
  reject({ version: "2.1" }, "$.version");
  reject({ hostApi: ">=1.0.0" }, "$.hostApi");
  reject({ schemaVersion: 2 }, "$.schemaVersion");
  reject({ entrypoints: { main: "../../../etc/passwd" } }, "$.entrypoints.main");
  reject({ entrypoints: { main: "https://evil/mod.ts" } }, "$.entrypoints.main");
  reject({ entrypoints: { main: "mod.ts", sneaky: "x.ts" } }, "$.entrypoints");
  reject({ stateSchema: { bad: "function" } }, "$.stateSchema.bad");
  reject({ extra: true }, "extra");
  assertThrows(() => parsePluginManifest("{not json"), PluginManifestError);
});

Deno.test("host API ranges match exact, caret, and tilde semantics", () => {
  assert(hostApiSatisfies("1.4.0", "1.4.0"));
  assert(!hostApiSatisfies("1.4.0", "1.4.1"));

  assert(hostApiSatisfies("^1.4.0", "1.9.3"));
  assert(!hostApiSatisfies("^1.4.0", "1.3.9"));
  assert(!hostApiSatisfies("^1.4.0", "2.0.0"));

  assert(hostApiSatisfies("~1.4.2", "1.4.9"));
  assert(!hostApiSatisfies("~1.4.2", "1.5.0"));
  assert(!hostApiSatisfies("~1.4.2", "1.4.1"));

  assert(!hostApiSatisfies("nonsense", "1.0.0"));
});
