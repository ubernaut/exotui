// Copyright 2023 Im-Beast. MIT license.

// NAV-009: focus, selection, and scroll anchors owned by their route.
// capture() snapshots them on the way out; restore() replays them against a
// host oracle that answers whether a target is actually focusable RIGHT NOW
// — a missing control or a hidden/minimized window answers false, and focus
// then goes to the host's declared fallback (or nowhere) instead of a ghost.
// Selection only ever applies to the control that actually took focus.

/** One route's captured anchors. */
export interface RouteAnchor {
  readonly focusId?: string;
  readonly selection?: { readonly start: number; readonly end: number };
  readonly scroll?: { readonly x: number; readonly y: number };
}

/** The host surface restore() drives. */
export interface RouteAnchorHost {
  /** True only when the target exists AND may take focus (visible, enabled). */
  focusable(id: string): boolean;
  applyFocus(id: string): void;
  applySelection(id: string, selection: { readonly start: number; readonly end: number }): void;
  applyScroll(scroll: { readonly x: number; readonly y: number }): void;
  /** Where focus goes when the anchored target cannot take it. */
  fallbackFocus?(): void;
}

/** What one restore actually did. */
export interface RouteRestoreReport {
  readonly focused: boolean;
  readonly selectionApplied: boolean;
  readonly scrolled: boolean;
  readonly usedFallback: boolean;
}

/** Per-route anchor store. */
export class RouteAnchorStore {
  readonly #anchors = new Map<string, RouteAnchor>();

  /** Captures a route's anchors (replacing earlier ones). */
  capture(routeId: string, anchor: RouteAnchor): void {
    this.#anchors.set(routeId, anchor);
  }

  /** Restores a route's anchors against the host; safe on every miss. */
  restore(routeId: string, host: RouteAnchorHost): RouteRestoreReport {
    const anchor = this.#anchors.get(routeId);
    if (!anchor) return { focused: false, selectionApplied: false, scrolled: false, usedFallback: false };

    let focused = false;
    let usedFallback = false;
    if (anchor.focusId !== undefined) {
      if (host.focusable(anchor.focusId)) {
        host.applyFocus(anchor.focusId);
        focused = true;
      } else if (host.fallbackFocus) {
        host.fallbackFocus();
        usedFallback = true;
      }
    }
    let selectionApplied = false;
    if (focused && anchor.selection && anchor.focusId !== undefined) {
      host.applySelection(anchor.focusId, anchor.selection);
      selectionApplied = true;
    }
    let scrolled = false;
    if (anchor.scroll) {
      host.applyScroll(anchor.scroll);
      scrolled = true;
    }
    return { focused, selectionApplied, scrolled, usedFallback };
  }

  /** Drops a route's anchors (e.g. the route was deleted). */
  clear(routeId: string): boolean {
    return this.#anchors.delete(routeId);
  }

  inspect(): { readonly routes: readonly string[] } {
    return { routes: [...this.#anchors.keys()].sort() };
  }
}

/** Creates a route anchor store. */
export function createRouteAnchorStore(): RouteAnchorStore {
  return new RouteAnchorStore();
}
