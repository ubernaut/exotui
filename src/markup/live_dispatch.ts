// Copyright 2023 Im-Beast. MIT license.

// D1 second slice: targeted event dispatch over the live markup tree.
// Handlers register against CSS-like selectors and fire in DOM order —
// capture from the root down, target, then bubble back up — with
// stopPropagation and preventDefault semantics and deterministic
// registration-order invocation at each node. The dispatcher owns no node
// state: it resolves the ancestor path through the tree at dispatch time, so
// tree mutations between dispatches need no bookkeeping here.

import type { LayoutNode } from "../layout/solver.ts";
import { matchesCssSelector } from "./cascade.ts";
import type { LiveMarkupTree } from "./live_tree.ts";

/** One dispatched event. */
export interface LiveMarkupEvent {
  readonly type: string;
  readonly detail?: unknown;
}

/** Per-invocation context handed to handlers. */
export interface LiveMarkupEventContext {
  /** The node the event was dispatched to. */
  readonly target: LayoutNode;
  /** The node whose handler is currently running. */
  readonly currentTarget: LayoutNode;
  readonly phase: "capture" | "target" | "bubble";
  readonly defaultPrevented: boolean;
  /** Stops the walk after the current node's handlers finish. */
  stopPropagation(): void;
  preventDefault(): void;
}

/** Handler signature. */
export type LiveMarkupHandler = (event: LiveMarkupEvent, context: LiveMarkupEventContext) => void;

/** Result of one dispatch. */
export interface LiveMarkupDispatchResult {
  readonly invoked: number;
  readonly defaultPrevented: boolean;
  readonly stopped: boolean;
}

interface Registration {
  readonly selector: string;
  readonly type: string;
  readonly handler: LiveMarkupHandler;
  readonly capture: boolean;
  disposed: boolean;
}

const MAX_HANDLERS = 512;

/**
 * Selector-routed event dispatch over one live tree. Registration order is
 * invocation order at each node; the phase walk is capture (root → parent),
 * target (both capture and bubble handlers), bubble (parent → root).
 */
export class LiveMarkupDispatcher {
  readonly #tree: LiveMarkupTree;
  #registrations: Registration[] = [];
  #disposed = false;

  constructor(tree: LiveMarkupTree) {
    this.#tree = tree;
  }

  /** Registers a handler; returns its disposer. */
  on(
    selector: string,
    type: string,
    handler: LiveMarkupHandler,
    options: { readonly capture?: boolean } = {},
  ): () => void {
    if (this.#disposed) throw new Error("LiveMarkupDispatcher is disposed");
    if (this.#registrations.length >= MAX_HANDLERS) {
      throw new RangeError(`dispatcher holds ${MAX_HANDLERS} handlers; dispose some before adding more`);
    }
    const registration: Registration = { selector, type, handler, capture: options.capture === true, disposed: false };
    this.#registrations.push(registration);
    return () => {
      registration.disposed = true;
      this.#registrations = this.#registrations.filter((entry) => !entry.disposed);
    };
  }

  /** Dispatches an event to a node by id. */
  dispatch(targetId: string, event: LiveMarkupEvent): LiveMarkupDispatchResult {
    if (this.#disposed) throw new Error("LiveMarkupDispatcher is disposed");
    const target = this.#tree.node(targetId);
    if (!target) return { invoked: 0, defaultPrevented: false, stopped: false };

    // Root-first path to the target, resolved fresh so prior mutations count.
    const path: LayoutNode[] = [];
    for (let node: LayoutNode | undefined = target; node; node = this.#tree.parentOf(node.id)) {
      path.unshift(node);
    }

    let invoked = 0;
    let defaultPrevented = false;
    let stopped = false;

    const runNode = (index: number, phase: "capture" | "target" | "bubble"): void => {
      const currentTarget = path[index]!;
      const ancestors = path.slice(0, index);
      for (const registration of [...this.#registrations]) {
        if (registration.disposed || registration.type !== event.type) continue;
        if (phase === "capture" && !registration.capture) continue;
        if (phase === "bubble" && registration.capture) continue;
        if (!matchesCssSelector(registration.selector, currentTarget, ancestors)) continue;
        const context: LiveMarkupEventContext = {
          target,
          currentTarget,
          phase,
          get defaultPrevented() {
            return defaultPrevented;
          },
          stopPropagation: () => {
            stopped = true;
          },
          preventDefault: () => {
            defaultPrevented = true;
          },
        };
        invoked += 1;
        registration.handler(event, context);
      }
    };

    for (let index = 0; index < path.length - 1 && !stopped; index += 1) runNode(index, "capture");
    if (!stopped) runNode(path.length - 1, "target");
    for (let index = path.length - 2; index >= 0 && !stopped; index -= 1) runNode(index, "bubble");

    return { invoked, defaultPrevented, stopped };
  }

  /** Registered-handler count (for inspection and leak tests). */
  get handlerCount(): number {
    return this.#registrations.length;
  }

  dispose(): void {
    this.#disposed = true;
    this.#registrations = [];
  }
}

/** Creates a dispatcher over a live markup tree. */
export function createLiveMarkupDispatcher(tree: LiveMarkupTree): LiveMarkupDispatcher {
  return new LiveMarkupDispatcher(tree);
}
