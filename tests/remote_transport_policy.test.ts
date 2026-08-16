// Copyright 2023 Im-Beast. MIT license.

// REM-003: production policy rejects plaintext or unverifiable transports
// while tests can install an explicit fake.

import { assert, assertEquals } from "./deps.ts";
import { createSecureTransportPolicy } from "../mod.remote.ts";

Deno.test("production policy accepts only verified encrypted transports", () => {
  const policy = createSecureTransportPolicy();
  const good = policy.evaluate({
    scheme: "wss",
    tlsVerified: true,
    peerIdentity: "exomux.example.com",
    certificateSha256: "AB".repeat(32),
    channelBinding: "tls-exporter:xyz",
  });
  assert(good.accepted);
  assertEquals(good.identity.peerIdentity, "exomux.example.com");
  assertEquals(good.identity.certificateSha256, "ab".repeat(32)); // normalized
  assertEquals(good.identity.channelBinding, "tls-exporter:xyz");
  assertEquals(good.identity.fake, false);

  const plaintext = policy.evaluate({ scheme: "ws", tlsVerified: true, peerIdentity: "x" });
  assert(!plaintext.accepted && plaintext.reason.includes("plaintext"));
  const unverified = policy.evaluate({ scheme: "wss", peerIdentity: "x" });
  assert(!unverified.accepted && unverified.reason.includes("verification"));
  const anonymous = policy.evaluate({ scheme: "wss", tlsVerified: true });
  assert(!anonymous.accepted && anonymous.reason.includes("identity"));
});

Deno.test("certificate pinning constrains accepted peers", () => {
  const policy = createSecureTransportPolicy({ pinnedCertificates: ["aa".repeat(32)] });
  const pinned = policy.evaluate({
    scheme: "tls",
    tlsVerified: true,
    peerIdentity: "host",
    certificateSha256: "AA".repeat(32),
  });
  assert(pinned.accepted);
  const wrongPin = policy.evaluate({
    scheme: "tls",
    tlsVerified: true,
    peerIdentity: "host",
    certificateSha256: "bb".repeat(32),
  });
  assert(!wrongPin.accepted && wrongPin.reason.includes("pinned"));
  const noCert = policy.evaluate({ scheme: "tls", tlsVerified: true, peerIdentity: "host" });
  assert(!noCert.accepted);
});

Deno.test("fakes need the explicit hatch and stay visibly fake", () => {
  const production = createSecureTransportPolicy();
  const rejected = production.evaluate({ scheme: "tcp", fake: true });
  assert(!rejected.accepted && rejected.reason.includes("fake"));

  const testPolicy = createSecureTransportPolicy({ allowFakeTransports: true });
  const accepted = testPolicy.evaluate({ scheme: "tcp", fake: true, peerIdentity: "loopback" });
  assert(accepted.accepted);
  assertEquals(accepted.identity.fake, true); // never masquerades as verified
  // The hatch does not weaken real-transport judgment.
  const stillStrict = testPolicy.evaluate({ scheme: "ws", tlsVerified: true, peerIdentity: "x" });
  assert(!stillStrict.accepted);
});
