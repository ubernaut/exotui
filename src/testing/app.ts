// Copyright 2023 Im-Beast. MIT license.
import type { Canvas } from "../canvas/canvas.ts";
import type { KeyPressEvent, MouseScrollEvent } from "../input_reader/types.ts";
import type { TuiOptions } from "../tui.ts";
import type { ConsoleSize, Stdin, Stdout } from "../types.ts";
import type { Action } from "../app/actions.ts";
import type { MouseInteractionDispatchResult, MouseInteractionInspection } from "../app/mouse_bindings.ts";
import type { Route } from "../app/router.ts";
import { createTerminalApp, type TerminalApp, type TerminalAppOptions } from "../app/terminal_app.ts";
import { createTestKeyPress, createTestMousePress, createTestMouseScroll, type TestKeyPressOptions } from "./input.ts";
import { captureTerminalScene, type TerminalSceneCapture } from "./scene.ts";
import { canvasSnapshot, createTestCanvas, createTestStdout, type TestStdout } from "./snapshot.ts";

/** TUI construction options accepted by a headless terminal app harness. */
export type TestTerminalAppTuiOptions = Omit<TuiOptions, "canvas" | "stdout" | "manageTerminalSize">;

/** Options for creating a headless terminal app and interaction pilot. */
export type TestTerminalAppOptions<TAction extends Action = Action, TRoute extends Route = Route> =
  & Omit<TerminalAppOptions<TAction, TRoute>, "tui" | "tuiOptions" | "input" | "exitOnSignal">
  & {
    size?: ConsoleSize;
    tuiOptions?: TestTerminalAppTuiOptions;
    settleTimeoutMs?: number;
  };

/** Pointer modifiers and motion attached to pilot click and scroll events. */
export interface TerminalAppPilotPointerOptions {
  button?: 0 | 1 | 2;
  movementX?: number;
  movementY?: number;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
}

/** Options controlling how long a pilot waits for async action handlers. */
export interface TerminalAppPilotSettleOptions {
  timeoutMs?: number;
}

/** Polling options for pilot state waits. */
export interface TerminalAppPilotWaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  message?: string;
}

/** Press and release routing results from one pilot click. */
export interface TerminalAppPilotClickResult {
  press: MouseInteractionDispatchResult;
  release: MouseInteractionDispatchResult;
}

/** Options for one pilot drag gesture. */
export interface TerminalAppPilotDragOptions extends TerminalAppPilotPointerOptions {
  /** Intermediate motion events between press and release (default 1). */
  steps?: number;
}

/** Press, motion, and release routing results from one pilot drag. */
export interface TerminalAppPilotDragResult {
  press: MouseInteractionDispatchResult;
  moves: MouseInteractionDispatchResult[];
  release: MouseInteractionDispatchResult;
}

/** Headless app, canvas, output capture, and pilot returned to downstream tests. */
export interface TestTerminalAppHarness<TAction extends Action = Action, TRoute extends Route = Route> {
  app: TerminalApp<TAction, TRoute>;
  canvas: Canvas;
  stdout: TestStdout;
  pilot: TerminalAppPilot<TAction, TRoute>;
  destroy(): void;
}

/** Async interaction driver for a real TerminalApp running on an in-memory canvas. */
export class TerminalAppPilot<TAction extends Action = Action, TRoute extends Route = Route> {
  readonly app: TerminalApp<TAction, TRoute>;
  readonly canvas: Canvas;
  readonly stdout: TestStdout;
  readonly #settleTimeoutMs: number;
  #destroyed = false;

  constructor(options: {
    app: TerminalApp<TAction, TRoute>;
    canvas: Canvas;
    stdout: TestStdout;
    settleTimeoutMs?: number;
  }) {
    this.app = options.app;
    this.canvas = options.canvas;
    this.stdout = options.stdout;
    this.#settleTimeoutMs = normalizeTimeout(options.settleTimeoutMs, 1_000);
  }

