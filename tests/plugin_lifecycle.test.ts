// Copyright 2023 Im-Beast. MIT license.

// PLG-007: fault injection at each lifecycle step leaves the host
// registry identical to a known state.

import { assert, assertEquals } from "./deps.ts";
import {
  createHostContributionRegistry,
  disablePlugin,
  enablePlugin,
  installPlugin,
  type LifecyclePlugin,
  uninstallPlugin,
} from "../mod.ts";

const CONTRIBUTIONS = [
  { kind: "command", name: "one", value: 1 },
  { kind: "slot", name: "two", value: 2 },
  { kind: "theme", name: "three", value: 3 },
];

function pluginWithFault(
  faultAtStep: number | undefined,
  phase: "activate" | "deactivate" | undefined,
): LifecyclePlugin {
  let activations = 0;
  let deactivations = 0;
  return {
    id: "p",
    contributions: CONTRIBUTIONS,
    activate: () => {
      if (phase === "activate" && activations === faultAtStep) throw new Error(`fault at activate ${activations}`);
      activations += 1;
    },
    deactivate: () => {
      if (phase === "deactivate" && deactivations === faultAtStep) {
        throw new Error(`fault at deactivate ${deactivations}`);
      }
      deactivations += 1;
    },
  };
}

Deno.test("the happy path walks install -> enable -> disable -> uninstall", () => {
  const registry = createHostContributionRegistry();
  const empty = registry.snapshot();
  const plugin = pluginWithFault(undefined, undefined);

  assert(installPlugin(registry, plugin).ok);
  assert(registry.has("command", "one") && !registry.active("command", "one"));
  assert(enablePlugin(registry, plugin).ok);
  assert(registry.active("slot", "two"));
  assert(disablePlugin(registry, plugin).ok);
  assert(!registry.active("slot", "two"));
  assert(uninstallPlugin(registry, plugin).ok);
  assertEquals(registry.snapshot(), empty); // fully unwound
});

Deno.test("install faults roll back to the exact prior snapshot", () => {
  const registry = createHostContributionRegistry();
  // Pre-existing state from another plugin must survive untouched.
  installPlugin(registry, { id: "other", contributions: [{ kind: "command", name: "keep", value: 0 }] });
  const known = registry.snapshot();

  // A collision at step 2 (name "three" pre-registered) faults mid-install.
  installPlugin(registry, { id: "blocker", contributions: [{ kind: "theme", name: "three", value: 99 }] });
  const withBlocker = registry.snapshot();
  const result = installPlugin(registry, pluginWithFault(undefined, undefined));
  assert(!result.ok && result.rolledBack);
  assertEquals(result.step, 2);
  assertEquals(registry.snapshot(), withBlocker); // steps 0-1 unwound exactly
  assert(registry.snapshot().includes("command:keep"));
  assert(known.length < withBlocker.length);
});

Deno.test("enable faults at every step leave the registry identical", () => {
  for (let faultStep = 0; faultStep < CONTRIBUTIONS.length; faultStep += 1) {
    const registry = createHostContributionRegistry();
    const plugin = pluginWithFault(faultStep, "activate");
    assert(installPlugin(registry, plugin).ok);
    const installedState = registry.snapshot();

    const result = enablePlugin(registry, plugin);
    assert(!result.ok && result.step === faultStep);
    assertEquals(registry.snapshot(), installedState, `fault at step ${faultStep} was not clean`);
  }
});

Deno.test("disable and uninstall faults also restore the known state", () => {
  for (let faultStep = 0; faultStep < CONTRIBUTIONS.length; faultStep += 1) {
    const registry = createHostContributionRegistry();
    const plugin = pluginWithFault(faultStep, "deactivate");
    installPlugin(registry, plugin);
    enablePlugin(registry, plugin);
    const enabledState = registry.snapshot();

    const result = disablePlugin(registry, plugin);
    assert(!result.ok && result.step === faultStep);
    assertEquals(registry.snapshot(), enabledState, `disable fault ${faultStep} was not clean`);
  }

  // Uninstall fault: removing a contribution that is missing mid-way.
  const registry = createHostContributionRegistry();
  const plugin = pluginWithFault(undefined, undefined);
  installPlugin(registry, plugin);
  const installed = registry.snapshot();
  const partial: LifecyclePlugin = {
    id: "p",
    contributions: [CONTRIBUTIONS[0]!, { kind: "ghost", name: "nope", value: 0 }, CONTRIBUTIONS[2]!],
  };
  const result = uninstallPlugin(registry, partial);
  assert(!result.ok && result.step === 1);
  assertEquals(registry.snapshot(), installed); // the removed step was restored
});
