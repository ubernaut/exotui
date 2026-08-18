// Copyright 2023 Im-Beast. MIT license.

// Deciding what a sequence of pointer events means.
//
// A press is not yet a click: it becomes a click only if the pointer lifts
// without travelling, a drag only if it travels, and the second half of a
// double click only if a matching click preceded it recently enough. Judging
// too early is a real bug class — deciding "double click" on the second press
// steals every drag that starts with a click, because a maximized window
// cannot be dragged and the gesture appears to do nothing.
//
// This is a pure reducer over plain data: no clock of its own (timestamps
// arrive on the events), no capture, no window knowledge. That makes the whole
// decision table testable in microseconds instead of by mounting a desktop and
// sleeping past a timer.

/** A pointer event as far as gesture recognition is concerned. */
export interface PointerGestureEvent {
  readonly kind: "down" | "move" | "up" | "cancel";
  /** What the pointer is over: a window id, a control id, any stable name. */
  readonly id?: string;
  readonly column: number;
  readonly row: number;
  /** Caller's clock, in milliseconds; the reducer never reads a clock. */
  readonly timestamp: number;
}

/** What a completed sequence turned out to be. */
export type PointerGestureOutcome =
  | { readonly kind: "none" }
  /** The pointer lifted without travelling. */
  | { readonly kind: "click"; readonly id: string }
  /** A second click on the same thing, inside the double-click window. */
  | { readonly kind: "double-click"; readonly id: string }
  /** The pointer travelled while held: this is a drag, not a click. */
  | { readonly kind: "drag"; readonly id: string }
  /**
   * A press arrived while a press was already open, so the release was lost —
   * one dropped event used to wedge a desktop until it was restarted.
   */
  | { readonly kind: "recovered"; readonly id: string };

/** Reducer state. Treat as opaque; it is plain data so it clones and prints. */
export interface PointerGestureState {
  readonly held?: {
    readonly id: string;
    readonly column: number;
    readonly row: number;
    readonly moved: boolean;
  };
  readonly lastClick?: {
    readonly id: string;
    readonly at: number;
  };
}

/** Tuning for the decision table. */
export interface PointerGestureOptions {
  /** How close together two clicks must be to count as a double click. */
  readonly doubleClickMs?: number;
}

const DEFAULT_DOUBLE_CLICK_MS = 400;

/** A gesture state with nothing in flight. */
export function createPointerGestureState(): PointerGestureState {
  return {};
}

const NONE: PointerGestureOutcome = { kind: "none" };

/**
 * Advances the gesture by one event, returning the new state and what the
 * event completed. Never mutates its input.
 */
export function reducePointerGesture(
  state: PointerGestureState,
  event: PointerGestureEvent,
  options: PointerGestureOptions = {},
): { readonly state: PointerGestureState; readonly outcome: PointerGestureOutcome } {
  const doubleClickMs = options.doubleClickMs ?? DEFAULT_DOUBLE_CLICK_MS;

  switch (event.kind) {
    case "down": {
      const id = event.id;
      // A press with nothing under it clears anything in flight rather than
      // leaving a gesture attached to something the pointer already left.
      if (id === undefined) return { state: { lastClick: state.lastClick }, outcome: NONE };
      const held = { id, column: event.column, row: event.row, moved: false };
      // A press while a press is open proves the release never arrived.
      if (state.held) {
        return { state: { held, lastClick: state.lastClick }, outcome: { kind: "recovered", id: state.held.id } };
      }
      return { state: { held, lastClick: state.lastClick }, outcome: NONE };
    }

    case "move": {
      const held = state.held;
      if (!held) return { state, outcome: NONE };
      if (held.moved) return { state, outcome: NONE };
      if (event.column === held.column && event.row === held.row) return { state, outcome: NONE };
      // First travel while held: from here the sequence is a drag, and a
      // double click can no longer claim it.
      return {
        state: { held: { ...held, moved: true }, lastClick: undefined },
        outcome: { kind: "drag", id: held.id },
      };
    }

    case "up": {
      const held = state.held;
      if (!held) return { state, outcome: NONE };
      if (held.moved) return { state: { lastClick: undefined }, outcome: NONE };
      const previous = state.lastClick;
      const doubled = previous !== undefined && previous.id === held.id &&
        event.timestamp >= previous.at && event.timestamp - previous.at <= doubleClickMs;
      if (doubled) {
        // A double click consumes its history: three clicks are not two doubles.
        return { state: {}, outcome: { kind: "double-click", id: held.id } };
      }
      return {
        state: { lastClick: { id: held.id, at: event.timestamp } },
        outcome: { kind: "click", id: held.id },
      };
    }

    case "cancel":
      return { state: { lastClick: state.lastClick }, outcome: NONE };
  }
}
