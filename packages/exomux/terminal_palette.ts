// Copyright 2023 Im-Beast. MIT license.

// Terminal color resolution is now a first-class exotui runtime module
// (`terminal_palette.ts`, promoted from this file — WS-002): xterm-256 palette
// resolution, WCAG contrast lift for theme-mapped ANSI text, and the shared
// per-cell style resolver. Exomux consumes it under its existing names so the
// terminal painter and tests are unchanged; any other app can render a PTY
// screen with the same fidelity via `@ubernaut/exotui/terminal` or the
// `TerminalScreen` component.

import type { ExomuxRgb } from "./model.ts";
import { terminalPaletteRgb, terminalReadableForegroundRgb } from "@ubernaut/exotui/terminal";

/** Resolves compact TerminalScreen SGR values through the xterm color palette. */
export function exomuxTerminalRgb(code: number | undefined, background: boolean): ExomuxRgb | undefined {
  return terminalPaletteRgb(code, background);
}

/** Resolves theme-remappable ANSI text and raises it to readable contrast. */
export function exomuxTerminalForegroundRgb(
  code: number | undefined,
  background: ExomuxRgb,
  preferredText: ExomuxRgb,
): ExomuxRgb | undefined {
  return terminalReadableForegroundRgb(code, background, preferredText);
}
