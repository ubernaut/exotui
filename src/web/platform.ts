// Copyright 2023 Im-Beast. MIT license.
import { Signal } from "../signals/mod.ts";
import type { ConsoleSize } from "../types.ts";
import {
  type Disposable,
  type InputSource,
  type InputSourceInspection,
  type LifecycleController,
  NoopLifecycleController,
  type PlatformInputEmitter,
  type TuiPlatform,
} from "../platform/types.ts";
import type { Key, MousePressEvent } from "../input_reader/types.ts";
import { InputEnvelopeFactory } from "../input_envelope.ts";
import {
  adaptMousePointer,
  adaptPenPointer,
  adaptTouchPointer,
  type PointerInputDevice,
  type PointerInputEvent,
  type PointerInputKind,
} from "../pointer_input.ts";

/** Options for the browser platform adapter. */
export interface BrowserPlatformOptions {
  root: HTMLElement;
  columns?: number;
  rows?: number;
  cellWidth?: number;
  cellHeight?: number;
  touchAction?: string;
  userSelect?: string;
  textInput?: BrowserTextInputMode;
  input?: InputSource;
  lifecycle?: LifecycleController;
  scheduler?: BrowserFrameScheduler;
}

/** Browser keyboard strategy used to receive hardware and mobile software-keyboard input. */
export type BrowserTextInputMode = "auto" | "target" | "hidden" | false;

/** Options for pointer, wheel, keyboard, paste, and focus input capture. */
export interface BrowserInputSourceOptions {
  cellWidth?: number;
  cellHeight?: number;
  /** CSS touch-action applied while the input source is attached. Defaults to "none" for terminal-like gestures. */
  touchAction?: string;
  /** CSS user-select applied while the input source is attached. Defaults to "none". */
  userSelect?: string;
  /**
   * Text input target used for keyboard events. "auto" creates a hidden textarea when DOM APIs are available so
   * mobile browsers can show the software keyboard.
   */
  textInput?: BrowserTextInputMode;
  /** Caller-owned clock used for normalized pointer provenance. Defaults to performance.now. */
  now?: () => number;
}

/** Adapter around requestAnimationFrame-style frame scheduling. */
export interface BrowserFrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
  now(): number;
}

/** Browser implementation of the shared platform abstraction. */
export class BrowserPlatform implements TuiPlatform {
  readonly kind = "browser" as const;
  readonly size: Signal<ConsoleSize>;
  readonly input: InputSource;
  readonly lifecycle: LifecycleController;
  readonly #scheduler: BrowserFrameScheduler;
  readonly #resizeObserver?: ResizeObserver;

  constructor(options: BrowserPlatformOptions) {
    const cellWidth = options.cellWidth ?? 10;
    const cellHeight = options.cellHeight ?? 20;
    this.size = new Signal(
      options.columns && options.rows
        ? { columns: options.columns, rows: options.rows }
        : sizeFromElement(options.root, cellWidth, cellHeight),
      { deepObserve: true },
    );
    this.input = options.input ??
      new BrowserInputSource(options.root, {
        cellWidth,
        cellHeight,
        touchAction: options.touchAction,
        userSelect: options.userSelect,
        textInput: options.textInput,
      });
    this.lifecycle = options.lifecycle ?? new NoopLifecycleController("browser");
    this.#scheduler = options.scheduler ?? defaultBrowserFrameScheduler();

    if ("ResizeObserver" in globalThis) {
      this.#resizeObserver = new ResizeObserver(() => {
        const next = sizeFromElement(options.root, cellWidth, cellHeight);
        const current = this.size.peek();
        if (next.columns !== current.columns || next.rows !== current.rows) {
          current.columns = next.columns;
          current.rows = next.rows;
        }
      });
      this.#resizeObserver.observe(options.root);
    }
  }

  now(): number {
    return this.#scheduler.now();
  }

  scheduleFrame(callback: () => void): Disposable {
    const handle = this.#scheduler.request(() => callback());
    return { dispose: () => this.#scheduler.cancel(handle) };
  }

  dispose(): void {
    this.#resizeObserver?.disconnect();
    this.input.dispose();
    this.lifecycle.stop();
  }
}

/** DOM input source that converts browser events into normalized TUI input events. */
export class BrowserInputSource implements InputSource {
  readonly #target: HTMLElement;
  readonly #cellWidth: number;
  readonly #cellHeight: number;
  readonly #touchAction: string;
  readonly #userSelect: string;
  readonly #textInputMode: BrowserTextInputMode;
  readonly #inputFactory: InputEnvelopeFactory;
  #emitter?: PlatformInputEmitter;
  #attached = false;
  #removeListeners: Array<() => void> = [];
  #restoreStyles?: () => void;
  #keyboardTarget?: HTMLElement;
  #removeKeyboardTarget?: () => void;

