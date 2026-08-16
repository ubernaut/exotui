// Copyright 2023 Im-Beast. MIT license.

// NAV-003: nested route trees and named outlets as a resolution layer over
// the existing router and screen stack — it owns no navigation and no
// screens, it only answers which nodes a path activates, which outlets they
// fill, and exactly what changed. Parent nodes persist across child
// replacement (their lifecycle sees nothing), exits report child-first, and
// outlet focus order follows tree declaration order — deterministic under
// any child swap.

/** One node of the route tree. */
export interface RouteNode {
  readonly id: string;
  /** Path segment: a literal ("users") or a parameter (":id"). */
  readonly segment: string;
  /** Named outlet this node renders into (default "main"). */
  readonly outlet?: string;
  readonly children?: readonly RouteNode[];
}

/** A resolved activation. */
export interface RouteActivation {
  /** The matched chain, parent first. */
  readonly chain: readonly string[];
  readonly params: Readonly<Record<string, string>>;
  /** Nodes newly entered, parent first. */
  readonly entered: readonly string[];
  /** Nodes exited from the previous activation, child first. */
  readonly exited: readonly string[];
  /** Nodes present in both activations. */
  readonly retained: readonly string[];
  /** outlet name → node id, for every outlet the chain fills. */
  readonly outlets: Readonly<Record<string, string>>;
  /** Outlet names in deterministic declaration order along the chain. */
  readonly focusOrder: readonly string[];
}

interface MatchedNode {
  readonly node: RouteNode;
  readonly params: Record<string, string>;
}

/** The tree; `activate` computes deterministic diffs between activations. */
export class RouteOutletTree {
  readonly #roots: readonly RouteNode[];
  #active: readonly string[] = [];

  constructor(roots: readonly RouteNode[]) {
    this.#roots = roots;
  }

  /** Matches a path to a node chain; undefined when nothing matches fully. */
  match(path: string): { readonly chain: readonly RouteNode[]; readonly params: Record<string, string> } | undefined {
    const segments = path.split("/").filter((segment) => segment.length > 0);
    const chain: RouteNode[] = [];
    const params: Record<string, string> = {};
    let level: readonly RouteNode[] = this.#roots;
    for (const segment of segments) {
      const matched = matchLevel(level, segment);
      if (!matched) return undefined;
      chain.push(matched.node);
      Object.assign(params, matched.params);
      level = matched.node.children ?? [];
    }
    return chain.length > 0 ? { chain, params } : undefined;
  }

  /** Activates a path, diffing against the previous activation. */
  activate(path: string): RouteActivation | undefined {
    const matched = this.match(path);
    if (!matched) return undefined;
    const chain = matched.chain.map((node) => node.id);
    // The shared prefix persists: its lifecycle sees nothing.
    let shared = 0;
    while (shared < chain.length && shared < this.#active.length && chain[shared] === this.#active[shared]) {
      shared += 1;
    }
    const exited = this.#active.slice(shared).reverse(); // child-first teardown
    const entered = chain.slice(shared); // parent-first entry
    const retained = chain.slice(0, shared);
    this.#active = chain;

    const outlets: Record<string, string> = {};
    const focusOrder: string[] = [];
    for (const node of matched.chain) {
      const outlet = node.outlet ?? "main";
      outlets[outlet] = node.id; // the deepest node wins its outlet
      if (!focusOrder.includes(outlet)) focusOrder.push(outlet);
    }
    return { chain, params: matched.params, entered, exited, retained, outlets, focusOrder };
  }

  get active(): readonly string[] {
    return [...this.#active];
  }
}

function matchLevel(level: readonly RouteNode[], segment: string): MatchedNode | undefined {
  // Literal matches win over parameters, deterministically.
  for (const node of level) {
    if (node.segment === segment) return { node, params: {} };
  }
  for (const node of level) {
    if (node.segment.startsWith(":")) return { node, params: { [node.segment.slice(1)]: segment } };
  }
  return undefined;
}

/** Creates a route/outlet tree. */
export function createRouteOutletTree(roots: readonly RouteNode[]): RouteOutletTree {
  return new RouteOutletTree(roots);
}
