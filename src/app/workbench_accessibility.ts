// Copyright 2023 Im-Beast. MIT license.

// 036 T3: workbench accessibility as CHECKED DATA. High-contrast and
// color-blind-safe palettes are declared in RGB and verified by the
// THEM-004 contrast machinery (high contrast at >= 7:1, color-blind
// pairs avoiding red/green opposition); every workbench control carries
// a role and accessible name from the T3 tree vocabulary; the workbench
// motion set declares reduced-motion substitutions for each transition
// through THEM-008. The keyboard-only acceptance and gate assertions
// live in the test suite, which drives a real pilot app with keys alone.

import type { Rgb } from "../theme_expressions.ts";
import type { AccessibilityRole } from "./accessibility_tree.ts";
import { createMotionContext, type MotionContext } from "../theme_motion.ts";

/** High-contrast palette: verified >= 7:1 against its surface. */
export const HIGH_CONTRAST_PALETTE: Readonly<Record<string, Rgb>> = Object.freeze({
  surface: [0, 0, 0],
  foreground: [255, 255, 255],
  accent: [255, 255, 0],
  success: [0, 255, 128],
  warning: [255, 200, 0],
  danger: [255, 140, 140],
  muted: [200, 200, 200],
});

/**
 * Color-blind-safe palette (deuteranopia/protanopia oriented): success
 * and danger are blue vs orange, never green vs red.
 */
export const COLOR_BLIND_SAFE_PALETTE: Readonly<Record<string, Rgb>> = Object.freeze({
  surface: [10, 12, 16],
  foreground: [235, 235, 235],
  accent: [86, 180, 233], // sky blue (Okabe-Ito)
  success: [120, 190, 255], // light blue
  warning: [230, 159, 0], // orange
  danger: [213, 94, 0], // vermillion
  muted: [170, 170, 170],
});

/** Roles and accessible names for every workbench control surface. */
export const WORKBENCH_CONTROL_ACCESSIBILITY: Readonly<
  Record<string, { readonly role: AccessibilityRole; readonly label: string }>
> = Object.freeze({
  "menu-bar": { role: "menu", label: "Workbench menu" },
  "status-bar": { role: "status", label: "Status" },
  "terminal-pane": { role: "log", label: "Terminal output" },
  "session-tabs": { role: "tablist", label: "Sessions" },
  "buffer-list": { role: "list", label: "Buffers" },
  "file-explorer": { role: "tree", label: "Files" },
  "command-palette": { role: "textbox", label: "Command palette" },
  "settings-dialog": { role: "dialog", label: "Settings" },
  "shelf": { role: "group", label: "Shelf" },
  "toast-area": { role: "status", label: "Notifications" },
});

/** The workbench motion set with reduced-motion substitutions declared. */
export function createWorkbenchMotion(options: { readonly reducedMotion?: boolean } = {}): MotionContext {
  const motion = createMotionContext(options);
  motion.declare("workbench:pane-slide", {
    durationMs: 160,
    easing: "ease-out",
    staticBehavior: "jump-to-end",
  });
  motion.declare("workbench:toast-fade", {
    durationMs: 250,
    easing: "linear",
    staticBehavior: "instant-fade",
  });
  motion.declare("workbench:modal-open", {
    durationMs: 120,
    easing: "ease-in-out",
    staticBehavior: "jump-to-end",
  });
  motion.declare("workbench:focus-flash", {
    durationMs: 140,
    easing: "ease-in-out",
    essential: true, // conveys focus: keeps a short motion under reduce
    staticBehavior: "none",
    essentialReducedMs: 60,
  });
  return motion;
}
