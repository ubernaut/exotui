// Copyright 2023 Im-Beast. MIT license.

// D1 fifth slice: incremental style matching over the live tree. The styler
// keeps the last styled tree; each restyle drains the invalidator and
// recomputes only the dirty subtree roots — selector matching runs against
// the styled ancestor chain and inheritance flows from the parent's cached
// computed style — splicing the fresh subtrees into place. The result is
// bit-identical to a clean full cascade, and the dirty roots (with their
// reasons) stay inspectable after every pass.

import type { LayoutNode } from "../layout/solver.ts";
import type { TuiCssStylesheet } from "./css.ts";
import { applyCssCascade, applyCssCascadeSubtree } from "./cascade.ts";
import type { ApplyCssCascadeOptions } from "./cascade.ts";
import type { LiveMarkupInvalidator } from "./live_invalidation.ts";
import type { LiveMarkupDirtyRoot } from "./live_invalidation.ts";
import type { LiveMarkupTree } from "./live_tree.ts";

/** Result of one restyle pass. */
export interface LiveMarkupRestyleResult {
  readonly styledRoot: LayoutNode;
  /** "full" on the first pass or a root-level change; "incremental" otherwise. */
  readonly mode: "full" | "incremental";
  /** Nodes whose styles were recomputed this pass. */
  readonly recomputed: number;
  /** Nodes carried over untouched from the previous styled tree. */
  readonly reused: number;
  /** The dirty roots this pass consumed, reasons included. */
  readonly dirtyRoots: readonly LiveMarkupDirtyRoot[];
}

/** Cumulative styler counters. */
export interface LiveMarkupStylerInspection {
  readonly fullRestyles: number;
  readonly incrementalRestyles: number;
  readonly nodesRecomputed: number;
  /** The most recent pass's dirty roots with their reasons. */
  readonly lastDirtyRoots: readonly LiveMarkupDirtyRoot[];
}

/**
 * Incremental cascade over a live tree + invalidator pair. `restyle()` is the
 * only consumer transition; between calls the styled tree is stable.
 */
export class LiveMarkupStyler {
  readonly #tree: LiveMarkupTree;
  readonly #invalidator: LiveMarkupInvalidator;
  readonly #stylesheet: TuiCssStylesheet;
  readonly #options: ApplyCssCascadeOptions;
  #styled: LayoutNode | undefined;
  #styledIndex = new Map<string, { node: LayoutNode; parent: LayoutNode | undefined }>();
  #fullRestyles = 0;
  #incrementalRestyles = 0;
  #nodesRecomputed = 0;
  #lastDirtyRoots: readonly LiveMarkupDirtyRoot[] = [];

  constructor(
    tree: LiveMarkupTree,
    invalidator: LiveMarkupInvalidator,
    stylesheet: TuiCssStylesheet,
    options: ApplyCssCascadeOptions = {},
  ) {
    this.#tree = tree;
    this.#invalidator = invalidator;
    this.#stylesheet = stylesheet;
    this.#options = options;
  }

  /** Drains the invalidator and brings the styled tree up to date. */
  restyle(): LiveMarkupRestyleResult {
    this.#invalidator.syncFromJournal();
    const dirtyRoots = this.#invalidator.flush();
    this.#lastDirtyRoots = dirtyRoots;

    if (!this.#styled || dirtyRoots.some((root) => root.id === this.#tree.root.id)) {
      return this.#fullRestyle(dirtyRoots);
    }
    if (dirtyRoots.length === 0) {
      return {
        styledRoot: this.#styled,
        mode: "incremental",
        recomputed: 0,
        reused: countNodes(this.#styled),
        dirtyRoots,
      };
    }

    let recomputed = 0;
    for (const root of dirtyRoots) {
      const live = this.#tree.node(root.id);
      const cached = this.#styledIndex.get(root.id);
      if (!live || !cached?.parent) return this.#fullRestyle(dirtyRoots);
      const ancestors = this.#styledAncestors(cached.parent);
      const fresh = applyCssCascadeSubtree(live, ancestors, cached.parent.style, this.#stylesheet, this.#options);
      const siblings = cached.parent.children;
      const at = siblings.findIndex((child) => child.id === root.id);
      if (at < 0) return this.#fullRestyle(dirtyRoots);
      this.#unindexSubtree(siblings[at]!);
      siblings[at] = fresh;
      this.#indexSubtree(fresh, cached.parent);
      recomputed += countNodes(fresh);
    }
    this.#incrementalRestyles += 1;
    this.#nodesRecomputed += recomputed;
    return {
      styledRoot: this.#styled,
      mode: "incremental",
      recomputed,
      reused: countNodes(this.#styled) - recomputed,
      dirtyRoots,
    };
  }

  get styledRoot(): LayoutNode | undefined {
    return this.#styled;
  }

  inspect(): LiveMarkupStylerInspection {
    return {
      fullRestyles: this.#fullRestyles,
      incrementalRestyles: this.#incrementalRestyles,
      nodesRecomputed: this.#nodesRecomputed,
      lastDirtyRoots: this.#lastDirtyRoots,
    };
  }

  #fullRestyle(dirtyRoots: readonly LiveMarkupDirtyRoot[]): LiveMarkupRestyleResult {
    this.#styled = applyCssCascade(this.#tree.root, this.#stylesheet, this.#options);
    this.#styledIndex = new Map();
    this.#indexSubtree(this.#styled, undefined);
    const recomputed = countNodes(this.#styled);
    this.#fullRestyles += 1;
    this.#nodesRecomputed += recomputed;
    return { styledRoot: this.#styled, mode: "full", recomputed, reused: 0, dirtyRoots };
  }

  #styledAncestors(parent: LayoutNode): LayoutNode[] {
    const chain: LayoutNode[] = [];
    for (
      let entry = this.#styledIndex.get(parent.id);
      entry;
      entry = entry.parent && this.#styledIndex.get(entry.parent.id)
    ) {
      chain.unshift(entry.node);
    }
    return chain;
  }

  #indexSubtree(node: LayoutNode, parent: LayoutNode | undefined): void {
    this.#styledIndex.set(node.id, { node, parent });
    for (const child of node.children) this.#indexSubtree(child, node);
  }

  #unindexSubtree(node: LayoutNode): void {
    this.#styledIndex.delete(node.id);
    for (const child of node.children) this.#unindexSubtree(child);
  }
}

function countNodes(node: LayoutNode): number {
  let count = 1;
  for (const child of node.children) count += countNodes(child);
  return count;
}

/** Creates an incremental styler over a live tree and its invalidator. */
export function createLiveMarkupStyler(
  tree: LiveMarkupTree,
  invalidator: LiveMarkupInvalidator,
  stylesheet: TuiCssStylesheet,
  options: ApplyCssCascadeOptions = {},
): LiveMarkupStyler {
  return new LiveMarkupStyler(tree, invalidator, stylesheet, options);
}
