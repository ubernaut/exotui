// Copyright 2023 Im-Beast. MIT license.

// Sticky DEC private mode, cursor-shape, and keyboard-protocol tracking is now
// a core exotui runtime module (`terminal_modes.ts`). Exomux re-exports it
// under its existing names so host sessions and tests stay unchanged.

export {
  type TerminalModeInspection as ExomuxTerminalModeInspection,
  TerminalModeTracker as ExomuxTerminalModeTracker,
} from "@ubernaut/exotui/terminal";
