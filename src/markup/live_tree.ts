// Copyright 2023 Im-Beast. MIT license.

// D1 first slice: a live markup tree. The parsed document stops being a
// snapshot: mount, remove, move, attribute/class/text mutation, selector
// query/filter, and bounded recompose all operate on the same LayoutNode tree
// the cascade and solvers consume. Every successful mutation bumps one
// revision and lands in a bounded journal, so downstream invalidation (the
// later D1 slices) can key off "what changed since revision N" instead of
// diffing trees.

import type { LayoutNode } from "../layout/solver.ts";
import { matchesCssSelector } from "./cascade.ts";
import type { TuiCssEnvironment, TuiCssNodeState } from "./cascade.ts";
import { parseTuiMarkup } from "./html.ts";

/** One recorded tree mutation. */
export interface LiveMarkupMutation {
  readonly kind:
    | "mount"
    | "remove"
    | "move"
    | "set-attribute"
    | "remove-attribute"
    | "add-class"
    | "remove-class"
    | "set-text"
    | "recompose";
  /** Id of the node the mutation targeted (the parent for mount/recompose). */
  readonly target: string;
  readonly detail: string;
  /** Tree revision after this mutation. */
  readonly revision: number;
}

/** Options for a live markup tree. */
export interface LiveMarkupTreeOptions {
  /** Hard cap on total nodes; mutations that would exceed it are rejected. */
  readonly maxNodes?: number;
}

/** Options for selector queries. */
export interface LiveMarkupQueryOptions {
  /** Nodes matching this selector are dropped from the result. */
  readonly exclude?: string;
  /** Arbitrary predicate filter applied after selector matching. */
  readonly filter?: (node: LayoutNode) => boolean;
  readonly states?: Record<string, readonly TuiCssNodeState[]>;
  readonly environment?: TuiCssEnvironment;
}

const DEFAULT_MAX_NODES = 10_000;
const MAX_JOURNAL = 256;

interface NodeEntry {
  readonly node: LayoutNode;
  parent: LayoutNode | undefined;
}

/**
 * A mutable markup tree with deterministic mutation semantics. Operations
 * either apply fully (returning the affected nodes) or reject without
 * touching the tree; there are no partial mutations.
 */
export class LiveMarkupTree {
  readonly #root: LayoutNode;
  readonly #maxNodes: number;
  /** id → entry for every node currently in the tree. */
  readonly #index = new Map<string, NodeEntry>();
  #revision = 0;
  #journal: LiveMarkupMutation[] = [];
  #droppedMutations = 0;
  #idCounter = 0;
  #disposed = false;

  constructor(root: LayoutNode, options: LiveMarkupTreeOptions = {}) {
    this.#root = root;
    this.#maxNodes = Math.max(1, options.maxNodes ?? DEFAULT_MAX_NODES);
    this.#reindex(root, undefined);
  }

  get root(): LayoutNode {
    return this.#root;
  }

  /** Monotonic revision; bumps once per successful mutation. */
  get revision(): number {
    return this.#revision;
  }

  get nodeCount(): number {
    return this.#index.size;
  }

  /** Looks a node up by id. */
  node(id: string): LayoutNode | undefined {
    return this.#index.get(id)?.node;
  }

  /** The node's parent, or undefined for the root. */
  parentOf(id: string): LayoutNode | undefined {
    return this.#index.get(id)?.parent;
  }

