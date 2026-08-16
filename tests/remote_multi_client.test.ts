// Copyright 2023 Im-Beast. MIT license.

// REM-009: joining and control transfer require host policy, are
// announced to all participants, and are revocable.

import { assert, assertEquals } from "./deps.ts";
import { createMultiClientSession, type SessionAnnouncement } from "../mod.remote.ts";

function session(approveJoin = true, approveTransfer = true) {
  const heard: SessionAnnouncement[] = [];
  const instance = createMultiClientSession({
    approveJoin: () => approveJoin,
    approveControlTransfer: () => approveTransfer,
  });
  instance.onAnnouncement((announcement) => heard.push(announcement));
  return { instance, heard };
}

Deno.test("joins require policy and are announced; the roster hides nobody", () => {
  const { instance, heard } = session();
  const host = instance.join("cos", "moderator", 0)!;
  const guest = instance.join("guest", "viewer", 10)!;
  assert(host && guest);
  assertEquals(heard.map((entry) => entry.kind), ["joined", "joined"]);
  assertEquals(heard[1]!.detail, "guest joined as viewer");

  // Every participant is roster-visible with role and join time; there is
  // no field that could mark one hidden.
  const roster = instance.roster();
  assertEquals(roster.length, 2);
  for (const participant of roster) {
    assertEquals(Object.keys(participant).sort(), ["id", "joinedAtMs", "role", "subject"]);
  }

  const denied = session(false);
  assertEquals(denied.instance.join("intruder", "viewer", 0), undefined);
  assertEquals(denied.instance.roster(), []);
  assertEquals(denied.heard, []); // nothing to announce, nothing hidden
});

Deno.test("control transfer needs policy, announces, and is revocable", () => {
  const { instance, heard } = session();
  const driver = instance.join("driver", "controller", 0)!;
  const passenger = instance.join("passenger", "viewer", 1)!;

  assert(instance.transferControl(driver.id, passenger.id, 5));
  const roles = Object.fromEntries(instance.roster().map((entry) => [entry.subject, entry.role]));
  assertEquals(roles, { driver: "viewer", passenger: "controller" });
  assert(heard.some((entry) => entry.kind === "control-transferred" && entry.detail === "driver -> passenger"));

  // Revocation works at any moment and is announced.
  assert(instance.revokeControl(passenger.id, 9));
  assertEquals(instance.roster().find((entry) => entry.subject === "passenger")!.role, "viewer");
  assertEquals(heard[heard.length - 1]!.kind, "control-revoked");
  assertEquals(instance.revokeControl(passenger.id, 10), false); // no longer controller

  // A viewer cannot hand out control, and policy can refuse transfers.
  assert(!instance.transferControl(passenger.id, driver.id, 11));
  const strict = session(true, false);
  const a = strict.instance.join("a", "controller", 0)!;
  const b = strict.instance.join("b", "viewer", 0)!;
  assertEquals(strict.instance.transferControl(a.id, b.id, 1), false);
});

Deno.test("leaves are announced and the journal is bounded evidence", () => {
  const { instance, heard } = session();
  const participant = instance.join("temp", "viewer", 0)!;
  assert(instance.leave(participant.id, 5));
  assertEquals(instance.roster(), []);
  assertEquals(heard.map((entry) => entry.kind), ["joined", "left"]);
  assertEquals(instance.announcements().length, 2);
  assertEquals(instance.leave("ghost", 6), false);
});
