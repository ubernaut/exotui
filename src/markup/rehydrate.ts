// Copyright 2023 Im-Beast. MIT license.

// D1 fourth slice: hydrated widget identity survives markup changes. A
// rehydration walks the (possibly mutated) tree against the previous
// hydration: a node whose id and tag are unchanged keeps its controller —
// and with it every piece of user state the controller holds (text, cursor,
// selection, expansion, scroll) — while new nodes hydrate fresh and vanished
// or retagged nodes get their controllers disposed. Changing one branch can
// therefore never reset the widgets of another.

import type { LayoutNode } from "../layout/solver.ts";
import type { LayoutSolverResult } from "../layout/solver.ts";
import {
  createDefaultMarkupWidgetRegistry,
  defaultActionsForKind,
  type HydratedMarkupWidget,
  MarkupWidgetHydration,
  type MarkupWidgetHydrationOptions,
} from "./widgets.ts";

/** Result of one rehydration pass. */
export interface MarkupRehydrationResult {
  readonly hydration: MarkupWidgetHydration;
  /** Ids whose controllers were carried over unchanged. */
  readonly reused: readonly string[];
  /** Ids hydrated fresh this pass. */
  readonly created: readonly string[];
  /** Ids whose controllers were disposed (removed or retagged nodes). */
  readonly disposed: readonly string[];
}

/**
 * Rehydrates a tree against a previous hydration, preserving controller
 * identity for unchanged nodes. Ownership transfers: controllers not carried
 * over are disposed here, and the previous hydration must not be disposed by
 * the caller afterwards — the returned hydration owns every live controller.
 */
export function rehydrateMarkupWidgets(
  previous: MarkupWidgetHydration,
  root: LayoutNode,
  options: MarkupWidgetHydrationOptions = {},
): MarkupRehydrationResult {
  const registry = options.registry ?? createDefaultMarkupWidgetRegistry();
  const layout: LayoutSolverResult | undefined = options.layout;
  const widgets: HydratedMarkupWidget[] = [];
  const reused: string[] = [];
  const created: string[] = [];
  const carried = new Set<string>();

  const visit = (node: LayoutNode): void => {
    const before = previous.byId.get(node.id);
    if (before && before.tag === node.tag) {
      widgets.push({ ...before, node, box: layout?.byId.get(node.id) });
      carried.add(node.id);
      reused.push(node.id);
    } else {
      const descriptor = registry.hydrateNode(node, { layout, registry });
      if (descriptor) {
        widgets.push({
          id: node.id,
          tag: node.tag,
          kind: descriptor.kind,
          node,
          box: layout?.byId.get(node.id),
          controller: descriptor.controller,
          focusable: descriptor.focusable ?? Boolean(descriptor.controller),
          actions: descriptor.actions ?? defaultActionsForKind(descriptor.kind),
        });
        created.push(node.id);
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);

  const disposed: string[] = [];
  for (const widget of previous.widgets) {
    if (carried.has(widget.id)) continue;
    widget.controller?.dispose();
    disposed.push(widget.id);
  }

  return { hydration: new MarkupWidgetHydration(widgets), reused, created, disposed };
}
