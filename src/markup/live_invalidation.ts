// Copyright 2023 Im-Beast. MIT license.

// D1 third slice: signal-connected invalidation over the live markup tree.
// Nodes are marked dirty with a reason — directly, from a bound signal, or by
// consuming the tree's mutation journal — and `flush()` coalesces the marks
// to the nearest dirty ancestors: a dirty node subsumes its dirty descendants
// so a consumer re-styles/re-lays-out/repaints each affected subtree exactly
// once from its shallowest dirty root.

import { Effect } from "../signals/effect.ts";
import type { LayoutNode } from "../layout/solver.ts";
import type { LiveMarkupMutation, LiveMarkupTree } from "./live_tree.ts";

/** Why a node needs recomputation. */
export type LiveMarkupDirtyReason = "style" | "layout" | "render" | "tree";

/** One coalesced dirty subtree root. */
export interface LiveMarkupDirtyRoot {
  readonly id: string;
  /** Union of the root's own reasons and its subsumed descendants'. */
  readonly reasons: readonly LiveMarkupDirtyReason[];
  /** Dirty descendant ids folded into this root. */
  readonly subsumed: readonly string[];
}

const REASON_ORDER: readonly LiveMarkupDirtyReason[] = ["tree", "style", "layout", "render"];

/**
 * Collects dirty marks between frames. All entry points are synchronous and
 * idempotent; `flush()` is the only consumer-facing transition and clears the
 * collected state atomically.
 */
export class LiveMarkupInvalidator {
  readonly #tree: LiveMarkupTree;
  readonly #dirty = new Map<string, Set<LiveMarkupDirtyReason>>();
  readonly #effects = new Set<Effect>();
  #journalRevision = 0;
  #disposed = false;

  constructor(tree: LiveMarkupTree) {
    this.#tree = tree;
    this.#journalRevision = tree.revision;
  }

  /** Marks a node dirty; unknown ids are ignored. */
  mark(id: string, reason: LiveMarkupDirtyReason): boolean {
    if (this.#disposed || !this.#tree.node(id)) return false;
    const reasons = this.#dirty.get(id) ?? new Set<LiveMarkupDirtyReason>();
    this.#dirty.set(id, reasons);
    reasons.add(reason);
    return true;
  }

  /**
   * Binds a signal read to a node: whenever a dependency of `read` changes,
   * the node is marked dirty with `reason`. The initial tracking run does not
   * mark. Returns the binding's disposer.
   */
  bindSignal(read: () => unknown, id: string, reason: LiveMarkupDirtyReason): () => void {
    if (this.#disposed) throw new Error("LiveMarkupInvalidator is disposed");
    let tracked = false;
    const effect = new Effect(() => {
      read();
      if (tracked) this.mark(id, reason);
      tracked = true;
    });
    this.#effects.add(effect);
    return () => {
      this.#effects.delete(effect);
      effect.dispose();
    };
  }

  /**
   * Consumes tree mutations since the last sync: structural mutations dirty
   * the parent subtree (`tree` + `layout`), attribute/class changes dirty the
   * node's style, text changes its layout. Returns the mutations consumed.
   */
  syncFromJournal(): number {
    if (this.#disposed) return 0;
    const { entries } = this.#tree.mutations();
    let consumed = 0;
    for (const entry of entries) {
      if (entry.revision <= this.#journalRevision) continue;
      consumed += 1;
      this.#applyJournalEntry(entry);
      this.#journalRevision = entry.revision;
    }
    this.#tree.acknowledge(this.#journalRevision);
    return consumed;
  }

  /** Coalesced dirty roots (nearest dirty ancestors first); clears state. */
  flush(): readonly LiveMarkupDirtyRoot[] {
    const roots: LiveMarkupDirtyRoot[] = [];
    const handled = new Set<string>();
    // Document order guarantees ancestors visit before their descendants.
    const visit = (node: LayoutNode, dirtyAncestor: LiveMarkupDirtyRoot | undefined): void => {
      const reasons = this.#dirty.get(node.id);
      let current = dirtyAncestor;
      if (reasons && !handled.has(node.id)) {
        handled.add(node.id);
        if (current) {
          (current.subsumed as string[]).push(node.id);
          mergeReasons(current, reasons);
        } else {
          current = { id: node.id, reasons: sortReasons(reasons), subsumed: [] };
          roots.push(current);
        }
      }
      for (const child of node.children) visit(child, current);
    };
    visit(this.#tree.root, undefined);
    this.#dirty.clear();
    return roots;
  }

  get dirtyCount(): number {
    return this.#dirty.size;
  }

  dispose(): void {
    this.#disposed = true;
    for (const effect of this.#effects) effect.dispose();
    this.#effects.clear();
    this.#dirty.clear();
  }

  #applyJournalEntry(entry: LiveMarkupMutation): void {
    switch (entry.kind) {
      case "mount":
      case "recompose":
        this.mark(entry.target, "tree");
        this.mark(entry.target, "layout");
        break;
      case "remove":
      case "move": {
        // The mutated node's old/new parents both need re-layout; the journal
        // records the node, so dirty the whole document conservatively when
        // the parent is no longer resolvable.
        const parent = this.#tree.parentOf(entry.target);
        const target = parent?.id ?? this.#tree.root.id;
        this.mark(target, "tree");
        this.mark(target, "layout");
        break;
      }
      case "set-attribute":
      case "remove-attribute":
      case "add-class":
      case "remove-class":
        this.mark(entry.target, "style");
        break;
      case "set-text":
        this.mark(entry.target, "layout");
        break;
    }
  }
}

function sortReasons(reasons: ReadonlySet<LiveMarkupDirtyReason>): LiveMarkupDirtyReason[] {
  return REASON_ORDER.filter((reason) => reasons.has(reason));
}

function mergeReasons(root: LiveMarkupDirtyRoot, extra: ReadonlySet<LiveMarkupDirtyReason>): void {
  const merged = new Set<LiveMarkupDirtyReason>([...root.reasons, ...extra]);
  (root.reasons as LiveMarkupDirtyReason[]).length = 0;
  (root.reasons as LiveMarkupDirtyReason[]).push(...sortReasons(merged));
}

/** Creates an invalidator over a live markup tree. */
export function createLiveMarkupInvalidator(tree: LiveMarkupTree): LiveMarkupInvalidator {
  return new LiveMarkupInvalidator(tree);
}
