// Copyright 2023 Im-Beast. MIT license.
import { Canvas } from "../canvas/canvas.ts";
import { EventEmitter } from "../event_emitter.ts";
import { RenderLoop } from "../runtime/render_loop.ts";
import type { ConsoleSize } from "../types.ts";
import type {
  KeyPressEvent,
  MousePressEvent,
  MouseScrollEvent,
  PasteEvent,
  TerminalFocusEvent,
} from "../input_reader/types.ts";
import type { PointerInputEvent } from "../pointer_input.ts";
import { BrowserCellCanvasSink, type BrowserCellCanvasSinkOptions } from "./cell_canvas_sink.ts";
import { BrowserPlatform, type BrowserPlatformOptions } from "./platform.ts";

/** Options for creating a browser-hosted TUI canvas. */
export interface WebTuiHostOptions {
  root: HTMLElement;
  columns?: number;
  rows?: number;
  refreshRate?: number;
  canvas?: HTMLCanvasElement;
  sink?: BrowserCellCanvasSink;
  sinkOptions?: Omit<BrowserCellCanvasSinkOptions, "canvas">;
  platformOptions?: Omit<BrowserPlatformOptions, "root" | "columns" | "rows">;
}

/** Snapshot of browser host runtime state. */
export interface WebTuiHostInspection {
  running: boolean;
  size: ConsoleSize;
  renderLoop: ReturnType<RenderLoop["inspect"]>;
  sink: ReturnType<BrowserCellCanvasSink["inspectSink"]>;
}

/** Event map emitted by a browser-hosted TUI instance. */
export type WebTuiHostEvents = {
  keyPress: { args: [KeyPressEvent] };
  mousePress: { args: [MousePressEvent] };
  mouseScroll: { args: [MouseScrollEvent] };
  paste: { args: [PasteEvent] };
  terminalFocus: { args: [TerminalFocusEvent] };
  pointerInput: { args: [PointerInputEvent] };
  render: { args: [] };
  destroy: { args: [] };
};

/** Browser TUI host that wires input, platform sizing, canvas rendering, and a render loop. */
export class WebTuiHost extends EventEmitter<WebTuiHostEvents> {
  readonly root: HTMLElement;
  readonly element: HTMLCanvasElement;
  readonly platform: BrowserPlatform;
  readonly sink: BrowserCellCanvasSink;
  readonly canvas: Canvas;
  readonly renderLoop: RenderLoop;
  #running = false;
  #unsubscribeCanvasRender?: () => void;
  #unsubscribeSize?: () => void;

  constructor(options: WebTuiHostOptions) {
    super();
    this.root = options.root;
    this.element = options.canvas ?? document.createElement("canvas");
    if (!options.canvas) {
      this.root.appendChild(this.element);
    }
    this.sink = options.sink ?? new BrowserCellCanvasSink({ canvas: this.element, ...options.sinkOptions });
    this.platform = new BrowserPlatform({
      root: options.root,
      columns: options.columns,
      rows: options.rows,
      cellWidth: options.sinkOptions?.cellWidth,
      cellHeight: options.sinkOptions?.cellHeight,
      ...options.platformOptions,
    });
    this.canvas = new Canvas({
      sink: this.sink,
      size: this.platform.size,
    });
    this.renderLoop = new RenderLoop({
      intervalMs: options.refreshRate ?? 1000 / 60,
      tick: () => this.canvas.render(),
    });
  }

  /**
   * Gives the keyboard focus, so keys reach the application.
   *
   * A pointer press does this already. A page whose whole content is the
   * application also wants it on load, and without this would have to find
   * and focus the platform's hidden input element itself.
   */
  focus(): void {
    this.platform.input.focus?.();
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.platform.lifecycle.start();
    this.platform.input.attach(this);
    this.#unsubscribeCanvasRender = this.canvas.on("render", () => this.emit("render"));
    const sizeSubscription = () => this.canvas.render();
    this.platform.size.subscribe(sizeSubscription);
    this.#unsubscribeSize = () => this.platform.size.unsubscribe(sizeSubscription);
    this.renderLoop.start();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.renderLoop.stop();
    this.platform.input.detach();
    this.platform.lifecycle.stop();
    this.#unsubscribeCanvasRender?.();
    this.#unsubscribeCanvasRender = undefined;
    this.#unsubscribeSize?.();
    this.#unsubscribeSize = undefined;
  }

  destroy(): void {
    this.stop();
    this.platform.dispose();
    this.emit("destroy");
    this.off();
  }

  inspectHost(): WebTuiHostInspection {
    return {
      running: this.#running,
      size: { ...this.platform.size.peek() },
      renderLoop: this.renderLoop.inspect(),
      sink: this.sink.inspectSink(),
    };
  }
}

/** Creates a browser-hosted TUI instance. */
export function createWebTui(options: WebTuiHostOptions): WebTuiHost {
  return new WebTuiHost(options);
}
