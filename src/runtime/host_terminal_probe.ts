// Copyright 2023 Im-Beast. MIT license.
import { runtimeHost } from "./host.ts";

/** Capability answers collected in one bounded pre-launch host terminal round trip. */
export interface HostTerminalProbe {
  /**
   * Whether the host answered the kitty graphics query with `OK`. `undefined`
   * means the host stayed silent and callers should fall back to env detection.
   */
  readonly graphics?: boolean;
  /** Host terminal cell dimensions in pixels from `XTWINOPS 16t`, when positive. */
  readonly cellPixels?: { readonly width: number; readonly height: number };
  /** Whether `DECRQM ?2026$p` reported host support for synchronized output. */
  readonly synchronizedOutput?: boolean;
  /**
   * `DECRQM ?2027$p` state: enable `?2027h` only when currently `"reset"`,
   * never turning off a host that defaults grapheme clustering `"set"`.
   */
  readonly graphemeClustering?: "set" | "reset" | "unsupported";
}

/** Image id reserved for the single-pixel kitty graphics support probe. */
export const HOST_TERMINAL_PROBE_IMAGE_ID = 4_242_424;

/** Single-write query batch sent before entering full-screen TUI mode, closed by DA1 (`CSI c`). */
export const HOST_TERMINAL_PROBE_SEQUENCE =
  `\x1b[?2026$p\x1b[?2027$p\x1b_Gi=${HOST_TERMINAL_PROBE_IMAGE_ID},a=q,t=d,f=24,s=1,v=1;AAAA\x1b\\\x1b[16t\x1b[c`;

/**
 * Pure parser for the accumulated reply bytes returned by {@linkcode HOST_TERMINAL_PROBE_SEQUENCE}.
 * Recognizes kitty graphics APC replies for {@linkcode HOST_TERMINAL_PROBE_IMAGE_ID},
 * `XTWINOPS` cell pixel sizes (`CSI 6 ; h ; w t`), and `DECRQM` replies for
 * modes `2026` (synchronized output) and `2027` (grapheme clustering).
 */
export function parseHostTerminalProbeReplies(seen: string): HostTerminalProbe {
  const result: {
    graphics?: boolean;
    cellPixels?: { width: number; height: number };
    synchronizedOutput?: boolean;
    graphemeClustering?: "set" | "reset" | "unsupported";
  } = {};
  const graphics = new RegExp(`\\x1b_Gi=${HOST_TERMINAL_PROBE_IMAGE_ID}[^;]*;([^\\x1b]*)\\x1b\\\\`).exec(seen);
  if (graphics) result.graphics = graphics[1] === "OK";
  const cell = /\x1b\[6;(\d+);(\d+)t/.exec(seen);
  if (cell) {
    const height = Number(cell[1]);
    const width = Number(cell[2]);
    if (width > 0 && height > 0) result.cellPixels = { width, height };
  }
  const syncMode = /\x1b\[\?2026;([0-4])\$y/.exec(seen);
  if (syncMode) {
    const value = Number(syncMode[1]);
    result.synchronizedOutput = value === 1 || value === 2 || value === 3;
  }
  const graphemeMode = /\x1b\[\?2027;([0-4])\$y/.exec(seen);
  if (graphemeMode) {
    const value = Number(graphemeMode[1]);
    result.graphemeClustering = value === 1 || value === 3 ? "set" : value === 2 ? "reset" : "unsupported";
  }
  return result;
}

/**
 * Returns true once the host probe has received either both graphics + cell-size
 * answers or the closing primary Device Attributes (`DA1`) reply sentinel.
 */
export function hostTerminalProbeComplete(seen: string): boolean {
  const parsed = parseHostTerminalProbeReplies(seen);
  if (parsed.graphics !== undefined && parsed.cellPixels) return true;
  return /\x1b\[\?[0-9;]*c/.test(seen);
}

/**
 * Queries the interactive host terminal once before the TUI owns stdin/stdout
 * for synchronized output (`?2026`), grapheme clustering (`?2027`), kitty
 * graphics, and cell pixel geometry, bounded by `deadlineMs` and closed by DA1.
 */
export async function probeHostTerminal(deadlineMs = 300): Promise<HostTerminalProbe> {
  if (!runtimeHost.stdin.isTerminal() || !runtimeHost.stdout.isTerminal()) return {};
  try {
    runtimeHost.stdin.setRaw(true);
  } catch {
    return {};
  }
  try {
    await runtimeHost.stdout.write(new TextEncoder().encode(HOST_TERMINAL_PROBE_SEQUENCE));
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(256);
    let seen = "";
    const deadline = Date.now() + deadlineMs;
    while (Date.now() < deadline) {
      const read = await Promise.race([
        runtimeHost.stdin.read(buffer),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(10, deadline - Date.now()))),
      ]);
      if (read === null || read === 0) break;
      seen += decoder.decode(buffer.subarray(0, read));
      if (hostTerminalProbeComplete(seen) || seen.length > 1024) break;
    }
    return parseHostTerminalProbeReplies(seen);
  } catch {
    return {};
  } finally {
    try {
      runtimeHost.stdin.setRaw(false);
    } catch {
      // Callers re-enter raw mode when starting the TUI.
    }
  }
}
