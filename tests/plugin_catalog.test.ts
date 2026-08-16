// Copyright 2023 Im-Beast. MIT license.

// PLG-009: catalog compromise cannot substitute bytes without an
// integrity failure and no install is automatic.

import { assert, assertEquals } from "./deps.ts";
import { createContentIntegrityGate, createPluginCatalogConsumer, PluginCatalogConsumer } from "../mod.ts";

const PACKAGE_BYTES = new TextEncoder().encode("plugin package payload v1");

async function sha(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedCatalog() {
  const catalog = {
    version: 1,
    snapshotAtMs: 1_000_000,
    packages: [
      { id: "good", version: "1.0.0", sha256: await sha(PACKAGE_BYTES), provenanceUrl: "https://example/prov" },
      { id: "bad", version: "2.0.0", sha256: "ab".repeat(32), revoked: { reason: "credential-stealing build" } },
    ],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(catalog));
  return { bytes, sha256: await sha(bytes) };
}

Deno.test("catalog bytes verify before parsing; tampering fails closed", async () => {
  const consumer = createPluginCatalogConsumer();
  const { bytes, sha256 } = await signedCatalog();
  const loaded = await consumer.loadCatalog(bytes, { sha256 });
  assert(loaded.ok);
  assertEquals(loaded.catalog.packages.length, 2);

  // A compromised mirror alters the catalog: integrity failure pre-parse.
  const tampered = new Uint8Array(bytes);
  tampered[10] ^= 1;
  const refused = await consumer.loadCatalog(tampered, { sha256 });
  assert(!refused.ok && refused.reason.includes("integrity failure"));
  // No expectation at all is also a failure (SEC-010 semantics).
  const bare = await consumer.loadCatalog(bytes, {});
  assert(!bare.ok);
});

Deno.test("substituted package bytes fail with both digests named", async () => {
  const consumer = createPluginCatalogConsumer({ gate: createContentIntegrityGate() });
  const { bytes, sha256 } = await signedCatalog();
  await consumer.loadCatalog(bytes, { sha256 });

  const genuine = await consumer.verifyPackage("good", "1.0.0", PACKAGE_BYTES);
  assert(genuine.ok);
  assertEquals(genuine.entry.provenanceUrl, "https://example/prov");

  const substituted = await consumer.verifyPackage("good", "1.0.0", new TextEncoder().encode("evil payload"));
  assert(!substituted.ok);
  assert(substituted.reason.includes("catalog pins") && substituted.reason.includes("bytes hash to"));

  const unknown = await consumer.verifyPackage("ghost", "1.0.0", PACKAGE_BYTES);
  assert(!unknown.ok && unknown.reason.includes("not in the catalog"));
});

Deno.test("revocations refuse with reasons; snapshots report staleness", async () => {
  const consumer = createPluginCatalogConsumer();
  const { bytes, sha256 } = await signedCatalog();
  await consumer.loadCatalog(bytes, { sha256 });

  const revoked = await consumer.verifyPackage("bad", "2.0.0", PACKAGE_BYTES);
  assert(!revoked.ok && revoked.reason.includes("credential-stealing build"));

  assertEquals(consumer.isStale(1_000_000 + 500, 1000), false);
  assertEquals(consumer.isStale(1_000_000 + 2000, 1000), true);
  assertEquals(createPluginCatalogConsumer().isStale(0, 999999), true); // no catalog = stale
});

Deno.test("no install is automatic: the consumer has no install surface", () => {
  const members = Object.getOwnPropertyNames(PluginCatalogConsumer.prototype);
  assert(!members.some((name) => /install|activate|execute/i.test(name)));
  assertEquals(members.sort(), ["constructor", "isStale", "loadCatalog", "resolve", "verifyPackage"]);
});
