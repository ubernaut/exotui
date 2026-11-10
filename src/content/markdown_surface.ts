// Copyright 2023 Im-Beast. MIT license.
import { Canvas } from "../canvas/canvas.ts";
import { MemoryCanvasSink } from "../canvas/sink.ts";
import {
  Markdown,
  type MarkdownController,
  type MarkdownOptions,
  type MarkdownStyles,
} from "../components/markdown.ts";
import { Text } from "../components/text.ts";
import type { KeyPressEvent } from "../input_reader/types.ts";
import { Computed, Signal } from "../signals/mod.ts";
import { type AnsiRgbColor, createAnsiStyle } from "../theme.ts";
import { Tui } from "../tui.ts";
import type { Stdin, Stdout } from "../types.ts";

/** Colors supplied by a terminal, browser desktop, or another component host. */
export interface MarkdownSurfacePalette {
  text: AnsiRgbColor;
  accent: AnsiRgbColor;
  muted: AnsiRgbColor;
  surface: AnsiRgbColor;
  /** Optional second trace color, normally the host theme's warning color. */
  secondary?: AnsiRgbColor;
}

/** Options for mounting the real Markdown component into an offscreen cell canvas. */
export interface MarkdownSurfaceOptions {
  source?: string;
  /** Borrow a host-owned controller, including optional async Mermaid controllers; dispose it separately. */
  controller?: MarkdownController;
  render?: MarkdownOptions["render"];
  onLink?: (href: string) => void;
  onActivate?: MarkdownOptions["onActivate"];
  onHover?: MarkdownOptions["onHover"];
  tooltips?: MarkdownOptions["tooltips"];
  palette?: MarkdownSurfacePalette;
  /** Start at the measured panel viewport; avoids resizing borrowed async controllers through one column. */
  initialSize?: { columns: number; rows: number };
}

/**
 * Renderer-neutral document surface for cell-composed windows. This mounts the
 * existing Markdown component; its controller owns reflow, scrolling and links.
 * No terminal input loop, DOM overlay, or host I/O is started.
 */
export class MarkdownSurface {
  /** Resolves once the component's initial reactive subscriptions are attached. */
  readonly ready: Promise<void>;
  readonly component: Markdown;
  readonly palette: Signal<MarkdownSurfacePalette>;
  readonly #canvas: Canvas;
  readonly #sink: MemoryCanvasSink;
  readonly #tui: Tui;
  readonly #decoder = new TextDecoder();
  #width = 1;
  #height = 1;
  readonly #mountedRows = new Set<object>();
  readonly #unsettledRows = new Set<object>();
  #disposed = false;

  constructor(options: MarkdownSurfaceOptions) {
    const size = options.initialSize ?? { columns: 1, rows: 1 };
    validateSize(size.columns, size.rows);
    this.#width = size.columns;
    this.#height = size.rows;
    this.palette = new Signal(
      options.palette ?? {
        text: [226, 232, 244],
        accent: [122, 219, 210],
        muted: [131, 148, 171],
        surface: [10, 12, 20],
      },
    );
    this.#sink = new MemoryCanvasSink();
    this.#canvas = new Canvas({ sink: this.#sink, size });
    // Tui's typed host handles are never used: there is no dispatch/run call.
    const stdin = { read: () => Promise.resolve(null), setRaw() {} } as unknown as Stdin;
    const stdout = {
      writeSync: (bytes: Uint8Array) => bytes.length,
      write: (bytes: Uint8Array) => Promise.resolve(bytes.length),
    } as unknown as Stdout;
    this.#tui = new Tui({ canvas: this.#canvas, stdin, stdout, manageTerminalSize: false });
    const styles: MarkdownStyles = {};
    for (
      const role of [
        "text",
        "heading",
        "marker",
        "quote",
        "code",
        "code-fence",
        "link-destination",
        "rule",
        "table-border",
        "table-header",
        "diagram-node",
        "diagram-trace",
        "diagram-integration",
        "diagram-label",
        "diagram-grid",
      ] as const
    ) {
      styles[role] = (value) => {
        const palette = this.palette.value;
        const color = role === "diagram-integration"
          ? palette.secondary ?? palette.accent
          : role === "diagram-label"
          ? palette.text
          : role === "diagram-grid"
          ? palette.muted.map((channel, i) =>
            Math.round(channel * .25 + palette.surface[i]! * .75)
          ) as unknown as AnsiRgbColor
          : role === "diagram-node" || role === "diagram-trace" || role === "heading" || role === "code-fence" ||
              role === "table-header"
          ? palette.accent
          : role === "marker" || role === "quote" || role === "rule" || role === "table-border"
          ? palette.muted
          : palette.text;
        return createAnsiStyle({ foreground: color, background: palette.surface })(value);
      };
    }
    styles.link = (value) => createAnsiStyle({ foreground: this.palette.value.accent, underline: true })(value);
    try {
      this.component = new Markdown({
        parent: this.#tui,
        rectangle: { column: 0, row: 0, width: size.columns, height: size.rows },
        zIndex: 1,
        theme: { base: (text) => text, focused: (text) => text },
        source: options.source,
        controller: options.controller,
        render: options.render,
        onLink: options.onLink,
        onActivate: options.onActivate,
        onHover: options.onHover,
        tooltips: options.tooltips,
        tooltipStyle: (value) =>
          createAnsiStyle({
            foreground: this.palette.value.text,
            background: this.palette.value.surface,
            inverse: true,
          })(
            value,
          ),
        styles,
      });
    } catch (error) {
      this.#tui.renderLoop.stop();
      this.#tui.off();
      this.palette.dispose();
      this.#sink.clear();
      throw error;
    }
    this.component.draw();
    this.component.interact("keyboard");
    this.ready = new Promise((resolve) => queueMicrotask(() => queueMicrotask(resolve)));
  }

