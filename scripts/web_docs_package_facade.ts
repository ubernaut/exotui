// The docs bundle's stand-in for the "@ubernaut/exotui" package name: only
// what exomux's browser-portable modules actually import, each from its
// concrete source file, so the bundle carries the modules and not the root.

export { grWizardThemePalettes } from "../src/grwizard_themes.ts";
export { SURFACE_ANIMATION_KINDS } from "../src/surface_animation.ts";
export type { SurfaceAnimationChoice, SurfaceAnimationSpeed } from "../src/surface_animation.ts";
export { SHELL_T2_SWATCHES, SHELL_THEMES, shellControlColor } from "../src/app/shell_theme.ts";
export * from "../src/app/animated_background.ts";
export * from "../src/app/backgrounds/gpu_device.ts";
export type { Rectangle } from "../src/types.ts";
export type { AnsiFlushTelemetry } from "../src/canvas/sink.ts";
