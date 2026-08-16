// Copyright 2023 Im-Beast. MIT license.

// INP-002: IME composition as an explicit state machine. The committed value
// and the preedit are separate strings — start/update never touch the
// committed text, display is a pure projection (committed with the preedit
// inserted), and only commit() splices, at a grapheme boundary, as one
// recorded transaction. cancel() drops the preedit and records the no-op
// transaction, so undo systems treat a whole composition as a single step in
// either direction.

import { isGraphemeBoundary, previousGraphemeBoundary } from "../unicode/grapheme.ts";

/** A composition lifecycle event. */
export interface CompositionEvent {
  readonly type: "start" | "update" | "commit" | "cancel";
  readonly preedit: string;
}

/** The controller's observable state. */
export interface CompositionState {
  /** The committed value; never mutated by start/update. */
  readonly committed: string;
  readonly active: boolean;
  readonly preedit: string;
  /** UTF-16 offset in `committed` where the preedit renders and will land. */
  readonly preeditStart: number;
  /** committed with the preedit inserted — what an editor displays. */
  readonly display: string;
  /** The preedit's range in `display` (for underline styling), if active. */
  readonly preeditRange?: { readonly start: number; readonly end: number };
}

/** One finished composition, sized for single-step undo. */
export interface CompositionTransaction {
  readonly kind: "commit" | "cancel";
  readonly before: string;
  readonly after: string;
  /** Text committed at `at` ("" for cancel). */
  readonly inserted: string;
  readonly at: number;
}

const MAX_TRANSACTIONS = 64;

/** IME preedit state machine over one committed string. */
export class CompositionController {
  #committed: string;
  #preedit = "";
  #preeditStart = 0;
  #active = false;
  #transactions: CompositionTransaction[] = [];
  readonly #onEvent: ((event: CompositionEvent) => void) | undefined;

  constructor(options: { readonly value?: string; readonly onEvent?: (event: CompositionEvent) => void } = {}) {
    this.#committed = options.value ?? "";
    this.#onEvent = options.onEvent;
  }

  get state(): CompositionState {
    const display = this.#active
      ? this.#committed.slice(0, this.#preeditStart) + this.#preedit + this.#committed.slice(this.#preeditStart)
      : this.#committed;
    return {
      committed: this.#committed,
      active: this.#active,
      preedit: this.#preedit,
      preeditStart: this.#preeditStart,
      display,
      preeditRange: this.#active
        ? { start: this.#preeditStart, end: this.#preeditStart + this.#preedit.length }
        : undefined,
    };
  }

  /**
   * Begins a composition at an offset, snapped back to a grapheme boundary
   * so the eventual commit can never splice into a cluster. Rejected while
   * a composition is already active.
   */
  start(at: number = this.#committed.length): boolean {
    if (this.#active) return false;
    const clamped = Math.max(0, Math.min(this.#committed.length, Math.floor(at)));
    this.#preeditStart = isGraphemeBoundary(this.#committed, clamped)
      ? clamped
      : previousGraphemeBoundary(this.#committed, clamped);
    this.#active = true;
    this.#preedit = "";
    this.#onEvent?.({ type: "start", preedit: "" });
    return true;
  }

  /** Replaces the preedit; the committed value is untouched. */
  update(preedit: string): boolean {
    if (!this.#active) return false;
    this.#preedit = preedit;
    this.#onEvent?.({ type: "update", preedit });
    return true;
  }

  /** Commits `text` (default: the preedit) as one transaction. */
  commit(text: string = this.#preedit): CompositionTransaction | undefined {
    if (!this.#active) return undefined;
    const before = this.#committed;
    this.#committed = before.slice(0, this.#preeditStart) + text + before.slice(this.#preeditStart);
    const transaction: CompositionTransaction = Object.freeze({
      kind: "commit" as const,
      before,
      after: this.#committed,
      inserted: text,
      at: this.#preeditStart,
    });
    this.#finish(transaction, { type: "commit", preedit: text });
    return transaction;
  }

  /** Drops the preedit; the committed value is exactly as before start(). */
  cancel(): CompositionTransaction | undefined {
    if (!this.#active) return undefined;
    const transaction: CompositionTransaction = Object.freeze({
      kind: "cancel" as const,
      before: this.#committed,
      after: this.#committed,
      inserted: "",
      at: this.#preeditStart,
    });
    this.#finish(transaction, { type: "cancel", preedit: "" });
    return transaction;
  }

  /** Bounded transaction journal — one entry per whole composition. */
  transactions(): readonly CompositionTransaction[] {
    return [...this.#transactions];
  }

  #finish(transaction: CompositionTransaction, event: CompositionEvent): void {
    this.#active = false;
    this.#preedit = "";
    if (this.#transactions.length >= MAX_TRANSACTIONS) this.#transactions.shift();
    this.#transactions.push(transaction);
    this.#onEvent?.(event);
  }
}

/** Creates a composition controller over an initial committed value. */
export function createCompositionController(
  options: { readonly value?: string; readonly onEvent?: (event: CompositionEvent) => void } = {},
): CompositionController {
  return new CompositionController(options);
}
