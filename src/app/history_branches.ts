// Copyright 2023 Im-Beast. MIT license.

// HIS-005: history as a tree, not a line. Pushing after an undo does not
// truncate the redo tail — it starts a sibling branch beside it, so every
// explored alternative stays reachable. Named branches pin nodes; switching
// restores that exact checkpoint, and divergence() walks both sides back to
// the common ancestor and exposes the entry IDs unique to each.

/** One history node. */
interface HistoryNode<T> {
  readonly id: string;
  readonly state: T;
  readonly parent: HistoryNode<T> | undefined;
  readonly children: HistoryNode<T>[];
  /** The child last travelled to, so redo retraces the user's path. */
  lastChild: HistoryNode<T> | undefined;
}

/** The two divergent sides of a branch comparison. */
export interface HistoryDivergence {
  /** Entry ids from the common ancestor (exclusive) down to each side. */
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly commonAncestor: string;
}

/** A branching undo/redo history over immutable states. */
export class BranchingHistory<T> {
  #counter = 0;
  readonly #root: HistoryNode<T>;
  #current: HistoryNode<T>;
  readonly #byId = new Map<string, HistoryNode<T>>();
  readonly #branches = new Map<string, HistoryNode<T>>();

  constructor(initial: T) {
    this.#root = { id: this.#nextId(), state: initial, parent: undefined, children: [], lastChild: undefined };
    this.#current = this.#root;
    this.#byId.set(this.#root.id, this.#root);
  }

  get state(): T {
    return this.#current.state;
  }

  get currentId(): string {
    return this.#current.id;
  }

  /** Records a new state as a child of the current node — siblings survive. */
  push(state: T): string {
    const node: HistoryNode<T> = {
      id: this.#nextId(),
      state,
      parent: this.#current,
      children: [],
      lastChild: undefined,
    };
    this.#current.children.push(node);
    this.#current.lastChild = node;
    this.#current = node;
    this.#byId.set(node.id, node);
    return node.id;
  }

  undo(): boolean {
    if (!this.#current.parent) return false;
    this.#current.parent.lastChild = this.#current;
    this.#current = this.#current.parent;
    return true;
  }

  /** Redo retraces the last-travelled child (falling back to the first). */
  redo(): boolean {
    const next = this.#current.lastChild ?? this.#current.children[0];
    if (!next) return false;
    this.#current = next;
    return true;
  }

  /** Pins the current node under a branch name. */
  saveBranch(name: string): string {
    this.#branches.set(name, this.#current);
    return this.#current.id;
  }

  /** Jumps to a named branch — the exact checkpointed node. */
  switchBranch(name: string): boolean {
    const node = this.#branches.get(name);
    if (!node) return false;
    this.#current = node;
    return true;
  }

  /** The divergent entry ids between two named branches. */
  divergence(left: string, right: string): HistoryDivergence | undefined {
    const leftNode = this.#branches.get(left);
    const rightNode = this.#branches.get(right);
    if (!leftNode || !rightNode) return undefined;
    const leftPath = pathToRoot(leftNode);
    const rightAncestors = new Set(pathToRoot(rightNode).map((node) => node.id));
    const ancestor = leftPath.find((node) => rightAncestors.has(node.id))!;
    return {
      left: idsBelow(leftNode, ancestor),
      right: idsBelow(rightNode, ancestor),
      commonAncestor: ancestor.id,
    };
  }

  inspect(): { readonly entries: number; readonly branches: readonly string[]; readonly redoOptions: number } {
    return {
      entries: this.#byId.size,
      branches: [...this.#branches.keys()].sort(),
      redoOptions: this.#current.children.length,
    };
  }

  #nextId(): string {
    return `entry-${++this.#counter}`;
  }
}

function pathToRoot<T>(node: HistoryNode<T>): HistoryNode<T>[] {
  const path: HistoryNode<T>[] = [];
  for (let at: HistoryNode<T> | undefined = node; at; at = at.parent) path.push(at);
  return path;
}

function idsBelow<T>(node: HistoryNode<T>, ancestor: HistoryNode<T>): string[] {
  const ids: string[] = [];
  for (let at: HistoryNode<T> | undefined = node; at && at !== ancestor; at = at.parent) ids.unshift(at.id);
  return ids;
}

/** Creates a branching history from an initial state. */
export function createBranchingHistory<T>(initial: T): BranchingHistory<T> {
  return new BranchingHistory(initial);
}
