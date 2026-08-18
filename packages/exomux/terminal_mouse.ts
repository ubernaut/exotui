// Copyright 2023 Im-Beast. MIT license.

import {
  contains,
  encodeTerminalMouse,
  POINTER_INPUT_SCHEMA_VERSION,
  type PointerInputEvent,
  terminalMouseRoutingFromPrivateModes,
  type WorkbenchWindowChromeProjection,
  type WorkbenchWindowHostProjection,
} from "@ubernaut/deno-tui";
import type { MousePressEvent, MouseScrollEvent } from "@ubernaut/deno-tui";
import type { ExomuxController, ExomuxTerminalRuntime } from "./controller.ts";
import { exomuxSessionIdFromWindow } from "./model.ts";

const MAX_TERMINAL_POINTER_CAPTURES = 8;

/** One child-local SGR packet and the stable daemon session that must receive it. */
export interface ExomuxTerminalMousePacket {
  readonly sessionId: string;
  readonly bytes: Uint8Array;
}

/** Builds one normalized cancellation for captured workbench or child gestures. */
export function exomuxPointerCancellationEvent(
  pointerId: number,
  event?: PointerInputEvent,
  legacy?: MousePressEvent,
): PointerInputEvent {
  return {
    schemaVersion: POINTER_INPUT_SCHEMA_VERSION,
    sequence: event?.sequence ?? 0,
    timestamp: event?.timestamp ?? 0,
    source: event?.source ?? (legacy ? "terminal" : "test"),
    trust: event?.trust ?? "synthetic",
    modifiers: event?.modifiers ?? {
      alt: false,
      ctrl: legacy?.ctrl ?? false,
      meta: legacy?.meta ?? false,
      shift: legacy?.shift ?? false,
    },
    pointerId,
    device: event?.device ?? "mouse",
    kind: "cancel",
    coordinates: event?.coordinates ?? {
      cell: { space: "cell", x: legacy?.x ?? 0, y: legacy?.y ?? 0 },
    },
    primary: true,
    button: null,
    buttons: 0,
  };
}

interface ExomuxTerminalPointerCapture {
  readonly sessionId: string;
  readonly windowId: string;
  readonly button: 0 | 1 | 2;
  lastColumn: number;
  lastRow: number;
}

interface ExomuxTerminalMouseTarget {
  readonly runtime: ExomuxTerminalRuntime;
  readonly window: WorkbenchWindowChromeProjection;
}

/**
 * Converts desktop mouse/touch input into child-local xterm SGR packets while
 * keeping chrome gestures and scrollback copy mode owned by the workbench.
 */
export class ExomuxTerminalMouseRouter {
  readonly #controller: ExomuxController;
  readonly #pointerCaptures = new Map<number, ExomuxTerminalPointerCapture>();
  #legacyCapture?: ExomuxTerminalPointerCapture;

  constructor(controller: ExomuxController) {
    this.#controller = controller;
  }

  get hasLegacyCapture(): boolean {
    return this.#legacyCapture !== undefined;
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.#pointerCaptures.has(pointerId);
  }

  cancelPointerCaptures(
    projection: WorkbenchWindowHostProjection,
    event?: PointerInputEvent,
  ): ExomuxTerminalMousePacket[] {
    const packets: ExomuxTerminalMousePacket[] = [];
    for (const [pointerId, capture] of [...this.#pointerCaptures]) {
      this.#pointerCaptures.delete(pointerId);
      const point = pointerId === event?.pointerId ? event.coordinates.cell : undefined;
      const packet = this.#encodeCaptured(
        capture,
        point?.x ?? capture.lastColumn,
        point?.y ?? capture.lastRow,
        projection,
        {
          release: true,
          ctrl: event?.modifiers.ctrl ?? false,
          meta: Boolean(event?.modifiers.meta || event?.modifiers.alt),
          shift: event?.modifiers.shift ?? false,
        },
      );
      if (packet) packets.push(packet);
    }
    return packets;
  }

