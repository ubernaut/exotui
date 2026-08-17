import { assert, assertEquals } from "./deps.ts";
import { SURFACE_ANIMATION_KINDS } from "@ubernaut/deno-tui";
import {
  cycleExomuxGlobalSetting,
  defaultExomuxGlobalSettings,
  EXOMUX_GLOBAL_SETTING_SPECS,
  normalizeExomuxGlobalSettings,
} from "../model.ts";

Deno.test("Exomux ships window-animation settings with sane defaults (039)", () => {
  const defaults = defaultExomuxGlobalSettings();
  assertEquals(defaults.animationSpeed, "normal");
  assertEquals(defaults.animationClose, "disintegrate");
  assertEquals(defaults.animationMinimize, "fade");
  assertEquals(defaults.animationMaximize, "fade");
  assertEquals(defaults.animationRestore, "fade");
  assertEquals(defaults.animationMenus, "fade");

  const ids = EXOMUX_GLOBAL_SETTING_SPECS.map((spec) => spec.id);
  for (
    const id of [
      "animationSpeed",
      "animationClose",
      "animationMinimize",
      "animationMaximize",
      "animationRestore",
      "animationMenus",
    ] as const
  ) {
    assert(ids.includes(id), `${id} is a configurable global setting`);
  }

  // Every effect kind plus "random" is selectable for each transition.
  const closeSpec = EXOMUX_GLOBAL_SETTING_SPECS.find((spec) => spec.id === "animationClose");
  assert(closeSpec);
  for (const kind of SURFACE_ANIMATION_KINDS) assert(closeSpec.values.includes(kind));
  assert(closeSpec.values.includes("random"));

  // "off" lives on the speed cycle so animations can be disabled outright.
  const speedSpec = EXOMUX_GLOBAL_SETTING_SPECS.find((spec) => spec.id === "animationSpeed");
  assert(speedSpec);
  assert(speedSpec.values.includes("off"));
});

Deno.test("Exomux animation settings cycle and normalize like every other global setting", () => {
  const defaults = defaultExomuxGlobalSettings();
  const cycled = cycleExomuxGlobalSetting(defaults, "animationClose", 1);
  assert(cycled.animationClose !== defaults.animationClose);

  // Unknown persisted values fall back to the defaults, not to garbage.
  const normalized = normalizeExomuxGlobalSettings({
    ...defaults,
    animationSpeed: "warp",
    animationClose: 42,
  });
  assertEquals(normalized.animationSpeed, "normal");
  assertEquals(normalized.animationClose, "disintegrate");
});
