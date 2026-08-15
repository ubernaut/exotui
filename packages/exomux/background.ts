// Copyright 2023 Im-Beast. MIT license.

// The animated-background contract is now a first-class exotui app primitive
// (`AnimatedBackground` and friends, promoted from this file — WS-009).
// Exomux consumes it under its existing names, instantiated on its theme spec,
// so every background field and the desktop compositor are unchanged; any
// other app can host the same fields (or its own) through
// `@ubernaut/deno-tui`'s generic contract. The field implementations
// themselves (metaballs, matrix, circuit, butterchurn GPU, …) still live here
// in exomux — their relocation is tracked separately.

import {
  type AnimatedBackground,
  animatedBackgroundAcceptsPicks,
  type AnimatedBackgroundAdvanceOptions,
  type AnimatedBackgroundCell,
  animatedBackgroundHasOverlay,
  animatedBackgroundHasPresets,
  type AnimatedBackgroundOverlayCell,
  type AnimatedBackgroundPoint,
  type DisposableAnimatedBackground,
  type InteractiveAnimatedBackground,
  mixAnimatedBackgroundRgb,
  type OverlayAnimatedBackground,
  type PresetAnimatedBackground,
  releaseIdleAnimatedBackgrounds,
} from "@ubernaut/deno-tui";
import type { ExomuxBackgroundId, ExomuxRgb, ExomuxThemeSpec } from "./model.ts";

/** Shared cadence for every animated desktop background. */
export const EXOMUX_BACKGROUND_FRAME_INTERVAL_MS = 125;

/** One painted background cell over the theme background color; undefined cells stay blank. */
export type ExomuxBackgroundCell = AnimatedBackgroundCell;

/** Pointer position in desktop cell coordinates. */
export type ExomuxBackgroundPoint = AnimatedBackgroundPoint;

/** Per-frame simulation inputs shared by every background field. */
export type ExomuxBackgroundAdvanceOptions = AnimatedBackgroundAdvanceOptions;

/** Contract every selectable Exomux desktop background implements. */
export type ExomuxAnimatedBackground = AnimatedBackground<ExomuxThemeSpec>;

/** A single positioned cell for post-window overlay painting. */
export type ExomuxOverlayCell = AnimatedBackgroundOverlayCell;

/** Backgrounds that paint effects on top of window chrome. */
export type ExomuxOverlayBackground = OverlayAnimatedBackground<ExomuxThemeSpec>;

/** Backgrounds that answer clicks on bare desktop. */
export type ExomuxInteractiveBackground = InteractiveAnimatedBackground<ExomuxThemeSpec>;

/** Backgrounds built from a catalog of presets the user can step through. */
export type ExomuxPresetBackground = PresetAnimatedBackground<ExomuxThemeSpec>;

/** A background field that holds a resource it must give back when idle. */
export type ExomuxDisposableBackground = DisposableAnimatedBackground<ExomuxThemeSpec>;

/** Narrows a background to one that paints post-window overlays. */
export function exomuxBackgroundHasOverlay(
  field: ExomuxAnimatedBackground | undefined,
): field is ExomuxOverlayBackground {
  return animatedBackgroundHasOverlay(field);
}

/** Narrows a background to one that accepts clicks. */
export function exomuxBackgroundAcceptsPicks(
  field: ExomuxAnimatedBackground | undefined,
): field is ExomuxInteractiveBackground {
  return animatedBackgroundAcceptsPicks(field);
}

/** Narrows a background to one the user can step through. */
export function exomuxBackgroundHasPresets(
  field: ExomuxAnimatedBackground | undefined,
): field is ExomuxPresetBackground {
  return animatedBackgroundHasPresets(field);
}

/** Narrows a background to one that owns a releasable resource. */
export function exomuxBackgroundIsDisposable(
  field: ExomuxAnimatedBackground | undefined,
): field is ExomuxDisposableBackground {
  return typeof (field as ExomuxDisposableBackground | undefined)?.dispose === "function";
}

/** Disposes and drops every cached field except `keep`, in place. */
export function releaseExomuxIdleBackgrounds(
  fields: Map<ExomuxBackgroundId, ExomuxAnimatedBackground>,
  keep?: ExomuxBackgroundId,
): void {
  releaseIdleAnimatedBackgrounds(fields, keep);
}

/** Linear blend between two theme colors; `mix` is clamped to [0, 1]. */
export function mixExomuxRgb(from: ExomuxRgb, to: ExomuxRgb, mix: number): ExomuxRgb {
  return mixAnimatedBackgroundRgb(from, to, mix);
}