  cancelLegacyCapture(projection: WorkbenchWindowHostProjection): ExomuxTerminalMousePacket | undefined {
    const capture = this.#legacyCapture;
    this.#legacyCapture = undefined;
    return capture
      ? this.#encodeCaptured(capture, capture.lastColumn, capture.lastRow, projection, {
        release: true,
        ctrl: false,
        meta: false,
        shift: false,
      })
      : undefined;
  }

  cancelAllCaptures(projection: WorkbenchWindowHostProjection): ExomuxTerminalMousePacket[] {
    const packets = this.cancelPointerCaptures(projection);
    const legacy = this.cancelLegacyCapture(projection);
    if (legacy) packets.push(legacy);
    return packets;
  }

  routeLegacyPress(
    event: MousePressEvent,
    projection: WorkbenchWindowHostProjection,
  ): ExomuxTerminalMousePacket | undefined {
    if (event.release) {
      const capture = this.#legacyCapture;
      this.#legacyCapture = undefined;
      return capture
        ? this.#encodeCaptured(capture, event.x, event.y, projection, {
          release: true,
          ctrl: event.ctrl,
          meta: event.meta,
          shift: event.shift,
        })
        : undefined;
    }
    if (event.drag) {
      const capture = this.#legacyCapture;
      return capture
        ? this.#encodeCaptured(capture, event.x, event.y, projection, {
          drag: true,
          ctrl: event.ctrl,
          meta: event.meta,
          shift: event.shift,
        })
        : undefined;
    }
    if (event.button === undefined) return undefined;
    const target = terminalTargetAt(this.#controller, projection, event.x, event.y);
    if (!target) return undefined;
    const packet = encodeForTarget(target, event.x, event.y, {
      button: event.button,
      ctrl: event.ctrl,
      meta: event.meta,
      shift: event.shift,
    });
    if (packet) {
      this.#legacyCapture = {
        sessionId: target.runtime.sessionId,
        windowId: target.window.id,
        button: event.button,
        lastColumn: event.x,
        lastRow: event.y,
      };
    }
    return packet;
  }

  routeLegacyScroll(
    event: MouseScrollEvent,
    projection: WorkbenchWindowHostProjection,
  ): ExomuxTerminalMousePacket | undefined {
    if (event.shift || event.scroll === 0) return undefined;
    const target = terminalTargetAt(this.#controller, projection, event.x, event.y);
    return target
      ? encodeForTarget(target, event.x, event.y, {
        scroll: event.scroll,
        ctrl: event.ctrl,
        meta: event.meta,
        shift: event.shift,
      })
      : undefined;
  }

  routePointer(
    event: PointerInputEvent,
    projection: WorkbenchWindowHostProjection,
  ): ExomuxTerminalMousePacket | undefined {
    if (event.kind === "wheel") {
      if (event.modifiers.shift) return undefined;
      const point = event.coordinates.cell;
      const scroll = Math.sign(event.wheel?.deltaY ?? 0) as -1 | 0 | 1;
      if (!point || scroll === 0) return undefined;
      const target = terminalTargetAt(this.#controller, projection, point.x, point.y);
      return target
        ? encodeForTarget(target, point.x, point.y, {
          scroll,
          ctrl: event.modifiers.ctrl,
          meta: event.modifiers.meta || event.modifiers.alt,
          shift: event.modifiers.shift,
        })
        : undefined;
    }

    const capture = this.#pointerCaptures.get(event.pointerId);
    if (event.kind === "up" || event.kind === "cancel") {
      this.#pointerCaptures.delete(event.pointerId);
      if (!capture) return undefined;
      const point = event.coordinates.cell;
      return this.#encodeCaptured(
        capture,
        point?.x ?? capture.lastColumn,
        point?.y ?? capture.lastRow,
        projection,
        {
          release: true,
          ctrl: event.modifiers.ctrl,
          meta: event.modifiers.meta || event.modifiers.alt,
          shift: event.modifiers.shift,
        },
      );
    }

    if (event.kind === "move") {
      const point = event.coordinates.cell;
      if (!point) return undefined;
      if (capture) {
        return this.#encodeCaptured(capture, point.x, point.y, projection, {
          drag: true,
          ctrl: event.modifiers.ctrl,
          meta: event.modifiers.meta || event.modifiers.alt,
          shift: event.modifiers.shift,
        });
      }
      // Only DECSET 1003 hover is meaningful without a preceding press.
      if (event.device !== "mouse" || event.buttons !== 0) return undefined;
      const target = terminalTargetAt(this.#controller, projection, point.x, point.y);
      return target
        ? encodeForTarget(target, point.x, point.y, {
          drag: true,
          ctrl: event.modifiers.ctrl,
          meta: event.modifiers.meta || event.modifiers.alt,
          shift: event.modifiers.shift,
        })
        : undefined;
    }

    if (event.kind !== "down") return undefined;
    const point = event.coordinates.cell;
    if (!point) return undefined;
    const target = terminalTargetAt(this.#controller, projection, point.x, point.y);
    if (!target) return undefined;
    const button = pointerButton(event);
    if (button === undefined) return undefined;
    const packet = encodeForTarget(target, point.x, point.y, {
      button,
      ctrl: event.modifiers.ctrl,
      meta: event.modifiers.meta || event.modifiers.alt,
      shift: event.modifiers.shift,
    });
    if (packet) {
      if (this.#pointerCaptures.size >= MAX_TERMINAL_POINTER_CAPTURES) return undefined;
      this.#pointerCaptures.set(event.pointerId, {
        sessionId: target.runtime.sessionId,
        windowId: target.window.id,
        button,
        lastColumn: point.x,
        lastRow: point.y,
      });
    }
    return packet;
  }

  clear(): void {
    this.#legacyCapture = undefined;
    this.#pointerCaptures.clear();
  }

  #encodeCaptured(
    capture: ExomuxTerminalPointerCapture,
    column: number,
    row: number,
    projection: WorkbenchWindowHostProjection,
    event: {
      readonly drag?: boolean;
      readonly release?: boolean;
      readonly ctrl: boolean;
      readonly meta: boolean;
      readonly shift: boolean;
    },
  ): ExomuxTerminalMousePacket | undefined {
    const target = terminalTargetForCapture(this.#controller, projection, capture);
    if (!target) return undefined;
    const clamped = clampToClient(target.window.clientRect, column, row);
    capture.lastColumn = clamped.column;
    capture.lastRow = clamped.row;
    return encodeForTarget(target, clamped.column, clamped.row, {
      ...event,
      button: capture.button,
    });
  }
}