  /** Emits one decoded key press and waits for resulting actions and rendering. */
  async press(key: KeyPressEvent["key"], options: TestKeyPressOptions = {}): Promise<void> {
    this.#assertActive();
    const event = createTestKeyPress(key, options);
    this.app.tui.emit("inputEvent", event);
    this.app.tui.emit("keyPress", event);
    await this.settle();
  }

  /** Emits a complete pointer click and returns app-router dispatch details. */
  async click(
    x: number,
    y: number,
    options: TerminalAppPilotPointerOptions = {},
  ): Promise<TerminalAppPilotClickResult> {
    this.#assertActive();
    const pressEvent = createTestMousePress({ ...options, x, y, release: false });
    const press = await this.#dispatchMousePress(pressEvent);
    const releaseEvent = createTestMousePress({ ...options, x, y, release: true, button: undefined });
    const release = await this.#dispatchMousePress(releaseEvent);
    return { press, release };
  }

  /** Emits one pointer scroll event and returns app-router dispatch details. */
  async scroll(
    direction: MouseScrollEvent["scroll"],
    x: number,
    y: number,
    options: Omit<TerminalAppPilotPointerOptions, "button"> = {},
  ): Promise<MouseInteractionDispatchResult> {
    this.#assertActive();
    const event = createTestMouseScroll(direction, { ...options, x, y });
    this.app.tui.emit("inputEvent", event);
    this.app.tui.emit("mouseEvent", event);
    const result = await this.app.mouse.dispatch(event);
    this.app.tui.emit("mouseScroll", event);
    await this.settle();
    return result;
  }

  /** Returns every registered mouse target's inspection snapshot. */
  targets(): MouseInteractionInspection[] {
    this.#assertActive();
    return this.app.mouse.inspect();
  }

  /** Resolves one registered mouse target by ID, throwing when absent. */
  target(id: string): MouseInteractionInspection {
    const found = this.targets().find((target) => target.id === id);
    if (!found) {
      const known = this.targets().map((target) => target.id).join(", ");
      throw new Error(`Mouse target "${id}" is not registered. Known targets: ${known || "(none)"}.`);
    }
    return found;
  }

  /** Finds the topmost registered mouse target matching a selector predicate. */
  findTarget(selector: (target: MouseInteractionInspection) => boolean): MouseInteractionInspection | undefined {
    return this.targets().find(selector);
  }

  /** Clicks the center of one registered mouse target by ID. */
  async clickTarget(id: string, options: TerminalAppPilotPointerOptions = {}): Promise<TerminalAppPilotClickResult> {
    const { column, row, width, height } = this.target(id).bounds;
    return await this.click(column + Math.floor(width / 2), row + Math.floor(height / 2), options);
  }

  /** Emits pointer motion without a press — the hover path to drag handlers. */
  async hover(
    x: number,
    y: number,
    options: Omit<TerminalAppPilotPointerOptions, "button"> = {},
  ): Promise<MouseInteractionDispatchResult> {
    this.#assertActive();
    const event = createTestMousePress({ ...options, x, y, drag: true, release: false });
    return await this.#dispatchMousePress(event);
  }

  /** Hovers the center of one registered mouse target by ID. */
  async hoverTarget(
    id: string,
    options: Omit<TerminalAppPilotPointerOptions, "button"> = {},
  ): Promise<MouseInteractionDispatchResult> {
    const { column, row, width, height } = this.target(id).bounds;
    return await this.hover(column + Math.floor(width / 2), row + Math.floor(height / 2), options);
  }

