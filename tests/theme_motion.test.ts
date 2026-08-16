// Copyright 2023 Im-Beast. MIT license.

// THEM-008: reduced motion resolves every nonessential transition to its
// declared static behavior.

import { assert, assertEquals } from "./deps.ts";
import { createMotionContext, easingValue } from "../mod.ts";

function context(reduced: boolean) {
  const motion = createMotionContext({ reducedMotion: reduced });
  motion.declare("panel:slide", { durationMs: 200, easing: "ease-out", delayMs: 20, staticBehavior: "jump-to-end" });
  motion.declare("toast:fade", { durationMs: 300, easing: "linear", staticBehavior: "instant-fade" });
  motion.declare("focus:flash", {
    durationMs: 150,
    easing: "ease-in-out",
    essential: true,
    staticBehavior: "none",
    essentialReducedMs: 60,
  });
  return motion;
}

Deno.test("full motion resolves declared duration, easing, and delay", () => {
  const motion = context(false);
  assertEquals(motion.resolve("panel:slide"), { kind: "animate", durationMs: 200, easing: "ease-out", delayMs: 20 });
  assertEquals(motion.resolve("toast:fade"), { kind: "animate", durationMs: 300, easing: "linear", delayMs: 0 });
});

Deno.test("reduced motion substitutes every nonessential transition", () => {
  const motion = context(true);
  assertEquals(motion.resolve("panel:slide"), { kind: "static", behavior: "jump-to-end" });
  assertEquals(motion.resolve("toast:fade"), { kind: "static", behavior: "instant-fade" });
  // Essential transitions keep short meaningful motion instead of vanishing.
  assertEquals(motion.resolve("focus:flash"), { kind: "animate", durationMs: 60, easing: "linear", delayMs: 0 });
  // The substitution table covers exactly the nonessential tokens.
  assertEquals(motion.reducedSubstitutions(), [
    { name: "panel:slide", behavior: "jump-to-end" },
    { name: "toast:fade", behavior: "instant-fade" },
  ]);
  // Undeclared names are total too: no motion.
  assertEquals(motion.resolve("never:declared"), { kind: "static", behavior: "jump-to-end" });

  // The live toggle flips resolution without redeclaration.
  motion.setReducedMotion(false);
  assertEquals(motion.resolve("panel:slide").kind, "animate");
});

Deno.test("easing curves anchor at 0 and 1 and stay monotone", () => {
  for (const easing of ["linear", "ease-in", "ease-out", "ease-in-out"] as const) {
    assertEquals(easingValue(easing, 0), 0);
    assertEquals(easingValue(easing, 1), 1);
    let previous = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const value = easingValue(easing, t);
      assert(value >= previous - 1e-9, `${easing} regressed at ${t}`);
      previous = value;
    }
  }
  assertEquals(easingValue("ease-in-out", 0.5), 0.5);
  assert(easingValue("ease-in", 0.5) < 0.5 && easingValue("ease-out", 0.5) > 0.5);
});
