// Copyright 2023 Im-Beast. MIT license.

// PLG-004: an update cannot retain a grant that the new manifest no
// longer declares.

import { assert, assertEquals } from "./deps.ts";
import { createPluginPermissionLedger, validatePluginManifest } from "../mod.ts";

function manifest(permissions: { required?: unknown[]; optional?: unknown[] }) {
  return validatePluginManifest({
    schemaVersion: 1,
    id: "files-plus",
    version: "1.0.0",
    hostApi: "^1.0.0",
    entrypoints: { main: "mod.ts" },
    permissions,
  });
}

const READ_HOME = { kind: "read", operation: "content", target: "/home" } as const;
const WRITE_TMP = { kind: "write", operation: "create", target: "/tmp" } as const;
const NET_API = { kind: "network", operation: "connect", target: "api.example.com" } as const;

Deno.test("install diffs classify additions and demand approval for required ones", () => {
  const ledger = createPluginPermissionLedger();
  const first = manifest({ required: [READ_HOME], optional: [NET_API] });

  const diff = ledger.diff(first);
  assertEquals(diff.entries.map((entry) => `${entry.change}:${entry.level}:${entry.requirement.kind}`), [
    "added:required:read",
    "added:optional:network",
  ]);
  assertEquals(diff.needsApproval.length, 1);

  // Without approval the install refuses.
  const refused = ledger.apply(first);
  assert(!refused.ok && refused.unapproved[0]!.kind === "read");
  assertEquals(ledger.granted("files-plus"), []);

  const applied = ledger.apply(first, [READ_HOME]);
  assert(applied.ok);
  assertEquals(applied.granted.map((grant) => grant.kind), ["read"]); // optional not implicit
});

Deno.test("updates rebuild grants from the new manifest alone", () => {
  const ledger = createPluginPermissionLedger();
  const v1 = manifest({ required: [READ_HOME, WRITE_TMP] });
  assert(ledger.apply(v1, [READ_HOME, WRITE_TMP]).ok);
  assertEquals(ledger.granted("files-plus").length, 2);

  // v2 drops the write requirement and adds a network one.
  const v2 = manifest({ required: [READ_HOME, NET_API] });
  const diff = ledger.diff(v2);
  const changes = Object.fromEntries(diff.entries.map((entry) => [entry.requirement.kind, entry.change]));
  assertEquals(changes, { read: "retained", network: "added", write: "removed" });

  // Retained requirements need no new approval; only the addition does.
  assertEquals(diff.needsApproval.map((requirement) => requirement.kind), ["network"]);
  const applied = ledger.apply(v2, [NET_API]);
  assert(applied.ok);
  const kinds = applied.granted.map((grant) => grant.kind).sort();
  assertEquals(kinds, ["network", "read"]); // the write grant is GONE
});

Deno.test("optional grants persist across updates but never appear implicitly", () => {
  const ledger = createPluginPermissionLedger();
  const v1 = manifest({ required: [READ_HOME], optional: [NET_API] });
  assert(ledger.apply(v1, [READ_HOME, NET_API]).ok); // optional explicitly approved
  assertEquals(ledger.granted("files-plus").length, 2);

  const v2 = manifest({ required: [READ_HOME], optional: [NET_API, WRITE_TMP] });
  const applied = ledger.apply(v2); // retained required + retained optional: no new approval needed
  assert(applied.ok);
  const kinds = applied.granted.map((grant) => grant.kind).sort();
  assertEquals(kinds, ["network", "read"]); // new optional WRITE not granted implicitly

  ledger.remove("files-plus");
  assertEquals(ledger.granted("files-plus"), []);
});