  /** Runs one complete press-move-release drag gesture with capture routing. */
  async drag(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    options: TerminalAppPilotDragOptions = {},
  ): Promise<TerminalAppPilotDragResult> {
    this.#assertActive();
    const { steps = 1, ...pointer } = options;
    const press = await this.#dispatchMousePress(createTestMousePress({ ...pointer, x: fromX, y: fromY }));
    const moves: MouseInteractionDispatchResult[] = [];
    const count = Math.max(1, Math.floor(steps));
    for (let step = 1; step <= count; step += 1) {
      const x = Math.round(fromX + ((toX - fromX) * step) / count);
      const y = Math.round(fromY + ((toY - fromY) * step) / count);
      moves.push(await this.#dispatchMousePress(createTestMousePress({ ...pointer, x, y, drag: true })));
    }
    const release = await this.#dispatchMousePress(
      createTestMousePress({ ...pointer, x: toX, y: toY, release: true, button: undefined }),
    );
    return { press, moves, release };
  }

  /** The mouse target currently holding drag capture, if any. */
  capturedTarget(): string | undefined {
    this.#assertActive();
    return this.app.mouse.captured();
  }

  /** Emits two full clicks at one position, as a double-click gesture. */
  async doubleClick(
    x: number,
    y: number,
    options: TerminalAppPilotPointerOptions = {},
  ): Promise<TerminalAppPilotClickResult[]> {
    return [await this.click(x, y, options), await this.click(x, y, options)];
  }

  /** Emits three full clicks at one position, as a triple-click gesture. */
  async tripleClick(
    x: number,
    y: number,
    options: TerminalAppPilotPointerOptions = {},
  ): Promise<TerminalAppPilotClickResult[]> {
    return [...await this.doubleClick(x, y, options), await this.click(x, y, options)];
  }

  /** Settles and renders a fixed number of frames. */
  async waitFrames(count: number): Promise<void> {
    this.#assertActive();
    for (let frame = 0; frame < Math.max(0, Math.floor(count)); frame += 1) {
      await this.settle();
    }
  }

  /** Waits until terminal text appears — tooltip and notification assertions. */
  async waitForText(text: string, options: TerminalAppPilotWaitOptions = {}): Promise<void> {
    await this.waitFor(() => this.snapshot().includes(text), {
      message: `Terminal text "${text}" did not appear.`,
      ...options,
    });
  }

  /** Waits until terminal text disappears — dismissal assertions. */
  async waitForTextGone(text: string, options: TerminalAppPilotWaitOptions = {}): Promise<void> {
    await this.waitFor(() => !this.snapshot().includes(text), {
      message: `Terminal text "${text}" did not disappear.`,
      ...options,
    });
  }

  /** Emits one bracketed-paste payload and waits for resulting updates. */
  async paste(text: string): Promise<void> {
    this.#assertActive();
    const event = { key: "paste" as const, text, buffer: new TextEncoder().encode(text) };
    this.app.tui.emit("inputEvent", event);
    this.app.tui.emit("paste", event);
    await this.settle();
  }

  /** Emits a terminal focus transition and waits for resulting updates. */
  async focus(focused: boolean): Promise<void> {
    this.#assertActive();
    const event = { key: "focus" as const, focused, buffer: new Uint8Array() };
    this.app.tui.emit("inputEvent", event);
    this.app.tui.emit("terminalFocus", event);
    await this.settle();
  }

  /** Resizes the in-memory terminal and renders responsive components. */
  async resize(columns: number, rows: number): Promise<void> {
    this.#assertActive();
    this.canvas.size.value = {
      columns: Math.max(1, Math.floor(columns)),
      rows: Math.max(1, Math.floor(rows)),
    };
    await this.settle();
  }

  /** Executes one registered command and waits for resulting updates. */
  async executeCommand(id: string): Promise<boolean> {
    this.#assertActive();
    const executed = await this.app.executeCommand(id);
    await this.settle();
    return executed;
  }

  /** Dispatches one action directly and waits for resulting updates. */
  async dispatch(action: TAction): Promise<void> {
    this.#assertActive();
    await this.app.actions.dispatch(action);
    await this.settle();
  }

