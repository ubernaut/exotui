// Copyright 2023 Im-Beast. MIT license.

// NAV-008: composable unsaved-change blockers — stable order, inspectable
// reasons, confirmation via the host's modal hook, and forced teardown that
// never awaits UI.

import { assert, assertEquals } from "./deps.ts";
import { createNavigationBlockerRegistry } from "../mod.ts";

function fixture() {
  const registry = createNavigationBlockerRegistry();
  registry.register(({ to }) => to === "/away" ? { source: "settings-form", reason: "unsaved settings" } : undefined);
  registry.register(() => undefined); // never blocks
  registry.register(({ to }) =>
    to.startsWith("/") ? { source: "draft-editor", reason: "draft in progress" } : undefined
  );
  return registry;
}

Deno.test("blockers resolve in stable order and the first reason leads confirmation", async () => {
  const registry = fixture();
  assertEquals(registry.reasons("/away").map((reason) => reason.source), ["settings-form", "draft-editor"]);

  const prompts: string[] = [];
  const outcome = await registry.check("/away", {
    confirm: (first, all) => {
      prompts.push(`${first.source}(${all.length})`);
      return Promise.resolve(true);
    },
  });
  assertEquals(outcome.kind, "confirmed");
  assertEquals(prompts, ["settings-form(2)"]);

  const refused = await registry.check("/away", { confirm: () => Promise.resolve(false) });
  assertEquals(refused.kind, "blocked");
  assertEquals(refused.reasons.length, 2);
});

Deno.test("clear navigations pass, and disposers remove blockers", async () => {
  const registry = createNavigationBlockerRegistry();
  const dispose = registry.register(() => ({ source: "x", reason: "y" }));
  assertEquals((await registry.check("/a")).kind, "blocked"); // no confirmer: block
  dispose();
  assertEquals((await registry.check("/a")).kind, "clear");
  assertEquals(registry.blockerCount, 0);
});

Deno.test("forced teardown records reasons without awaiting any UI", async () => {
  const registry = fixture();
  let confirmerCalled = false;
  const outcome = await registry.check("/away", {
    force: true,
    confirm: () => {
      confirmerCalled = true;
      return new Promise(() => {}); // would hang forever if awaited
    },
  });
  assertEquals(outcome.kind, "forced");
  assertEquals(outcome.reasons.map((reason) => reason.source), ["settings-form", "draft-editor"]);
  assert(!confirmerCalled, "forced teardown must never touch the modal stack");
});