function terminalTargetAt(
  controller: ExomuxController,
  projection: WorkbenchWindowHostProjection,
  column: number,
  row: number,
): ExomuxTerminalMouseTarget | undefined {
  for (const windows of [projection.floatingWindows, projection.tiledWindows]) {
    for (let index = windows.length - 1; index >= 0; index -= 1) {
      const window = windows[index]!;
      if (!contains(window.rect, column, row)) continue;
      // Chrome on an overlapping floating window occludes terminals below it.
      if (!contains(window.clientRect, column, row)) return undefined;
      const sessionId = exomuxSessionIdFromWindow(window.id);
      const runtime = sessionId ? controller.runtime(sessionId) : undefined;
      if (!runtime || !terminalRuntimeAcceptsMouse(runtime)) return undefined;
      // Mouse reporting off keeps the pointer local so wheel and selection work.
      if (!controller.windowSettingsFor(sessionId!).mouseReporting) return undefined;
      return { runtime, window };
    }
  }
  return undefined;
}

function terminalTargetForCapture(
  controller: ExomuxController,
  projection: WorkbenchWindowHostProjection,
  capture: ExomuxTerminalPointerCapture,
): ExomuxTerminalMouseTarget | undefined {
  const window = projection.windows.find((candidate) => candidate.id === capture.windowId);
  const runtime = controller.runtime(capture.sessionId);
  if (!window || !runtime || !terminalRuntimeAcceptsMouse(runtime, false)) return undefined;
  if (!controller.windowSettingsFor(capture.sessionId).mouseReporting) return undefined;
  return { runtime, window };
}

function terminalRuntimeAcceptsMouse(runtime: ExomuxTerminalRuntime, requireLive = true): boolean {
  return runtime.attached.peek() && runtime.summary.peek().running &&
    (!requireLive || runtime.scrollback.mode === "live");
}

function encodeForTarget(
  target: ExomuxTerminalMouseTarget,
  column: number,
  row: number,
  event: {
    readonly drag?: boolean;
    readonly release?: boolean;
    readonly button?: 0 | 1 | 2;
    readonly scroll?: -1 | 0 | 1;
    readonly ctrl: boolean;
    readonly meta: boolean;
    readonly shift: boolean;
  },
): ExomuxTerminalMousePacket | undefined {
  const routing = terminalMouseRoutingFromPrivateModes(target.runtime.screen.inspect().privateModes);
  const bytes = encodeTerminalMouse(
    {
      // Never forward the outer terminal's raw SGR packet: its coordinates
      // belong to the Exomux desktop, not to the nested child terminal.
      buffer: new Uint8Array(),
      x: column,
      y: row,
      ...event,
    },
    {
      ...routing,
      mouseOrigin: {
        column: target.window.clientRect.column,
        row: target.window.clientRect.row,
      },
    },
  );
  return bytes ? { sessionId: target.runtime.sessionId, bytes } : undefined;
}

function pointerButton(event: PointerInputEvent): 0 | 1 | 2 | undefined {
  if (event.device !== "mouse") return event.primary ? 0 : undefined;
  return event.button === 0 || event.button === 1 || event.button === 2 ? event.button : undefined;
}

function clampToClient(
  rect: WorkbenchWindowChromeProjection["clientRect"],
  column: number,
  row: number,
): { column: number; row: number } {
  return {
    column: Math.max(rect.column, Math.min(rect.column + Math.max(1, rect.width) - 1, Math.floor(column))),
    row: Math.max(rect.row, Math.min(rect.row + Math.max(1, rect.height) - 1, Math.floor(row))),
  };
}