  constructor(target: HTMLElement, options: BrowserInputSourceOptions = {}) {
    this.#target = target;
    this.#cellWidth = Math.max(1, options.cellWidth ?? 10);
    this.#cellHeight = Math.max(1, options.cellHeight ?? 20);
    this.#touchAction = options.touchAction ?? "none";
    this.#userSelect = options.userSelect ?? "none";
    this.#textInputMode = options.textInput ?? "auto";
    this.#inputFactory = new InputEnvelopeFactory({ now: options.now ?? (() => performance.now()) });
  }

  attach(emitter: PlatformInputEmitter): void {
    this.detach();
    this.#emitter = emitter;
    this.#target.tabIndex = this.#target.tabIndex < 0 ? 0 : this.#target.tabIndex;
    this.#restoreStyles = applyInputStyles(this.#target, this.#touchAction, this.#userSelect);
    const keyboardTarget = this.#createKeyboardTarget();
    this.#removeListeners = [
      addListener(keyboardTarget, "keydown", (event) => this.#handleKey(event as KeyboardEvent)),
      addListener(
        this.#target,
        "pointerdown",
        (event) => this.#handlePointer(event as PointerEvent, "down"),
        { passive: false },
      ),
      addListener(this.#target, "pointermove", (event) => this.#handlePointerMove(event as PointerEvent), {
        passive: false,
      }),
      addListener(this.#target, "pointerup", (event) => this.#handlePointer(event as PointerEvent, "up"), {
        passive: false,
      }),
      addListener(this.#target, "pointercancel", (event) => this.#handlePointer(event as PointerEvent, "cancel"), {
        passive: false,
      }),
      addListener(this.#target, "wheel", (event) => this.#handleWheel(event as WheelEvent), { passive: false }),
      addListener(keyboardTarget, "input", (event) => this.#handleTextInput(event), { passive: false }),
      addListener(keyboardTarget, "paste", (event) => this.#handlePaste(event as ClipboardEvent), { passive: false }),
      addListener(keyboardTarget, "focus", () => this.#handleFocus(true)),
      addListener(keyboardTarget, "blur", () => this.#handleFocus(false)),
    ];
    this.#attached = true;
  }

  detach(): void {
    for (const remove of this.#removeListeners) remove();
    this.#removeListeners = [];
    this.#restoreStyles?.();
    this.#restoreStyles = undefined;
    this.#removeKeyboardTarget?.();
    this.#removeKeyboardTarget = undefined;
    this.#keyboardTarget = undefined;
    this.#emitter = undefined;
    this.#attached = false;
  }

  dispose(): void {
    this.detach();
  }

  inspect(): InputSourceInspection {
    return { attached: this.#attached, kind: "browser" };
  }

  #handleKey(event: KeyboardEvent): void {
    const key = browserKey(event);
    if (!key) return;
    this.#emitter?.emit("keyPress", {
      key,
      meta: event.metaKey || event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      buffer: new TextEncoder().encode(event.key.length === 1 ? event.key : event.code),
    });
    event.preventDefault();
  }

  #handlePointer(event: PointerEvent, kind: "down" | "up" | "cancel"): void {
    const release = kind !== "down";
    // Capture can throw NotFoundError when the pointer is already gone — a
    // finger lifted before the handler ran, or a synthetic event — and the
    // down must still be emitted.
    try {
      if (kind === "down") {
        (this.#keyboardTarget ?? this.#target).focus({ preventScroll: true });
        this.#target.setPointerCapture?.(event.pointerId);
      } else if (this.#target.hasPointerCapture?.(event.pointerId)) {
        this.#target.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // The event still flows; only the capture failed.
    }
    const position = this.#cellPosition(event);
    this.#emitPointerInput(event, kind, position);
    this.#emitter?.emit("mousePress", {
      key: "mouse",
      x: position.x,
      y: position.y,
      movementX: event.movementX,
      movementY: event.movementY,
      meta: event.metaKey || event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      buffer: new Uint8Array(),
      // A down event starts capture; only pointermove is a drag update.
      drag: false,
      release,
      button: release ? undefined : browserButton(event.button),
    });
    event.preventDefault();
  }

  #handlePointerMove(event: PointerEvent): void {
    if (event.buttons === 0) return;
    const position = this.#cellPosition(event);
    this.#emitPointerInput(event, "move", position);
    this.#emitter?.emit("mousePress", {
      key: "mouse",
      x: position.x,
      y: position.y,
      movementX: event.movementX,
      movementY: event.movementY,
      meta: event.metaKey || event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      buffer: new Uint8Array(),
      drag: true,
      release: false,
      button: browserButton(event.button),
    });
    event.preventDefault();
  }

  #emitPointerInput(
    event: PointerEvent,
    kind: Extract<PointerInputKind, "down" | "move" | "up" | "cancel">,
    position: { x: number; y: number },
  ): void {
    const device = browserPointerDevice(event.pointerType);
    const targetRect = this.#target.getBoundingClientRect();
    const envelope = this.#inputFactory.create("browser", {
      kind: "pointer",
      device,
      modifiers: {
        alt: event.altKey === true,
        ctrl: event.ctrlKey === true,
        meta: event.metaKey === true,
        shift: event.shiftKey === true,
      },
      data: { phase: kind, pointerId: safePointerId(event.pointerId) },
    });
    const input = {
      pointerId: safePointerId(event.pointerId),
      kind,
      coordinates: {
        screen: { space: "screen" as const, x: finiteCoordinate(event.screenX), y: finiteCoordinate(event.screenY) },
        cell: { space: "cell" as const, x: position.x, y: position.y },
        local: {
          space: "local" as const,
          x: finiteCoordinate(event.clientX - targetRect.left),
          y: finiteCoordinate(event.clientY - targetRect.top),
        },
      },
      primary: event.isPrimary !== false,
      button: kind === "down" || kind === "up" ? browserButton(event.button) ?? null : null,
      buttons: kind === "up" || kind === "cancel" ? 0 : safeButtons(event.buttons, kind),
      ...pointerAnalogFields(event, device),
    };
    let pointer: PointerInputEvent;
    if (device === "touch") pointer = adaptTouchPointer(envelope, input);
    else if (device === "pen") pointer = adaptPenPointer(envelope, input);
    else pointer = adaptMousePointer(envelope, input);
    this.#emitter?.emit("pointerInput", pointer);
  }

  #handleWheel(event: WheelEvent): void {
    const position = this.#cellPosition(event);
    this.#emitter?.emit("mouseScroll", {
      key: "mouse",
      x: position.x,
      y: position.y,
      movementX: 0,
      movementY: event.deltaY,
      meta: event.metaKey || event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      buffer: new Uint8Array(),
      drag: false,
      scroll: event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0,
    });
    event.preventDefault();
  }

  #handlePaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text") ?? "";
    this.#emitter?.emit("paste", {
      key: "paste",
      text,
      buffer: new TextEncoder().encode(text),
    });
    event.preventDefault();
  }

  #handleTextInput(event: Event): void {
    const target = event.target as EventTarget & { value?: string };
    const text = typeof target.value === "string" ? target.value : "";
    if (!text) return;
    target.value = "";
    for (const char of text) this.#emitCharacter(char);
    event.preventDefault();
  }

  #handleFocus(focused: boolean): void {
    this.#emitter?.emit("terminalFocus", {
      key: "focus",
      focused,
      buffer: new Uint8Array(),
    });
  }

  #cellPosition(event: MouseEvent): { x: number; y: number } {
    const rect = this.#target.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor((event.clientX - rect.left) / this.#cellWidth)),
      y: Math.max(0, Math.floor((event.clientY - rect.top) / this.#cellHeight)),
    };
  }

  #createKeyboardTarget(): HTMLElement {
    const hidden = this.#textInputMode !== false && this.#textInputMode !== "target"
      ? createHiddenTextInput(this.#target)
      : undefined;
    if (hidden) {
      this.#keyboardTarget = hidden.element;
      this.#removeKeyboardTarget = hidden.dispose;
      return hidden.element;
    }
    this.#keyboardTarget = this.#target;
    return this.#target;
  }

  #emitCharacter(char: string): void {
    const key = char === "\n" || char === "\r" ? "return" : char === " " ? "space" : char.toLowerCase() as Key;
    this.#emitter?.emit("keyPress", {
      key,
      meta: false,
      ctrl: false,
      shift: false,
      buffer: new TextEncoder().encode(char),
    });
  }
}

