// Copyright 2023 Im-Beast. MIT license.

// REM-002: the protocol carries no credential material after setup, and
// role changes revoke capabilities immediately.

import { assert, assertEquals } from "./deps.ts";
import { createRemoteSessionAuthority } from "../mod.remote.ts";

function authority() {
  const seenCredentials: string[] = [];
  const instance = createRemoteSessionAuthority({
    sessionTtlMs: 1000,
    authenticate: (credential) => {
      seenCredentials.push(credential);
      if (credential === "operator-token") return { subject: "cos", roles: ["controller"] };
      if (credential === "watch-token") return { subject: "guest", roles: ["viewer"] };
      return undefined;
    },
  });
  return { instance, seenCredentials };
}

Deno.test("establish consumes the credential once and yields an opaque principal", async () => {
  const { instance, seenCredentials } = authority();
  const principal = await instance.establish("operator-token", 0);
  assert(principal);
  assertEquals(principal.subject, "cos");
  assertEquals(principal.expiresAtMs, 1000);
  // The principal carries NO credential material.
  assert(!JSON.stringify(principal).includes("operator-token"));
  assertEquals(seenCredentials, ["operator-token"]); // seen exactly once, at setup

  assertEquals(await instance.establish("wrong", 0), undefined);
  const decision = instance.authorize(principal.sessionId, "send-input", 10);
  assert(decision.allowed && decision.role === "controller");
  assertEquals(instance.authorize(principal.sessionId, "terminate-session", 10).allowed, false);
});

Deno.test("role changes take effect on the very next authorization", async () => {
  const { instance } = authority();
  const principal = (await instance.establish("operator-token", 0))!;
  assert(instance.authorize(principal.sessionId, "send-input", 1).allowed);

  // Demote to viewer: input capability disappears immediately.
  assert(instance.setRoles(principal.sessionId, ["viewer"]));
  const demoted = instance.authorize(principal.sessionId, "send-input", 2);
  assert(!demoted.allowed && demoted.reason.includes("send-input"));
  assert(instance.authorize(principal.sessionId, "view-output", 2).allowed);

  // Promote to moderator: transfer-control appears immediately.
  instance.setRoles(principal.sessionId, ["moderator"]);
  assert(instance.authorize(principal.sessionId, "transfer-control", 3).allowed);
});

Deno.test("expiry and revocation close sessions on the caller clock", async () => {
  const { instance } = authority();
  const first = (await instance.establish("operator-token", 0))!;
  const second = (await instance.establish("watch-token", 0))!;

  assert(instance.authorize(first.sessionId, "view-output", 999).allowed);
  assertEquals(instance.authorize(first.sessionId, "view-output", 1000).allowed, false); // TTL edge
  assertEquals(instance.roles(first.sessionId, 1000), []);

  assert(instance.revoke(second.sessionId));
  assertEquals(instance.authorize(second.sessionId, "view-output", 10).allowed, false);
  assertEquals(instance.revoke(second.sessionId), false); // already revoked

  assertEquals(instance.sweep(1000), 2);
});
