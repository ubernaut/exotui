// Copyright 2023 Im-Beast. MIT license.

// A drawn (software) mouse cursor for apps that own their whole surface.
//
// A workbench desktop that paints every cell itself can draw its own pointer:
// a block glyph at the tracked mouse cell that turns into a contextual
// resize/move glyph over a floating window's drag edges. Free motion requires
// xterm any-motion tracking (DECSET 1003), which downgrades easily — the
// library's own ENABLE_MOUSE re-asserts button-event tracking (1002) from
// `Tui.run()` — so the tracking helper keeps 1003 re-asserted on a light
// keepalive while the cursor is on and always restores the terminal on
// teardown. Promoted from the exomux terminal multiplexer.

import type { Rectangle } from "../types.ts";
import type { WorkbenchWindowHostProjection } from "./workbench_window_host.ts";

/** The software cursor's cell and glyph for one frame. */
export interface SoftwareCursorRender {
  readonly column: number;
  readonly row: number;
  readonly glyph: string;
}

function cursorCellIn(rect: Rectangle, column: number, row: number): boolean {
  return column >= rect.column && column < rect.column + rect.width &&
    row >= rect.row && row < rect.row + rect.height;
}

/**
 * The contextual drag glyph for one desktop cell: a move glyph on a floating
 * window's title row, resize arrows on its edges and corners, nothing inside
 * its content or off any window.
 */
export function windowResizeGlyphAt(
  projection: WorkbenchWindowHostProjection,
  column: number,
  row: number,
): string | undefined {
  for (let index = projection.floatingWindows.length - 1; index >= 0; index -= 1) {
    const window = projection.floatingWindows[index]!;
    if (!cursorCellIn(window.rect, column, row)) continue;
    if (cursorCellIn(window.clientRect, column, row)) return undefined; // inside the content
    const rect = window.rect;
    const onLeft = column === rect.column;
    const onRight = column === rect.column + rect.width - 1;
    const onBottom = row === rect.row + rect.height - 1;
    if (row === rect.row) return "✥"; // the title-bar row drags to move
    if (onBottom && onLeft) return "⤢"; // bottom-left ↔ top-right resize
    if (onBottom && onRight) return "⤡"; // bottom-right ↔ top-left resize
    if (onLeft || onRight) return "↔"; // side edges resize width
    if (onBottom) return "↕"; // bottom edge resizes height
    return undefined;
  }
  return undefined;
}

/**
 * Software-cursor render descriptor for one frame: the pointer cell with its
 * contextual glyph, or undefined while hidden. Pass `resizeAware: false` while
 * a modal or menu is up — the windows underneath cannot be dragged, so the
 * cursor stays a plain block instead of dangling an arrow that does nothing.
 */
export function softwareCursorRender(
  visible: boolean,
  pointer: { readonly column: number; readonly row: number } | undefined,
  projection: WorkbenchWindowHostProjection,
  resizeAware = true,
): SoftwareCursorRender | undefined {
  if (!visible || !pointer) return undefined;
  const glyph = resizeAware ? windowResizeGlyphAt(projection, pointer.column, pointer.row) ?? "█" : "█";
  return { column: pointer.column, row: pointer.row, glyph };
}

/** Options for configuring any-motion tracking. */
export interface AnyMotionTrackingOptions {
  /** Writes one control sequence to the terminal; defaults to stdout (guarded). */
  write?: (sequence: string) => void;
  /** How often mode 1003 is re-asserted while enabled. */
  keepaliveMs?: number;
  /** Timer injection for deterministic tests; defaults to setInterval/clearInterval. */
  schedule?: (callback: () => void, intervalMs: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/** Live any-motion tracking state; always dispose() so the terminal is restored. */
export interface AnyMotionTracking {
  /** Turns free-motion reporting on or off (idempotent). */
  setEnabled(enabled: boolean): void;
  /** True while mode 1003 is asserted. */
  readonly enabled: boolean;
  /** Disables tracking and stops the keepalive. */
  dispose(): void;
}

const ANY_MOTION_ENABLE = "\x1b[?1003h";
const ANY_MOTION_DISABLE = "\x1b[?1003l";
const DEFAULT_KEEPALIVE_MS = 1_000;

const anyMotionEncoder = new TextEncoder();
function defaultAnyMotionWrite(sequence: string): void {
  try {
    Deno.stdout.writeSync(anyMotionEncoder.encode(sequence));
  } catch {
    // No writable terminal (headless/tests) — nothing to toggle.
  }
}

/**
 * Creates the mode-1003 lifecycle a software cursor needs: enable, keepalive
 * re-assertion (so a later ENABLE_MOUSE can never silently downgrade motion
 * back to click-only), and teardown that leaves the terminal as found.
 */
export function createAnyMotionTracking(options: AnyMotionTrackingOptions = {}): AnyMotionTracking {
  const write = options.write ?? defaultAnyMotionWrite;
  const keepaliveMs = Math.max(50, Math.floor(options.keepaliveMs ?? DEFAULT_KEEPALIVE_MS));
  const schedule = options.schedule ?? ((callback, intervalMs) => setInterval(callback, intervalMs));
  const cancel = options.cancel ?? ((handle) => clearInterval(handle as number));
  let keepalive: unknown;
  let enabled = false;
  const stopKeepalive = (): void => {
    if (keepalive === undefined) return;
    cancel(keepalive);
    keepalive = undefined;
  };
  return {
    get enabled(): boolean {
      return enabled;
    },
    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      write(next ? ANY_MOTION_ENABLE : ANY_MOTION_DISABLE);
      stopKeepalive();
      // A plain mode set is invisible and idempotent, so re-asserting is safe.
      if (next) keepalive = schedule(() => write(ANY_MOTION_ENABLE), keepaliveMs);
    },
    dispose(): void {
      if (enabled) {
        enabled = false;
        write(ANY_MOTION_DISABLE);
      }
      stopKeepalive();
    },
  };
}
