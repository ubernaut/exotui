// Copyright 2026 ubernaut. MIT license.

// Local host clipboard reading and paste sanitization are now core exotui
// runtime primitives (`host_desktop.ts`). Exomux binds them to its protocol
// input frame budget.

import { readLocalHostClipboard, sanitizeTerminalClipboardPaste } from "@ubernaut/exotui/terminal";
import { EXOMUX_PROTOCOL_LIMITS } from "./protocol.ts";

const MAX_CLIPBOARD_BYTES = EXOMUX_PROTOCOL_LIMITS.inputBytes - 12;

/** Reads the clipboard of the machine running the viewer, not the daemon. */
export function readExomuxLocalClipboard(): Promise<string | undefined> {
  return readLocalHostClipboard({ maxBytes: MAX_CLIPBOARD_BYTES });
}

/** Keep pasted text bounded and prevent it from closing bracketed-paste mode. */
export function sanitizeExomuxClipboard(text: string): string | undefined {
  return sanitizeTerminalClipboardPaste(text, MAX_CLIPBOARD_BYTES);
}