/** Creates a browser platform adapter from DOM sizing and input options. */
export function createBrowserPlatform(options: BrowserPlatformOptions): BrowserPlatform {
  return new BrowserPlatform(options);
}

function sizeFromElement(root: HTMLElement, cellWidth: number, cellHeight: number): ConsoleSize {
  const rect = root.getBoundingClientRect();
  return {
    columns: Math.max(1, Math.floor(rect.width / cellWidth)),
    rows: Math.max(1, Math.floor(rect.height / cellHeight)),
  };
}

function addListener(
  target: HTMLElement,
  type: string,
  listener: EventListener,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener(type, listener, options);
}

function applyInputStyles(target: HTMLElement, touchAction: string, userSelect: string): () => void {
  const style = (target as HTMLElement & {
    style?: CSSStyleDeclaration & { webkitUserSelect?: string };
  }).style;
  if (!style) return () => undefined;
  const previousTouchAction = style.touchAction;
  const previousUserSelect = style.userSelect;
  const previousWebkitUserSelect = style.webkitUserSelect;
  style.touchAction = touchAction;
  style.userSelect = userSelect;
  style.webkitUserSelect = userSelect;
  return () => {
    style.touchAction = previousTouchAction;
    style.userSelect = previousUserSelect;
    style.webkitUserSelect = previousWebkitUserSelect;
  };
}

