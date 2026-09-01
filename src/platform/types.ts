// Copyright 2023 Im-Beast. MIT license.
import type { EventEmitter } from "../event_emitter.ts";
import type { Signal } from "../signals/mod.ts";
import type { ConsoleSize } from "../types.ts";
import type {
  KeyPressEvent,
  MousePressEvent,
  MouseScrollEvent,
  PasteEvent,
  TerminalFocusEvent,
} from "../input_reader/types.ts";
import type { PointerInputEvent } from "../pointer_input.ts";

/** Object with an explicit cleanup hook for platform resources. */
export interface Disposable {
  dispose(): void;
}

/** Starts, stops, and reports lifecycle state for a runtime host. */
export interface LifecycleController {
  start(): void;
  stop(): void;
  inspect(): LifecycleInspection;
}

/** Snapshot of lifecycle state for tests and diagnostics. */
export interface LifecycleInspection {
  running: boolean;
  kind: string;
}

/** Input event names emitted by a platform input source. */
export interface PlatformInputEvents {
  keyPress: KeyPressEvent;
  mousePress: MousePressEvent;
  mouseScroll: MouseScrollEvent;
  paste: PasteEvent;
  terminalFocus: TerminalFocusEvent;
  /** Full-fidelity mouse, touch, or pen event when the host can preserve pointer identity and cancellation. */
  pointerInput: PointerInputEvent;
}

/** Event emitter contract accepted by platform input sources. */
export type PlatformInputEmitter = EventEmitter<{
  keyPress: { args: [KeyPressEvent] };
  mousePress: { args: [MousePressEvent] };
  mouseScroll: { args: [MouseScrollEvent] };
  paste: { args: [PasteEvent] };
  terminalFocus: { args: [TerminalFocusEvent] };
  pointerInput: { args: [PointerInputEvent] };
}>;

/** Runtime-specific input adapter that forwards events into the TUI event model. */
export interface InputSource extends Disposable {
  attach(emitter: PlatformInputEmitter): void;
  detach(): void;
  inspect(): InputSourceInspection;
  /**
   * Gives this source's input target focus, where that is meaningful.
   *
   * Optional because a terminal reads stdin and has nothing to focus; the
   * browser source routes keys through an element that must hold focus before
   * any key arrives.
   */
  focus?(): void;
}

/** Snapshot of input adapter state for tests and diagnostics. */
export interface InputSourceInspection {
  attached: boolean;
  kind: string;
}

/** Shared platform abstraction implemented by terminal and browser hosts. */
export interface TuiPlatform {
  readonly kind: "terminal" | "browser";
  readonly size: Signal<ConsoleSize>;
  readonly input: InputSource;
  readonly lifecycle: LifecycleController;
  now(): number;
  scheduleFrame(callback: () => void): Disposable;
}

/** Lifecycle controller for tests or hosts that do not need real start/stop hooks. */
export class NoopLifecycleController implements LifecycleController {
  #running = false;

  constructor(private readonly kind = "noop") {}

  start(): void {
    this.#running = true;
  }

  stop(): void {
    this.#running = false;
  }

  inspect(): LifecycleInspection {
    return { running: this.#running, kind: this.kind };
  }
}

/** Input source for tests or hosts that provide input through another channel. */
export class NoopInputSource implements InputSource {
  #attached = false;

  constructor(private readonly kind = "noop") {}

  attach(_emitter: PlatformInputEmitter): void {
    this.#attached = true;
  }

  detach(): void {
    this.#attached = false;
  }

  dispose(): void {
    this.detach();
  }

  inspect(): InputSourceInspection {
    return { attached: this.#attached, kind: this.kind };
  }
}
