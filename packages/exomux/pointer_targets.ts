// Copyright 2023 Im-Beast. MIT license.

// The exomux desktop expressed as pointer targets.
//
// Everything that can be pointed at registers itself here with a paint order,
// so "what is at this cell" is one lookup against ordered data instead of a
// sequence of `if (contains(...))` branches whose precedence is the order the
// statements happen to appear in. That ordering bug is what let the shelf
// swallow a drag release and let a circuit chip behind a title bar eat a press.
//
// The model answers; it does not act. Dispatch reads the answer and decides
// what to do with it, and the drawn cursor reads the same answer, so the two
// cannot disagree about what the pointer is over.

import {
  contains,
  createMouseInteractionRouter,
  type MouseInteractionRouter,
  type Rectangle,
} from "@ubernaut/deno-tui";
import type { WorkbenchWindowHostProjection } from "@ubernaut/deno-tui";

/** What a cell belongs to. The vocabulary dispatch and the cursor share. */
export type ExomuxPointerTarget =
  | { readonly kind: "modal" }
  | { readonly kind: "start" }
  | { readonly kind: "shelf" }
  | { readonly kind: "quit" }
  | { readonly kind: "window"; readonly windowId: string; readonly placement: "floating" | "tiled" }
  | { readonly kind: "separator"; readonly separatorId: string }
  | { readonly kind: "desktop" };

/** Paint order, bottom to top. Registered as data so the stack is printable. */
export const EXOMUX_POINTER_LAYERS = Object.freeze({
  desktop: 0,
  tiled: 1_000,
  separator: 2_000,
  floating: 3_000,
  topBar: 20_000,
  modal: 30_000,
});

/** Everything the model needs to place a cell, gathered once per frame. */
export interface ExomuxPointerModelInput {
  readonly body: Rectangle;
  readonly shelf: Rectangle;
  readonly startButton: Rectangle;
  readonly quit: Rectangle;
  readonly projection: WorkbenchWindowHostProjection;
  readonly modalOpen: boolean;
  /**
   * Which part of a window an absolute cell falls in: `title`, `client`,
   * `chrome`, `control:<kind>`, or a resize edge such as `bottom-right`.
   * Supplied by whoever owns window geometry rather than re-derived here.
   */
  readonly windowRegionAt: (windowId: string, column: number, row: number) => string;
}

// Resolution-only for now: the model reports what is at a cell, and dispatch
// still runs elsewhere. Handlers exist because a target without one is
// invisible to hit resolution; they deliberately claim nothing.
const INERT = () => false;

/** Builds the desktop's hit model for one frame. */
export function buildExomuxPointerModel(input: ExomuxPointerModelInput): MouseInteractionRouter {
  const model = createMouseInteractionRouter();
  const add = (
    id: string,
    bounds: Rectangle,
    zIndex: number,
    payload: ExomuxPointerTarget,
    regionAt?: (localX: number, localY: number) => string | undefined,
  ): void => {
    if (bounds.width <= 0 || bounds.height <= 0) return;
    model.register({
      id,
      bounds,
      zIndex,
      payload,
      regionAt: regionAt ? (localX, localY) => regionAt(localX, localY) : undefined,
      onPress: INERT,
      onDrag: INERT,
      onRelease: INERT,
      onScroll: INERT,
    });
  };

  // A modal owns the screen outright; nothing beneath it is reachable.
  if (input.modalOpen) {
    add("modal", { column: 0, row: 0, width: 10_000, height: 10_000 }, EXOMUX_POINTER_LAYERS.modal, { kind: "modal" });
    return model;
  }

  // Bottom of the stack: the animated background answers only what every
  // window above it declined.
  add("desktop", input.body, EXOMUX_POINTER_LAYERS.desktop, { kind: "desktop" });

  const registerWindow = (
    window: WorkbenchWindowHostProjection["floatingWindows"][number],
    placement: "floating" | "tiled",
    zIndex: number,
  ): void => {
    add(
      `window:${window.id}`,
      window.rect,
      zIndex,
      { kind: "window", windowId: window.id, placement },
      (localX, localY) => input.windowRegionAt(window.id, window.rect.column + localX, window.rect.row + localY),
    );
  };

  input.projection.tiledWindows.forEach((window, index) => {
    registerWindow(window, "tiled", EXOMUX_POINTER_LAYERS.tiled + index);
  });

  input.projection.separators.forEach((separator, index) => {
    add(
      `separator:${separator.splitId}`,
      separator.hitRect,
      EXOMUX_POINTER_LAYERS.separator + index,
      { kind: "separator", separatorId: separator.splitId },
    );
  });

  // Floating windows carry their own paint order from the host projection.
  input.projection.floatingWindows.forEach((window, index) => {
    registerWindow(window, "floating", EXOMUX_POINTER_LAYERS.floating + (window.zIndex || index));
  });

  // The top bar sits above the desktop: start button, taskbar, quick quit.
  add("start", input.startButton, EXOMUX_POINTER_LAYERS.topBar, { kind: "start" });
  add("shelf", input.shelf, EXOMUX_POINTER_LAYERS.topBar, { kind: "shelf" });
  add("quit", input.quit, EXOMUX_POINTER_LAYERS.topBar + 1, { kind: "quit" });
  return model;
}

/**
 * The label vocabulary shared with the golden hit map, so the model can be
 * compared cell for cell against how the desktop behaves today.
 */
export function exomuxPointerLabelAt(model: MouseInteractionRouter, column: number, row: number): string {
  const resolved = model.resolve<ExomuxPointerTarget>(column, row);
  if (!resolved?.payload) return "desktop";
  const target = resolved.payload;
  switch (target.kind) {
    case "window":
      return `win:${target.windowId}:${resolved.region ?? "chrome"}`;
    case "separator":
      return "separator";
    default:
      return target.kind;
  }
}

/** A host hit-test answer: which floating window owns a cell, and where. */
export interface ExomuxWindowHit {
  readonly id: string;
  readonly region: string;
}

/**
 * Builds the region resolver the model needs, from the geometry the desktop
 * already computed to paint itself: controls come from the projection, the
 * floating regions from the window host's own hit test, and anything left is
 * client or chrome by the window's client rect. Nothing here re-derives a
 * rectangle, which is the point.
 */
export function exomuxWindowRegionResolver(
  projection: WorkbenchWindowHostProjection,
  hostHitAt: (column: number, row: number) => ExomuxWindowHit | undefined,
): (windowId: string, column: number, row: number) => string {
  const windows = new Map(
    [...projection.floatingWindows, ...projection.tiledWindows].map((window) => [window.id, window]),
  );
  return (windowId, column, row) => {
    const window = windows.get(windowId);
    if (!window) return "chrome";
    const control = window.controls.find((candidate) => contains(candidate.hitRect, column, row));
    if (control) return `control:${control.kind}`;
    const hit = hostHitAt(column, row);
    if (hit?.id === windowId) return hit.region === "title-bar" ? "title" : hit.region;
    return contains(window.clientRect, column, row) ? "client" : "chrome";
  };
}
