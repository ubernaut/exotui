// Copyright 2023 Im-Beast. MIT license.

// The names the background fields speak, bound to the generic
// animated-background contract and the shared theme catalog. The fields moved
// here from exomux verbatim; this module is the vocabulary that let them move
// without a body change.

import type {
  AnimatedBackground,
  AnimatedBackgroundAdvanceOptions,
  AnimatedBackgroundCell,
  AnimatedBackgroundOverlayCell,
  AnimatedBackgroundPoint,
  DisposableAnimatedBackground,
  InteractiveAnimatedBackground,
  OverlayAnimatedBackground,
  PresetAnimatedBackground,
} from "../animated_background.ts";
import { mixAnimatedBackgroundRgb } from "../animated_background.ts";
import type { ShellRgb, ShellThemeSpec } from "../shell_theme.ts";

/** A background field drawing with the shared theme catalog's colours. */
export type ShellAnimatedBackground = AnimatedBackground<ShellThemeSpec>;

/** Advance options, unchanged from the generic contract. */
export type ShellBackgroundAdvanceOptions = AnimatedBackgroundAdvanceOptions;

/** One painted background cell; undefined cells stay the theme ground. */
export type ShellBackgroundCell = AnimatedBackgroundCell;

/** A pointer position in desktop cells. */
export type ShellBackgroundPoint = AnimatedBackgroundPoint;

/** Linear blend between two theme colours; `mix` is clamped to [0, 1]. */
export function mixShellRgb(from: ShellRgb, to: ShellRgb, mix: number): ShellRgb {
  return mixAnimatedBackgroundRgb(from, to, mix);
}

/** A cell painted after the windows, for fields with a foreground layer. */
export type ShellOverlayCell = AnimatedBackgroundOverlayCell;

/** A field that also paints an overlay above the windows. */
export type ShellOverlayBackground = OverlayAnimatedBackground<ShellThemeSpec>;

/** A field that reacts to pointer picks beyond attraction. */
export type ShellInteractiveBackground = InteractiveAnimatedBackground<ShellThemeSpec>;

/** A field with named presets the host can cycle. */
export type ShellPresetBackground = PresetAnimatedBackground<ShellThemeSpec>;

/** A field owning resources that must be released when it is swapped out. */
export type ShellDisposableBackground = DisposableAnimatedBackground<ShellThemeSpec>;
