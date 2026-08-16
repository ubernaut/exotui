// Copyright 2023 Im-Beast. MIT license.

// PKG-008: prerelease artifacts cannot overwrite stable tags and upgrade
// diagnostics name the selected channel.

import { assert, assertEquals } from "./deps.ts";
import { createReleaseTagRegistry, RELEASE_CHANNELS } from "../mod.ts";

Deno.test("channels are machine-readable declarations with support windows", () => {
  assertEquals(RELEASE_CHANNELS.map((channel) => channel.name), ["stable", "beta", "canary", "compat-test"]);
  for (const channel of RELEASE_CHANNELS) {
    assert(Number.isInteger(channel.supportWindowDays) && channel.supportWindowDays > 0);
  }
  assert(JSON.parse(JSON.stringify(RELEASE_CHANNELS)).length === 4); // serializable
});

Deno.test("prereleases can never overwrite or shadow stable tags", () => {
  const registry = createReleaseTagRegistry();
  assert(registry.publish("stable", "1.4.0").ok);

  const shadow = registry.publish("beta", "1.4.0-beta.1");
  assert(!shadow.ok && shadow.reason.includes('over stable "1.4.0"'));

  const republish = registry.publish("stable", "1.4.0");
  assert(!republish.ok && republish.reason.includes("immutable"));

  // Prereleases for a NOT-yet-stable base are fine; stabilizing later works.
  assert(registry.publish("beta", "1.5.0-beta.1").ok);
  assert(registry.publish("canary", "1.6.0-canary.7").ok);
  assert(registry.publish("stable", "1.5.0").ok);

  // Channel/suffix mismatches are refused with the real channel named.
  const mismatch = registry.publish("stable", "2.0.0-beta.1");
  assert(!mismatch.ok && mismatch.reason.includes('"beta"'));
  const nonsense = registry.publish("beta", "2.0.0-rc.1");
  assert(!nonsense.ok && nonsense.reason.includes("no channel suffix"));
});

Deno.test("upgrade diagnostics always name the selected channel", () => {
  const registry = createReleaseTagRegistry();
  registry.publish("stable", "1.4.0");
  registry.publish("stable", "1.5.0");
  registry.publish("beta", "1.6.0-beta.2");

  const stable = registry.resolveUpgrade("1.4.0", "stable");
  assertEquals(stable.selected, "1.5.0");
  assert(stable.reason.includes('channel "stable"'));

  const beta = registry.resolveUpgrade("1.5.0", "beta");
  assertEquals(beta.selected, "1.6.0-beta.2");
  assert(beta.reason.includes('"beta"'));

  const current = registry.resolveUpgrade("1.5.0", "stable");
  assert(current.reason.includes("already at the newest"));
  const empty = registry.resolveUpgrade("1.0.0", "compat-test");
  assertEquals(empty.selected, undefined);
  assert(empty.reason.includes('"compat-test"'));
});