function createHiddenTextInput(target: HTMLElement): { element: HTMLElement; dispose: () => void } | undefined {
  const document = target.ownerDocument ?? globalThis.document;
  if (!document?.createElement) return undefined;
  const textarea = document.createElement("textarea");
  textarea.tabIndex = 0;
  textarea.setAttribute("aria-hidden", "true");
  textarea.setAttribute("autocapitalize", "off");
  textarea.setAttribute("autocomplete", "off");
  textarea.setAttribute("autocorrect", "off");
  textarea.setAttribute("spellcheck", "false");
  // A focused textarea summons the on-screen keyboard on touch devices, and
  // the desktop's demos are driven by painted buttons there instead — the
  // OSK stays down. Hardware keyboards still deliver keydown as before.
  if (globalThis.matchMedia?.("(pointer: coarse)").matches) {
    textarea.setAttribute("inputmode", "none");
    textarea.setAttribute("virtualkeyboardpolicy", "manual");
  }
  textarea.style.position = "fixed";
  textarea.style.left = "0";
  textarea.style.top = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.zIndex = "-1";
  textarea.style.resize = "none";
  textarea.style.border = "0";
  textarea.style.padding = "0";
  textarea.style.margin = "0";
  const parent = document.body ?? target;
  parent.appendChild(textarea);
  return {
    element: textarea,
    dispose: () => textarea.remove(),
  };
}

function browserButton(button: number): MousePressEvent["button"] {
  return button === 0 || button === 1 || button === 2 ? button : 0;
}

function browserPointerDevice(value: string | undefined): PointerInputDevice {
  return value === "touch" || value === "pen" ? value : "mouse";
}

function safePointerId(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeButtons(value: number, kind: PointerInputKind): number {
  if (Number.isSafeInteger(value) && value >= 0 && value <= 63) return value;
  return kind === "down" || kind === "move" ? 1 : 0;
}

function finiteCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function pointerAnalogFields(event: PointerEvent, device: PointerInputDevice): {
  pressure?: number;
  tangentialPressure?: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
  contact?: { width: number; height: number };
} {
  const output: {
    pressure?: number;
    tangentialPressure?: number;
    tiltX?: number;
    tiltY?: number;
    twist?: number;
    contact?: { width: number; height: number };
  } = {};
  if (Number.isFinite(event.pressure) && event.pressure >= 0 && event.pressure <= 1) {
    output.pressure = event.pressure;
  }
  if (
    (device === "touch" || device === "pen") && Number.isFinite(event.width) && event.width >= 0 &&
    Number.isFinite(event.height) && event.height >= 0
  ) {
    output.contact = { width: event.width, height: event.height };
  }
  if (device === "pen") {
    if (
      Number.isFinite(event.tangentialPressure) && event.tangentialPressure >= -1 &&
      event.tangentialPressure <= 1
    ) output.tangentialPressure = event.tangentialPressure;
    if (Number.isFinite(event.tiltX) && event.tiltX >= -90 && event.tiltX <= 90) output.tiltX = event.tiltX;
    if (Number.isFinite(event.tiltY) && event.tiltY >= -90 && event.tiltY <= 90) output.tiltY = event.tiltY;
    if (Number.isSafeInteger(event.twist) && event.twist >= 0 && event.twist <= 359) output.twist = event.twist;
  }
  return output;
}

function browserKey(event: KeyboardEvent): Key | undefined {
  if (event.key.length === 1) {
    return event.key === " " ? "space" : event.key.toLowerCase() as Key;
  }
  const mapped: Record<string, Key> = {
    Enter: "return",
    Tab: "tab",
    Backspace: "backspace",
    Escape: "escape",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Delete: "delete",
    Insert: "insert",
    PageUp: "pageup",
    PageDown: "pagedown",
    Home: "home",
    End: "end",
  };
  if (event.key in mapped) return mapped[event.key]!;
  if (/^F([1-9]|1[0-2])$/.test(event.key)) return event.key.toLowerCase() as Key;
  return undefined;
}

function defaultBrowserFrameScheduler(): BrowserFrameScheduler {
  const request = globalThis.requestAnimationFrame ?? ((callback: FrameRequestCallback) => {
    return setTimeout(() => callback(performance.now()), 1000 / 60) as unknown as number;
  });
  const cancel = globalThis.cancelAnimationFrame ?? ((handle: number) => clearTimeout(handle));
  return {
    request: (callback) => request(callback),
    cancel: (handle) => cancel(handle),
    now: () => performance.now(),
  };
}
