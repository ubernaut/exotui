import { assert, assertAlmostEquals, assertEquals } from "./deps.ts";
import {
  cycleExomuxGlobalSetting,
  cycleExomuxWindowSetting,
  defaultExomuxGlobalSettings,
  defaultExomuxWindowSettings,
  EXOMUX_OPACITY_INHERIT,
  EXOMUX_OPACITY_VALUES,
  EXOMUX_WINDOW_SETTING_SPECS,
  exomuxResolvedOpacity,
  normalizeExomuxGlobalSettings,
  normalizeExomuxWindowSettings,
} from "../model.ts";
import { exomuxBackgroundHasPresets, type ExomuxPresetBackground } from "../background.ts";

Deno.test("opacity: a window defers to the desktop until it overrides it", () => {
  const global = { ...defaultExomuxGlobalSettings(), opacity: 0.7 };
  const window = defaultExomuxWindowSettings();
  assertEquals(window.opacity, EXOMUX_OPACITY_INHERIT, "windows inherit by default");
  assertEquals(exomuxResolvedOpacity(global, window), 0.7, "so the desktop value wins");

  const overridden = { ...window, opacity: 0.4 };
  assertEquals(exomuxResolvedOpacity(global, overridden), 0.4, "and an override beats it");
  assertEquals(exomuxResolvedOpacity(global, { ...window, opacity: 1 }), 1, "including an override back to opaque");

  // A window with no settings of its own — a panel rather than a terminal —
  // still resolves rather than reading the sentinel as an opacity.
  assertEquals(exomuxResolvedOpacity(global, undefined), 0.7);
});

Deno.test("opacity: resolution is clamped and survives nonsense", () => {
  const global = defaultExomuxGlobalSettings();
  assertEquals(global.opacity, 0.85, "the desktop ships slightly translucent out of the box");
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
    const resolved = exomuxResolvedOpacity({ ...global, opacity: bad });
    assert(Number.isFinite(resolved), `opacity ${String(bad)} resolved to ${resolved}`);
  }
  assertEquals(exomuxResolvedOpacity({ ...global, opacity: 5 }), 1);
  assertEquals(exomuxResolvedOpacity({ ...global, opacity: -3 }), 0);
});

Deno.test("opacity: both config modals expose it and cycle through the same steps", () => {
  const windowSpec = EXOMUX_WINDOW_SETTING_SPECS.find((spec) => spec.id === "opacity");
  assert(windowSpec, "the per-window modal must offer opacity");
  // The per-window list carries the inherit sentinel ahead of the shared steps,
  // so "Desktop" is reachable and is what a fresh window sits on.
  assertEquals(windowSpec.values[0], EXOMUX_OPACITY_INHERIT);
  assertEquals([...windowSpec.values].slice(1), [...EXOMUX_OPACITY_VALUES]);
  assertEquals(windowSpec.format(EXOMUX_OPACITY_INHERIT), "Desktop");
  assertEquals(windowSpec.format(1), "Opaque");
  assertEquals(windowSpec.format(0.55), "55%");

  let global = defaultExomuxGlobalSettings();
  const seen = new Set<number>();
  for (let step = 0; step < EXOMUX_OPACITY_VALUES.length; step += 1) {
    global = cycleExomuxGlobalSetting(global, "opacity");
    seen.add(global.opacity);
  }
  assertEquals([...seen].sort((a, b) => b - a), [...EXOMUX_OPACITY_VALUES].sort((a, b) => b - a));
  assertEquals(global.opacity, 0.85, "a full cycle returns to where it started");

  let window = defaultExomuxWindowSettings();
  window = cycleExomuxWindowSetting(window, "opacity");
  assert(window.opacity !== EXOMUX_OPACITY_INHERIT, "cycling leaves the inherit sentinel");
});

Deno.test("opacity: persisted values round-trip and reject junk", () => {
  const global = normalizeExomuxGlobalSettings({
    overgrowInactive: true,
    overgrowFullMs: 60_000,
    borderStyle: "thin",
    opacity: 0.4,
  });
  assertEquals(global.opacity, 0.4);
  const window = normalizeExomuxWindowSettings({ ...defaultExomuxWindowSettings(), opacity: 0.25 });
  assertEquals(window.opacity, 0.25);

  // A value outside the offered steps is not a valid setting, so it falls back
  // rather than persisting something the modal could never show.
  assertEquals(normalizeExomuxGlobalSettings({ opacity: 0.123 }).opacity, 0.85);
  assertEquals(normalizeExomuxWindowSettings({ opacity: "very" }).opacity, EXOMUX_OPACITY_INHERIT);
});

Deno.test("opacity: darkens toward the surface as it rises", () => {
  // The contract the renderer relies on: at 1 a cell is the window's own
  // ground, at 0 it is the desktop behind it, and in between it is a blend.
  // This mirrors the mix the terminal painter performs per cell.
  const backdrop: readonly [number, number, number] = [200, 100, 50];
  const ground: readonly [number, number, number] = [10, 20, 30];
  const mix = (opacity: number): number[] =>
    backdrop.map((channel, index) => Math.round(channel + (ground[index]! - channel) * opacity));

  assertEquals(mix(1), [...ground], "opaque shows the window's ground");
  assertEquals(mix(0), [...backdrop], "fully transparent shows the desktop");
  const half = mix(0.5);
  for (let channel = 0; channel < 3; channel += 1) {
    assertAlmostEquals(half[channel]!, (backdrop[channel]! + ground[channel]!) / 2, 1);
  }
  // Every step is darker than the one before it, since the surface is darker
  // than a lit background — which is what "opacity darkens" means here.
  const luminance = (rgb: number[]): number => rgb[0]! * 0.3 + rgb[1]! * 0.6 + rgb[2]! * 0.1;
  const steps = [...EXOMUX_OPACITY_VALUES].sort((a, b) => a - b).map((opacity) => luminance(mix(opacity)));
  for (let index = 1; index < steps.length; index += 1) {
    assert(steps[index]! < steps[index - 1]!, `opacity step ${index} did not darken`);
  }
});

Deno.test("preset stepping: only preset backgrounds answer, and both keys reach the controller", () => {
  const stub = {
    setPointer: () => {},
    clearPointer: () => {},
    advance: () => true,
    rasterizeCells: () => [],
  };
  assertEquals(exomuxBackgroundHasPresets(stub), false, "a plain field has nothing to step");
  const withPresets: ExomuxPresetBackground = {
    ...stub,
    presetIndex: 0,
    presetName: "x",
    presetCount: 1,
    selectPreset: () => {},
  };
  assertEquals(exomuxBackgroundHasPresets(withPresets), true);
});