  /** ANSI-styled rows from the normal Canvas/TextObjects; await ready before the first frame. */
  render(width: number, height: number): string[] {
    return this.renderCells(width, height).map((row) => row.join(""));
  }

  /** Styled Canvas cells for composition into a flex layout without slicing ANSI strings. */
  renderCells(width: number, height: number): string[][] {
    if (this.#disposed) throw new Error("Markdown surface disposed.");
    validateSize(width, height);
    if (width !== this.#width || height !== this.#height) {
      this.#width = width;
      this.#height = height;
      this.#canvas.size.value = { columns: width, rows: height };
      this.component.rectangle.value = { column: 0, row: 0, width, height };
    }
    this.component.controller.scrollTo(this.component.controller.offset.peek(), width, height);
    // Component attachment normally settles in microtasks. A cell-window host
    // requests synchronous frames, so mount freshly generated Text rows now.
    this.component.draw();
    const currentRows = new Set(this.component.children);
    for (const row of this.#mountedRows) {
      if (!currentRows.has(row as typeof this.component.children[number])) {
        this.#mountedRows.delete(row);
        this.#unsettledRows.delete(row);
      }
    }
    for (const row of this.component.children) {
      const initialMount = !this.#mountedRows.has(row);
      if (initialMount || this.#unsettledRows.has(row)) {
        // The initial 1-column row may predate the first host viewport and
        // still have no subscriptions. Refresh its computations before its
        // first mount too, not only during subsequent unsettled snapshots.
        if (row instanceof Text) {
          for (const signal of [row.text, row.rectangle, row.visible]) {
            if (signal instanceof Computed) signal.update(this.component.rectangle);
          }
        }
        if (row.visible.peek()) row.draw();
      }
      if (initialMount) {
        this.#mountedRows.add(row);
        this.#unsettledRows.add(row);
        queueMicrotask(() => queueMicrotask(() => this.#unsettledRows.delete(row)));
      }
    }
    this.#canvas.render();
    this.#sink.clear();
    return Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, column) => {
        const cell = this.#canvas.frameBuffer[row]?.[column];
        return cell instanceof Uint8Array ? this.#decoder.decode(cell) : cell ?? " ";
      }));
  }

  /** Route keyboard input to the component's existing viewport controller. */
  key(event: KeyPressEvent): boolean {
    return !this.#disposed && this.component.handleKeyPress(event);
  }

  /** Route viewport-local pointer coordinates through the component's link handler. */
  press(column: number, row: number): void {
    if (this.#disposed) return;
    this.component.emit("mousePress", {
      key: "mouse",
      buffer: new Uint8Array(),
      x: column,
      y: row,
      movementX: 0,
      movementY: 0,
      meta: false,
      ctrl: false,
      shift: false,
      button: 0,
      drag: false,
      release: false,
    });
  }

  /** Route pointer motion/leave through the native component; outside coordinates clear host tooltips. */
  hover(column: number, row: number): void {
    if (this.#disposed) return;
    this.component.emit("mouseEvent", {
      key: "mouse",
      buffer: new Uint8Array(),
      x: column,
      y: row,
      movementX: 0,
      movementY: 0,
      meta: false,
      ctrl: false,
      shift: false,
    });
  }

  /** Route wheel/touch scroll through the component's normal event path. */
  scroll(direction: 1 | -1): void {
    if (this.#disposed) return;
    this.component.emit("mouseScroll", {
      key: "mouse",
      buffer: new Uint8Array(),
      x: 0,
      y: 0,
      movementX: 0,
      movementY: 0,
      meta: false,
      ctrl: false,
      shift: false,
      drag: false,
      scroll: direction,
    });
  }

  /** Release component subscriptions and retained canvas state. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.component.destroy();
    this.#tui.renderLoop.stop();
    this.#tui.off();
    this.palette.dispose();
    this.#sink.clear();
    this.#mountedRows.clear();
    this.#unsettledRows.clear();
  }
}

function validateSize(width: number, height: number): void {
  if (
    !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2000 || height > 1000
  ) {
    throw new RangeError("Document surfaces require 1–2000 columns and 1–1000 rows.");
  }
}