  /** Waits for app actions and queued microtasks, then renders the canvas. */
  async settle(options: TerminalAppPilotSettleOptions = {}): Promise<void> {
    this.#assertActive();
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.#settleTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    let idlePasses = 0;

    while (idlePasses < 2) {
      await Promise.resolve();
      idlePasses = this.app.actions.inspect().dispatching ? 0 : idlePasses + 1;
      if (idlePasses >= 2) break;
      if (performance.now() >= deadline) {
        throw new Error(`Terminal app did not settle within ${timeoutMs}ms.`);
      }
      await delay(0);
    }

    this.canvas.render();
    await Promise.resolve();
    this.canvas.render();
  }

  /** Polls until a predicate succeeds, settling and rendering between attempts. */
  async waitFor(predicate: () => boolean | Promise<boolean>, options: TerminalAppPilotWaitOptions = {}): Promise<void> {
    this.#assertActive();
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.#settleTimeoutMs);
    const intervalMs = normalizeTimeout(options.intervalMs, 1);
    const deadline = performance.now() + timeoutMs;

    while (true) {
      await this.settle({ timeoutMs: Math.max(1, deadline - performance.now()) });
      if (await predicate()) return;
      if (performance.now() >= deadline) {
        throw new Error(options.message ?? `Terminal app predicate did not pass within ${timeoutMs}ms.`);
      }
      await delay(intervalMs);
    }
  }

  /** Renders pending canvas changes and returns normalized terminal text. */
  snapshot(): string {
    this.#assertActive();
    this.canvas.render();
    return canvasSnapshot(this.canvas);
  }

  /** Captures styled spans, cursor, hit regions, layout tree, and render stats. */
  capture(): TerminalSceneCapture {
    this.#assertActive();
    const text = this.snapshot();
    return captureTerminalScene({
      canvas: this.canvas,
      text,
      hitRegions: this.app.mouse.inspect(),
      layoutRoot: this.app.tui,
      focused: this.app.focus.current(),
    });
  }

  /** Destroys the app and releases terminal and component resources once. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.app.destroy();
  }

  async #dispatchMousePress(event: ReturnType<typeof createTestMousePress>): Promise<MouseInteractionDispatchResult> {
    this.app.tui.emit("inputEvent", event);
    this.app.tui.emit("mouseEvent", event);
    const result = await this.app.mouse.dispatch(event);
    this.app.tui.emit("mousePress", event);
    await this.settle();
    return result;
  }

  #assertActive(): void {
    if (this.#destroyed) throw new Error("Terminal app pilot has been destroyed.");
  }
}

/** Creates a real headless TerminalApp and waits for its initial component render. */
export async function createTestTerminalApp<TAction extends Action = Action, TRoute extends Route = Route>(
  options: TestTerminalAppOptions<TAction, TRoute> = {},
): Promise<TestTerminalAppHarness<TAction, TRoute>> {
  const {
    bindings,
    settleTimeoutMs,
    size = { columns: 80, rows: 24 },
    tuiOptions,
    ...appOptions
  } = options;
  const stdout = createTestStdout();
  const canvas = createTestCanvas({ stdout, size });
  const stdin = tuiOptions?.stdin ?? createTestStdin();
  const app = createTerminalApp<TAction, TRoute>({
    ...appOptions,
    bindings: { ...bindings, mouse: false },
    tuiOptions: {
      ...tuiOptions,
      canvas,
      stdin,
      stdout: stdout as unknown as Stdout,
      manageTerminalSize: false,
    },
    input: false,
    exitOnSignal: false,
  });
  const pilot = new TerminalAppPilot({ app, canvas, stdout, settleTimeoutMs });
  await pilot.settle();
  return { app, canvas, stdout, pilot, destroy: () => pilot.destroy() };
}

function createTestStdin(): Stdin {
  return {
    read: () => Promise.resolve(null),
    setRaw: () => undefined,
  } as unknown as Stdin;
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  return Math.max(0, Number.isFinite(value) ? value! : fallback);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
