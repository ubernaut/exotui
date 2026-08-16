// Copyright 2023 Im-Beast. MIT license.

// INP-007: bounded gesture recognition over the normalized pointer stream.
// Recognizers observe pointer events and emit semantic gestures — tap,
// long-press, pan, pinch — WITHOUT hiding the raw events: the host keeps
// dispatching them; the recognizer is a listener, not a filter. Thresholds
// are configurable, everything runs on the caller's clock, cancellation
// releases capture through the host hook, and single-pointer mouse input
// flows through the same paths untouched.

/** A normalized pointer event (subset of the INP-006 contract). */
export interface GesturePointerEvent {
  readonly pointerId: number;
  readonly type: "down" | "move" | "up" | "cancel";
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

/** Semantic gestures. */
export type GestureEvent =
  | { readonly kind: "tap"; readonly x: number; readonly y: number }
  | { readonly kind: "long-press"; readonly x: number; readonly y: number }
  | { readonly kind: "pan"; readonly deltaX: number; readonly deltaY: number }
  | { readonly kind: "pinch"; readonly scale: number }
  | { readonly kind: "cancelled" };

/** Configurable thresholds. */
export interface GestureOptions {
  /** Max movement for a tap (default 2 cells). */
  readonly tapSlop?: number;
  /** Hold time for a long-press (default 500ms). */
  readonly longPressMs?: number;
  /** Movement before a pan starts (default 3 cells). */
  readonly panThreshold?: number;
  /** Host hook: release pointer capture on cancellation. */
  readonly releaseCapture?: (pointerId: number) => void;
}

interface TrackedPointer {
  readonly startX: number;
  readonly startY: number;
  readonly startAt: number;
  lastX: number;
  lastY: number;
}

/** The recognizer. */
export class GestureRecognizer {
  readonly #options: GestureOptions;
  readonly #pointers = new Map<number, TrackedPointer>();
  readonly #listeners: Array<(gesture: GestureEvent) => void> = [];
  #panning = false;
  #longPressFired = false;
  #startDistance = 0;

  constructor(options: GestureOptions = {}) {
    this.#options = options;
  }

  onGesture(listener: (gesture: GestureEvent) => void): () => void {
    this.#listeners.push(listener);
    return () => {
      const index = this.#listeners.indexOf(listener);
      if (index >= 0) this.#listeners.splice(index, 1);
    };
  }

  /** Feeds one pointer event; raw events remain the host's to dispatch. */
  handle(event: GesturePointerEvent): void {
    switch (event.type) {
      case "down": {
        this.#pointers.set(event.pointerId, {
          startX: event.x,
          startY: event.y,
          startAt: event.at,
          lastX: event.x,
          lastY: event.y,
        });
        this.#longPressFired = false;
        if (this.#pointers.size === 2) this.#startDistance = this.#distance();
        break;
      }
      case "move": {
        const pointer = this.#pointers.get(event.pointerId);
        if (!pointer) return;
        const previousX = pointer.lastX;
        const previousY = pointer.lastY;
        pointer.lastX = event.x;
        pointer.lastY = event.y;
        if (this.#pointers.size === 2 && this.#startDistance > 0) {
          this.#emit({ kind: "pinch", scale: this.#distance() / this.#startDistance });
          return;
        }
        const moved = Math.hypot(event.x - pointer.startX, event.y - pointer.startY);
        if (this.#panning || moved >= (this.#options.panThreshold ?? 3)) {
          this.#panning = true;
          this.#emit({ kind: "pan", deltaX: event.x - previousX, deltaY: event.y - previousY });
        }
        break;
      }
      case "up": {
        const pointer = this.#pointers.get(event.pointerId);
        this.#pointers.delete(event.pointerId);
        if (!pointer || this.#pointers.size > 0) return;
        const moved = Math.hypot(pointer.lastX - pointer.startX, pointer.lastY - pointer.startY);
        if (!this.#panning && !this.#longPressFired && moved <= (this.#options.tapSlop ?? 2)) {
          this.#emit({ kind: "tap", x: pointer.startX, y: pointer.startY });
        }
        this.#panning = false;
        break;
      }
      case "cancel": {
        this.#pointers.delete(event.pointerId);
        this.#options.releaseCapture?.(event.pointerId);
        this.#panning = false;
        this.#emit({ kind: "cancelled" });
        break;
      }
    }
  }

  /** Advances the caller's clock; fires due long-presses. */
  advance(nowMs: number): void {
    if (this.#pointers.size !== 1 || this.#panning || this.#longPressFired) return;
    const [pointer] = this.#pointers.values();
    const moved = Math.hypot(pointer!.lastX - pointer!.startX, pointer!.lastY - pointer!.startY);
    if (moved <= (this.#options.tapSlop ?? 2) && nowMs - pointer!.startAt >= (this.#options.longPressMs ?? 500)) {
      this.#longPressFired = true;
      this.#emit({ kind: "long-press", x: pointer!.startX, y: pointer!.startY });
    }
  }

  inspect(): { readonly activePointers: number; readonly panning: boolean } {
    return { activePointers: this.#pointers.size, panning: this.#panning };
  }

  #distance(): number {
    const [first, second] = [...this.#pointers.values()];
    if (!first || !second) return 0;
    return Math.hypot(second.lastX - first.lastX, second.lastY - first.lastY);
  }

  #emit(gesture: GestureEvent): void {
    for (const listener of [...this.#listeners]) listener(gesture);
  }
}

/** Creates a gesture recognizer. */
export function createGestureRecognizer(options: GestureOptions = {}): GestureRecognizer {
  return new GestureRecognizer(options);
}
