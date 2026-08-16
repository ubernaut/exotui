// Copyright 2023 Im-Beast. MIT license.

// INP-004: the terminal preedit provider boundary. Ordinary TTYs cannot
// report IME state, so terminal IME support is never claimed unless a host
// attaches a provider; the bridge routes provider events into the INP-002
// composition controller, and detaching (or the provider erroring) cancels
// any active composition so no stale preedit can outlive its source.

import type { CompositionController } from "./composition.ts";

/** One provider-reported IME event. */
export type TerminalPreeditEvent =
  | { readonly type: "start"; readonly at?: number }
  | { readonly type: "update"; readonly preedit: string }
  | { readonly type: "commit"; readonly text?: string }
  | { readonly type: "cancel" };

/** A host-supplied source of terminal IME state. */
export interface TerminalPreeditProvider {
  readonly id: string;
  /** Subscribes to preedit events; returns the unsubscriber. */
  observe(listener: (event: TerminalPreeditEvent) => void): () => void;
}

/** Routes a provider's IME state into a composition controller. */
export class TerminalPreeditBridge {
  readonly #controller: CompositionController;
  #provider: TerminalPreeditProvider | undefined;
  #unsubscribe: (() => void) | undefined;

  constructor(controller: CompositionController) {
    this.#controller = controller;
  }

  /** True only while a provider is attached — the explicit TTY fallback. */
  get supported(): boolean {
    return this.#provider !== undefined;
  }

  /**
   * Attaches a provider (replacing any previous one). Returns the detacher;
   * detaching cancels an active composition and drops the support claim.
   */
  attach(provider: TerminalPreeditProvider): () => void {
    this.detach();
    this.#provider = provider;
    this.#unsubscribe = provider.observe((event) => this.#route(event));
    return () => {
      if (this.#provider === provider) this.detach();
    };
  }

  detach(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#provider = undefined;
    if (this.#controller.state.active) this.#controller.cancel();
  }

  inspect(): { readonly supported: boolean; readonly providerId?: string } {
    return { supported: this.supported, providerId: this.#provider?.id };
  }

  #route(event: TerminalPreeditEvent): void {
    if (!this.#provider) return; // stale event after detach
    switch (event.type) {
      case "start":
        this.#controller.start(event.at);
        break;
      case "update":
        this.#controller.update(event.preedit);
        break;
      case "commit":
        this.#controller.commit(event.text);
        break;
      case "cancel":
        this.#controller.cancel();
        break;
    }
  }
}

/** Creates a preedit bridge over a composition controller. */
export function createTerminalPreeditBridge(controller: CompositionController): TerminalPreeditBridge {
  return new TerminalPreeditBridge(controller);
}
