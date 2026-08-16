// Copyright 2023 Im-Beast. MIT license.

// SEC-002: prompt, granted, denied, revoked, and broker-failure states, with
// deny precedence and fail-closed disconnect.

import { assert, assertEquals } from "./deps.ts";
import {
  combinePermissionDecisions,
  createBrokerPermissionAdapter,
  createDenoPermissionAdapter,
  denoDescriptorFor,
  type PermissionRevocation,
  type RuntimePermissionRequirement,
} from "../mod.ts";

const READ_CONFIG: RuntimePermissionRequirement = { kind: "read", operation: "content", target: "/etc/app.conf" };
const NET_API: RuntimePermissionRequirement = { kind: "network", operation: "connect", target: "api.example.com" };
const CLIPBOARD: RuntimePermissionRequirement = { kind: "clipboard", operation: "write", target: "*" };

Deno.test("Deno adapter maps requirements to descriptors and reports all three states", async () => {
  assertEquals(denoDescriptorFor(READ_CONFIG), { name: "read", path: "/etc/app.conf" });
  assertEquals(denoDescriptorFor(NET_API), { name: "net", host: "api.example.com" });
  assertEquals(denoDescriptorFor(CLIPBOARD), undefined);

  const states: Deno.PermissionState[] = ["granted", "denied", "prompt"];
  const adapter = createDenoPermissionAdapter({
    query: (_descriptor) => Promise.resolve({ state: states.shift()! }),
  });
  assertEquals((await adapter.decide(READ_CONFIG)).state, "granted");
  assertEquals((await adapter.decide(READ_CONFIG)).state, "denied");
  assertEquals((await adapter.decide(READ_CONFIG)).state, "prompt");
  // Kinds Deno cannot describe are "prompt" — no opinion, never a grant.
  const clipboard = await adapter.decide(CLIPBOARD);
  assert(clipboard.state === "prompt" && clipboard.reason?.includes("no Deno descriptor"));
  // A throwing permissions API is a denial.
  const broken = createDenoPermissionAdapter({ query: () => Promise.reject(new Error("api down")) });
  assertEquals((await broken.decide(READ_CONFIG)).state, "denied");
});

Deno.test("broker adapter: granted, revoked, and thrown failures fail closed", async () => {
  const answers = new Map([[NET_API.target, "granted" as const]]);
  const adapter = createBrokerPermissionAdapter((requirement) => {
    const answer = answers.get(requirement.target);
    if (!answer) throw new Error("broker backend unreachable");
    return answer;
  });
  const revocations: PermissionRevocation[] = [];
  adapter.onRevoke((revocation) => revocations.push(revocation));

  assertEquals((await adapter.decide(NET_API)).state, "granted");
  const failure = await adapter.decide(READ_CONFIG); // no answer → throw
  assert(failure.state === "denied" && failure.reason?.includes("broker failure"));

  adapter.revoke(NET_API);
  assertEquals(revocations.map((r) => r.reason), ["revoked"]);
  const afterRevoke = await adapter.decide(NET_API);
  assert(afterRevoke.state === "denied" && afterRevoke.reason?.includes("revoked"));
});

Deno.test("broker disconnect revokes outstanding grants and denies everything after", async () => {
  const adapter = createBrokerPermissionAdapter(() => "granted");
  const revocations: PermissionRevocation[] = [];
  adapter.onRevoke((revocation) => revocations.push(revocation));
  await adapter.decide(NET_API);
  await adapter.decide(READ_CONFIG);

  adapter.disconnect();
  assertEquals(adapter.connected, false);
  assertEquals(revocations.map((r) => `${r.reason}:${r.requirement.target}`), [
    "broker-disconnected:api.example.com",
    "broker-disconnected:/etc/app.conf",
  ]);
  const after = await adapter.decide(NET_API);
  assert(after.state === "denied" && after.reason?.includes("fail-closed"));
});

Deno.test("combiner is deny-precedence and fails closed on empty sources", () => {
  const granted = { state: "granted", source: "deno" } as const;
  const prompt = { state: "prompt", source: "deno" } as const;
  const denied = { state: "denied", source: "broker", reason: "policy" } as const;
  assertEquals(combinePermissionDecisions([granted, granted]).state, "granted");
  assertEquals(combinePermissionDecisions([granted, prompt]).state, "prompt");
  assertEquals(combinePermissionDecisions([granted, denied, prompt]).state, "denied");
  assertEquals(combinePermissionDecisions([]).state, "denied");
});
