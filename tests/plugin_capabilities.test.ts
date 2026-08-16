// Copyright 2023 Im-Beast. MIT license.

// SEC-003: an undeclared capability cannot be discovered through typed
// slots, commands, or install hooks — it is structurally absent.

import { assert, assertEquals } from "./deps.ts";
import { createPluginCapabilityBroker } from "../mod.ts";

function broker() {
  const instance = createPluginCapabilityBroker();
  instance.provide("commands", { register: (id: string) => `cmd:${id}` });
  instance.provide("slot:status-bar", { contribute: (text: string) => `status:${text}` });
  instance.provide("slot:menu", { contribute: (text: string) => `menu:${text}` });
  instance.provide("secrets", { readAll: () => "SENSITIVE" });
  return instance;
}

Deno.test("install context carries exactly the declared capabilities", () => {
  const host = broker();
  let seen: Record<string, unknown> = {};
  const result = host.install({
    id: "status-plugin",
    capabilities: ["commands", "slot:status-bar"],
    install(context) {
      seen = context;
    },
  });
  assert(result.ok);
  assertEquals(result.granted, ["commands", "slot:status-bar"]);

  // Declared services work.
  const commands = seen["commands"] as { register(id: string): string };
  assertEquals(commands.register("save"), "cmd:save");

  // Undeclared capabilities are structurally absent — not hidden, absent.
  assertEquals(Object.keys(seen).sort(), ["commands", "slot:status-bar"]);
  assertEquals("secrets" in seen, false);
  assertEquals("slot:menu" in seen, false);
  assertEquals(Object.getPrototypeOf(seen), null); // no prototype channel
  assert(Object.isFrozen(seen)); // no post-install mutation channel
});

Deno.test("missing or denied required capabilities refuse the install fail-closed", () => {
  const host = broker();
  let ran = false;
  const missing = host.install({
    id: "greedy",
    capabilities: ["commands", "filesystem"],
    install() {
      ran = true;
    },
  });
  assert(!missing.ok);
  assertEquals(missing.missing, ["filesystem"]);
  assertEquals(ran, false); // install hook never ran

  const denied = host.install(
    { id: "status", capabilities: ["commands"], install: () => void (ran = true) },
    { deny: ["commands"] },
  );
  assert(!denied.ok && denied.missing[0] === "commands");
  assertEquals(ran, false);
});

Deno.test("optional capabilities attach when available and skip silently otherwise", () => {
  const host = broker();
  let keys: string[] = [];
  const result = host.install({
    id: "flexible",
    capabilities: ["commands"],
    optionalCapabilities: ["slot:menu", "clipboard"], // clipboard unprovided
    install(context) {
      keys = Object.keys(context).sort();
    },
  });
  assert(result.ok);
  assertEquals(keys, ["commands", "slot:menu"]);
  assertEquals(result.granted.includes("clipboard"), false);
});

Deno.test("grants are per-instance: same definition, different visibility", () => {
  const host = broker();
  const contexts: Record<string, unknown>[] = [];
  const definition = {
    id: "twice",
    capabilities: ["commands"],
    optionalCapabilities: ["slot:menu"],
    install(context: Readonly<Record<string, unknown>>) {
      contexts.push(context);
    },
  };
  const first = host.install(definition);
  const second = host.install(definition, { deny: ["slot:menu"] });
  assert(first.ok && second.ok);
  assert(first.instanceId !== second.instanceId);
  assertEquals("slot:menu" in contexts[0]!, true);
  assertEquals("slot:menu" in contexts[1]!, false); // denied for this instance only

  let disposedTimes = 0;
  const disposable = host.install({
    id: "d",
    capabilities: [],
    install: () => () => void (disposedTimes += 1),
  });
  assert(disposable.ok);
  disposable.dispose();
  disposable.dispose(); // idempotent
  assertEquals(disposedTimes, 1);
});