  /**
   * Parses a markup fragment and mounts its top-level nodes under a parent.
   * Incoming ids that collide with the tree are rewritten deterministically
   * (`<id>~<n>`); returns the mounted nodes in document order.
   */
  mount(parentId: string, markup: string, index?: number): readonly LayoutNode[] {
    this.#assertLive();
    const parent = this.#index.get(parentId);
    if (!parent) return [];
    const fragment = parseTuiMarkup(markup).root;
    const incoming = fragment.tag === "document" ? [...fragment.children] : [fragment];
    if (incoming.length === 0) return [];
    let count = 0;
    for (const node of incoming) count += countNodes(node);
    if (this.#index.size + count > this.#maxNodes) return [];
    for (const node of incoming) this.#claimIds(node);
    const at = clampIndex(index, parent.node.children.length);
    parent.node.children.splice(at, 0, ...incoming);
    for (const node of incoming) this.#reindex(node, parent.node);
    this.#record("mount", parentId, `${incoming.length} node(s) at ${at}`);
    return incoming;
  }

  /** Removes a node and its subtree. The root cannot be removed. */
  remove(id: string): boolean {
    this.#assertLive();
    const entry = this.#index.get(id);
    if (!entry || !entry.parent) return false;
    const siblings = entry.parent.children;
    const at = siblings.indexOf(entry.node);
    if (at < 0) return false;
    siblings.splice(at, 1);
    this.#unindex(entry.node);
    this.#record("remove", id, `from ${entry.parent.id}`);
    return true;
  }

  /**
   * Moves a node under a new parent. Rejected when it would create a cycle
   * (moving a node into its own subtree) or detach the root.
   */
  move(id: string, newParentId: string, index?: number): boolean {
    this.#assertLive();
    const entry = this.#index.get(id);
    const target = this.#index.get(newParentId);
    if (!entry || !entry.parent || !target) return false;
    for (let scan: NodeEntry | undefined = target; scan; scan = scan.parent && this.#index.get(scan.parent.id)) {
      if (scan.node === entry.node) return false;
    }
    const from = entry.parent.children;
    const at = from.indexOf(entry.node);
    if (at < 0) return false;
    from.splice(at, 1);
    const to = clampIndex(index, target.node.children.length);
    target.node.children.splice(to, 0, entry.node);
    entry.parent = target.node;
    this.#record("move", id, `to ${newParentId} at ${to}`);
    return true;
  }

  setAttribute(id: string, name: string, value: string): boolean {
    this.#assertLive();
    const entry = this.#index.get(id);
    if (!entry || name === "id") return false;
    if (entry.node.attributes[name] === value) return false;
    entry.node.attributes[name] = value;
    this.#record("set-attribute", id, `${name}="${value}"`);
    return true;
  }

  removeAttribute(id: string, name: string): boolean {
    this.#assertLive();
    const entry = this.#index.get(id);
    if (!entry || name === "id" || !(name in entry.node.attributes)) return false;
    delete entry.node.attributes[name];
    this.#record("remove-attribute", id, name);
    return true;
  }

  addClass(id: string, ...classes: readonly string[]): boolean {
    this.#assertLive();
    const entry = this.#index.get(id);
    if (!entry) return false;
    const merged = [...entry.node.classes];
    for (const name of classes) if (name && !merged.includes(name)) merged.push(name);
    if (merged.length === entry.node.classes.length) return false;
    entry.node.classes = merged;
    this.#record("add-class", id, classes.join(" "));
    return true;
  }

  removeClass(id: string, ...classes: readonly string[]): boolean {
    this.#assertLive();
    const entry = this.#index.get(id);
    if (!entry) return false;
    const kept = entry.node.classes.filter((name) => !classes.includes(name));
    if (kept.length === entry.node.classes.length) return false;
    entry.node.classes = kept;
    this.#record("remove-class", id, classes.join(" "));
    return true;
  }

  setText(id: string, text: string | undefined): boolean {
    this.#assertLive();
    const entry = this.#index.get(id);
    if (!entry || entry.node.text === text) return false;
    entry.node.text = text;
    this.#record("set-text", id, text === undefined ? "(cleared)" : `${text.length} chars`);
    return true;
  }

  /** All nodes matching a selector, in document order. */
  query(selector: string, options: LiveMarkupQueryOptions = {}): readonly LayoutNode[] {
    const results: LayoutNode[] = [];
    const visit = (node: LayoutNode, ancestors: LayoutNode[]): void => {
      const matches = matchesCssSelector(selector, node, ancestors, options.states ?? {}, options.environment ?? {}) &&
        !(options.exclude &&
          matchesCssSelector(options.exclude, node, ancestors, options.states ?? {}, options.environment ?? {})) &&
        (options.filter?.(node) ?? true);
      if (matches) results.push(node);
      ancestors.push(node);
      for (const child of node.children) visit(child, ancestors);
      ancestors.pop();
    };
    visit(this.#root, []);
    return results;
  }

  /** First match of a selector, or undefined. */
  first(selector: string, options: LiveMarkupQueryOptions = {}): LayoutNode | undefined {
    return this.query(selector, options)[0];
  }

  /**
   * Bounded recompose: replaces a node's children with a parsed fragment in
   * one mutation. Rejected when the result would exceed the node cap.
   */
  recompose(id: string, markup: string): boolean {
    this.#assertLive();
    const entry = this.#index.get(id);
    if (!entry) return false;
    const fragment = parseTuiMarkup(markup).root;
    const incoming = fragment.tag === "document" ? [...fragment.children] : [fragment];
    let removed = 0;
    for (const child of entry.node.children) removed += countNodes(child);
    let added = 0;
    for (const node of incoming) added += countNodes(node);
    if (this.#index.size - removed + added > this.#maxNodes) return false;
    for (const child of [...entry.node.children]) this.#unindex(child);
    for (const node of incoming) this.#claimIds(node);
    entry.node.children.length = 0;
    entry.node.children.push(...incoming);
    for (const node of incoming) this.#reindex(node, entry.node);
    this.#record("recompose", id, `${removed} out, ${added} in`);
    return true;
  }

  /** The bounded mutation journal, oldest first. */
  mutations(): { readonly entries: readonly LiveMarkupMutation[]; readonly dropped: number } {
    return { entries: [...this.#journal], dropped: this.#droppedMutations };
  }

  /** Drops journal entries at or below a revision the consumer has applied. */
  acknowledge(revision: number): void {
    this.#journal = this.#journal.filter((entry) => entry.revision > revision);
  }

  dispose(): void {
    this.#disposed = true;
    this.#index.clear();
    this.#journal = [];
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("LiveMarkupTree is disposed");
  }

  #claimIds(node: LayoutNode): void {
    if (this.#index.has(node.id)) {
      let candidate: string;
      do {
        candidate = `${node.id}~${++this.#idCounter}`;
      } while (this.#index.has(candidate));
      node.id = candidate;
      node.attributes["id"] = candidate;
    }
    for (const child of node.children) this.#claimIds(child);
  }

  #reindex(node: LayoutNode, parent: LayoutNode | undefined): void {
    this.#index.set(node.id, { node, parent });
    for (const child of node.children) this.#reindex(child, node);
  }

  #unindex(node: LayoutNode): void {
    this.#index.delete(node.id);
    for (const child of node.children) this.#unindex(child);
  }

  #record(kind: LiveMarkupMutation["kind"], target: string, detail: string): void {
    this.#revision += 1;
    if (this.#journal.length >= MAX_JOURNAL) {
      this.#journal.shift();
      this.#droppedMutations += 1;
    }
    this.#journal.push(Object.freeze({ kind, target, detail, revision: this.#revision }));
  }
}

function countNodes(node: LayoutNode): number {
  let count = 1;
  for (const child of node.children) count += countNodes(child);
  return count;
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length;
  return Math.max(0, Math.min(length, Math.floor(index)));
}

/** Creates a live tree over a parsed markup document root. */
export function createLiveMarkupTree(root: LayoutNode, options: LiveMarkupTreeOptions = {}): LiveMarkupTree {
  return new LiveMarkupTree(root, options);
}
