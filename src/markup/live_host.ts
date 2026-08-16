// Copyright 2023 Im-Beast. MIT license.

// D1 final slice: one host object that makes the live machinery usable as a
// unit. It owns the tree, the phase dispatcher, the invalidator, the
// incremental styler, and the identity-preserving hydration, and wires them
// together: `commit()` restyles the dirty subtrees and rehydrates without
// resetting untouched widget state, and `dispatch()` runs the selector-routed
// capture/bubble walk first — a handler's preventDefault stops the widget
// action — before delivering the event to the node's hydrated controller.
// Live scroll-areas, windows/modals, menus, and dropdowns stay owned by their
// existing controllers; the host only keeps them consistent and inspectable
// (open dropdowns, window/modal inventory for the W2 workspace integration,
// and nearest-ancestor tooltip resolution).

import type { LayoutNode } from "../layout/solver.ts";
import { parseCssStylesheet } from "./css.ts";
import type { ApplyCssCascadeOptions } from "./cascade.ts";
import { parseTuiMarkup } from "./html.ts";
import { createLiveMarkupDispatcher, LiveMarkupDispatcher } from "./live_dispatch.ts";
import type { LiveMarkupEvent } from "./live_dispatch.ts";
import { createLiveMarkupInvalidator, LiveMarkupInvalidator } from "./live_invalidation.ts";
import { createLiveMarkupStyler, LiveMarkupStyler } from "./live_styling.ts";
import type { LiveMarkupRestyleResult } from "./live_styling.ts";
import { createLiveMarkupTree, LiveMarkupTree } from "./live_tree.ts";
import { rehydrateMarkupWidgets } from "./rehydrate.ts";
import type { MarkupRehydrationResult } from "./rehydrate.ts";
import { ComboBoxController } from "../components/combobox.ts";
import { hydrateMarkupWidgets, MarkupWidgetHydration } from "./widgets.ts";
import type { MarkupWidgetEvent } from "./widgets.ts";

/** Options for a live markup host. */
export interface LiveMarkupHostOptions {
  readonly cascade?: ApplyCssCascadeOptions;
}

/** Result of one commit. */
export interface LiveMarkupCommit {
  readonly restyle: LiveMarkupRestyleResult;
  readonly rehydration: Omit<MarkupRehydrationResult, "hydration">;
}

/** Result of one host dispatch. */
export interface LiveMarkupHostDispatch {
  /** Selector handlers invoked during the phase walk. */
  readonly handlers: number;
  /** True when a handler prevented the widget action. */
  readonly defaultPrevented: boolean;
  /** True when the hydrated controller consumed the event. */
  readonly widgetHandled: boolean;
}

/**
 * The composed live-markup runtime: tree + dispatcher + invalidator +
 * styler + hydration, kept consistent through `commit()`.
 */
export class LiveMarkupHost {
  readonly tree: LiveMarkupTree;
  readonly dispatcher: LiveMarkupDispatcher;
  readonly invalidator: LiveMarkupInvalidator;
  readonly styler: LiveMarkupStyler;
  #hydration: MarkupWidgetHydration;
  #disposed = false;

  constructor(markup: string, css: string, options: LiveMarkupHostOptions = {}) {
    this.tree = createLiveMarkupTree(parseTuiMarkup(markup).root);
    this.dispatcher = createLiveMarkupDispatcher(this.tree);
    this.invalidator = createLiveMarkupInvalidator(this.tree);
    this.styler = createLiveMarkupStyler(this.tree, this.invalidator, parseCssStylesheet(css), options.cascade);
    this.styler.restyle();
    this.#hydration = hydrateMarkupWidgets(this.tree.root);
  }

  get hydration(): MarkupWidgetHydration {
    return this.#hydration;
  }

  /** Brings styles and hydration up to date after tree mutations. */
  commit(): LiveMarkupCommit {
    this.#assertLive();
    const restyle = this.styler.restyle();
    const { hydration, reused, created, disposed } = rehydrateMarkupWidgets(this.#hydration, this.tree.root);
    this.#hydration = hydration;
    return { restyle, rehydration: { reused, created, disposed } };
  }

  /**
   * Selector-routed phases first, widget controller second. A handler that
   * calls preventDefault keeps the event away from the controller.
   */
  dispatch(id: string, event: LiveMarkupEvent & Partial<MarkupWidgetEvent>): LiveMarkupHostDispatch {
    this.#assertLive();
    const walk = this.dispatcher.dispatch(id, event);
    let widgetHandled = false;
    if (!walk.defaultPrevented) {
      widgetHandled = this.#hydration.dispatch({ ...event, id } as MarkupWidgetEvent);
    }
    return { handlers: walk.invoked, defaultPrevented: walk.defaultPrevented, widgetHandled };
  }

  /** Hydrated comboboxes/selects whose dropdown is currently expanded. */
  openDropdowns(): readonly string[] {
    const open: string[] = [];
    for (const widget of this.#hydration.widgets) {
      if (widget.controller instanceof ComboBoxController && widget.controller.expanded.peek()) {
        open.push(widget.id);
      }
    }
    return open;
  }

  /** Current window and modal nodes, for the workspace (W2) integration. */
  windowNodes(): readonly LayoutNode[] {
    return this.tree.query("*", { filter: (node) => node.tag === "window" || node.tag === "modal" });
  }

  /** Nearest-ancestor tooltip text for a node (its own wins over inherited). */
  tooltipFor(id: string): string | undefined {
    for (let node = this.tree.node(id); node; node = this.tree.parentOf(node.id)) {
      const tooltip = node.attributes["tooltip"] ?? node.attributes["title"];
      if (tooltip) return tooltip;
    }
    return undefined;
  }

  dispose(): void {
    this.#disposed = true;
    this.#hydration.dispose();
    this.dispatcher.dispose();
    this.invalidator.dispose();
    this.tree.dispose();
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("LiveMarkupHost is disposed");
  }
}

/** Creates a composed live markup host from markup and CSS sources. */
export function createLiveMarkupHost(markup: string, css: string, options: LiveMarkupHostOptions = {}): LiveMarkupHost {
  return new LiveMarkupHost(markup, css, options);
}
