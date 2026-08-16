// Copyright 2023 Im-Beast. MIT license.

// PLG-006: unrelated plugins are not loaded and a failed activation can
// be retried only by policy.

import { assert, assertEquals } from "./deps.ts";
import { createPluginActivationCoordinator } from "../mod.ts";

Deno.test("only plugins matching the fired event are loaded", async () => {
  const loads: string[] = [];
  const coordinator = createPluginActivationCoordinator();
  coordinator.register({
    id: "git",
    activationEvents: ["onCommand:git.blame", "onFileType:gitconfig"],
    activate: () => void loads.push("git"),
  });
  coordinator.register({
    id: "markdown",
    activationEvents: ["onFileType:md"],
    activate: () => void loads.push("markdown"),
  });
  coordinator.register({
    id: "boot",
    activationEvents: ["onStartup"],
    activate: () => void loads.push("boot"),
  });

  const startup = await coordinator.fire("onStartup");
  assertEquals(startup.activated, ["boot"]);
  assertEquals(loads, ["boot"]); // git and markdown untouched

  const command = await coordinator.fire("onCommand:git.blame");
  assertEquals(command.activated, ["git"]);
  assertEquals(coordinator.state("markdown"), "registered"); // never loaded

  const again = await coordinator.fire("onStartup");
  assertEquals(again.activated, []);
  assertEquals(again.alreadyActive, ["boot"]); // no double activation
  assertEquals(loads, ["boot", "git"]);
});

Deno.test("activation is single-flight under concurrent fires", async () => {
  let calls = 0;
  let release!: () => void;
  const coordinator = createPluginActivationCoordinator();
  coordinator.register({
    id: "slow",
    activationEvents: ["onRoute:/dash"],
    activate: () => {
      calls += 1;
      return new Promise<void>((resolve) => release = resolve);
    },
  });
  const first = coordinator.fire("onRoute:/dash");
  const second = coordinator.fire("onRoute:/dash");
  assertEquals(coordinator.state("slow"), "activating");
  await Promise.resolve(); // the activate body starts on a microtask
  await Promise.resolve();
  release();
  const [a, b] = await Promise.all([first, second]);
  assertEquals(calls, 1); // one attempt shared by both fires
  assertEquals(a.activated, ["slow"]);
  assertEquals(b.activated, ["slow"]);
});

Deno.test("failed activations retry only by policy or explicit reset", async () => {
  let attempts = 0;
  const coordinator = createPluginActivationCoordinator();
  coordinator.register({
    id: "flaky",
    activationEvents: ["onLanguage:rust"],
    maxAttempts: 2,
    activate: () => {
      attempts += 1;
      throw new Error(`boom ${attempts}`);
    },
  });
  coordinator.register({
    id: "brittle",
    activationEvents: ["onLanguage:rust"],
    activate: () => {
      throw new Error("dead");
    },
  });

  const first = await coordinator.fire("onLanguage:rust");
  assertEquals(first.failed.length, 2);
  assertEquals(attempts, 1);

  // Second fire: "flaky" has one policy attempt left; "brittle" does not.
  const second = await coordinator.fire("onLanguage:rust");
  assertEquals(attempts, 2);
  assert(second.failed.find((entry) => entry.id === "flaky")!.error.includes("boom 2"));
  assert(second.failed.find((entry) => entry.id === "brittle")!.error.includes("dead"));

  // Third fire: both out of attempts — no activate() runs at all.
  await coordinator.fire("onLanguage:rust");
  assertEquals(attempts, 2);

  // Explicit host reset grants a fresh budget.
  assert(coordinator.reset("flaky"));
  await coordinator.fire("onLanguage:rust");
  assertEquals(attempts, 3);
  assertEquals(coordinator.reset("nonexistent"), false);
});
