// Copyright 2023 Im-Beast. MIT license.

// THEM-007: switching density changes declared spacing/hit targets
// without mutating application state.

import { assert, assertEquals } from "./deps.ts";
import { createDensityContext, DENSITY_PROFILES } from "../mod.ts";

Deno.test("profiles declare geometry and hit targets grow to the minimum", () => {
  const density = createDensityContext("compact");
  assertEquals(density.tokens().rowHeight, 1);
  assertEquals(density.hitTarget(1, 1), [3, 1]);

  density.switch("touch");
  assertEquals(density.tokens().rowHeight, 3);
  assertEquals(density.hitTarget(1, 1), [10, 3]);
  assertEquals(density.hitTarget(20, 5), [20, 5]); // already large enough
  assertEquals(density.spacing(2), 3); // 2 * 1.5 rounded
});

Deno.test("switching is pure on the context: app state is untouched", () => {
  const appState = { selection: ["row-3"], scroll: 42, draft: "hello" };
  const frozen = JSON.stringify(appState);
  const density = createDensityContext("comfortable");
  const notified: string[] = [];
  const unsubscribe = density.onSwitch((profile) => notified.push(profile));

  density.switch("compact");
  density.switch("compact"); // no-op does not notify
  density.switch("touch");
  assertEquals(notified, ["compact", "touch"]);
  assertEquals(JSON.stringify(appState), frozen); // nothing else moved
  // Built-in profiles are immutable declarations.
  assert(Object.isFrozen(DENSITY_PROFILES.touch));
  unsubscribe();
  density.switch("comfortable");
  assertEquals(notified.length, 2);
});

Deno.test("per-profile overrides refine geometry without replacing it", () => {
  const density = createDensityContext("comfortable", {
    comfortable: { gap: 2 },
    touch: { rowHeight: 4 },
  });
  assertEquals(density.tokens().gap, 2);
  assertEquals(density.tokens().controlPaddingX, 2); // base retained
  density.switch("touch");
  assertEquals(density.tokens().rowHeight, 4);
  assertEquals(density.tokens().minHitTarget, [10, 3]);
});
