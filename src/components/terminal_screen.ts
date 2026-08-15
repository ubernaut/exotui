// Copyright 2023 Im-Beast. MIT license.
import { Component, type ComponentOptions } from "../component.ts";
import { DrawObject, type DrawObjectOptions } from "../canvas/draw_object.ts";
import type { Rectangle } from "../types.ts";
import type { Signal, SignalOfObject } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";
import { createAnsiStyle } from "../theme.ts";
import type { Style, Theme } from "../theme.ts";
import { textWidth } from "../utils/strings.ts";
import type { TerminalScreenController } from "../runtime/terminal_screen.ts";
import type { TerminalScrollbackController } from "../runtime/terminal_scrollback.ts";
import {
  resolveTerminalCellStyle,
  type TerminalCellStyleOptions,
  type TerminalRgb,
} from "../runtime/terminal_palette.ts";

/** Colors a TerminalScreen renders with; all triples are renderable RGB. */
export interface TerminalScreenColors {
  /** Ground for cells whose program left the background unset. */
  defaultBackground: TerminalRgb;
  /** Text for cells whose program left the foreground unset. */
  defaultForeground: TerminalRgb;
  /** The inverted cursor block. */
  cursorForeground: TerminalRgb;
  cursorBackground: TerminalRgb;
  /** The bottom warning line, when a warning is set. */
  warningForeground?: TerminalRgb;
  warningBackground?: TerminalRgb;
}

/** Options for configuring TerminalScreen. */
export interface TerminalScreenComponentOptions extends Omit<ComponentOptions, "theme"> {
  /**
   * Optional component theme. The grid renders through `colors`, not styles;
   * the theme only affects focus-state chrome a host might layer on.
   */
  theme?: Partial<Theme>;
  /** The live screen model to render. */
  screen: TerminalScreenController;
  /** Optional scrollback: copy-mode viewports render the scrolled window, cursorless. */
  scrollback?: TerminalScrollbackController;
  /**
   * Repaint trigger. The screen model mutates outside the signal graph, so the
   * host bumps this after feeding it output (a per-session render revision).
   */
  revision: Signal<number>;
  colors: TerminalScreenColors | Signal<TerminalScreenColors>;
  /** Raise default-ground ANSI text to readable contrast (the themed look). */
  contrastLift?: boolean | Signal<boolean>;
  /** When set, the pane fades toward it (dim-inactive). */
  dimToward?: Signal<TerminalRgb | undefined>;
  /** Gates the cursor block (focus/attachment); the model's visibility still applies. */
  showCursor?: boolean | Signal<boolean>;
  /** One-line warning rendered over the bottom row while set. */
  warning?: Signal<string | undefined>;
  /**
   * See-through ground for default-background cells when `opacity` is below 1,
   * in the component's own coordinate space (absolute canvas cells).
   */
  ground?: (column: number, row: number) => TerminalRgb;
  opacity?: number | Signal<number>;
}

/**
 * A real PTY screen renderer: paints a `TerminalScreenController` cell grid
 * with xterm-256 color resolution, WCAG contrast lift for themed ANSI text,
 * dim-inactive fading, translucent default grounds, an inverted cursor block,
 * and a bottom warning line. The line-oriented `TerminalOutput` controller
 * renders logs; this renders a terminal.
 */
export class TerminalScreen extends Component {
  declare drawnObjects: { screen: TerminalScreenObject };
  readonly #screen: TerminalScreenController;
  readonly #scrollback?: TerminalScrollbackController;
  readonly #revision: Signal<number>;
  readonly #colors: Signal<TerminalScreenColors>;
  readonly #contrastLift: Signal<boolean>;
  readonly #dimToward?: Signal<TerminalRgb | undefined>;
  readonly #showCursor: Signal<boolean>;
  readonly #warning?: Signal<string | undefined>;
  readonly #ground?: (column: number, row: number) => TerminalRgb;
  readonly #opacity: Signal<number>;
  readonly #styleCache = new Map<string, Style>();

  constructor(options: TerminalScreenComponentOptions) {
    super({ ...options, theme: options.theme ?? {} });
    this.#screen = options.screen;
    this.#scrollback = options.scrollback;
    this.#revision = options.revision;
    this.#colors = signalify(options.colors, { deepObserve: true });
    this.#contrastLift = signalify(options.contrastLift ?? true);
    this.#dimToward = options.dimToward;
    this.#showCursor = signalify(options.showCursor ?? true);
    this.#warning = options.warning;
    this.#ground = options.ground;
    this.#opacity = signalify(options.opacity ?? 1);
  }

  override draw(): void {
    super.draw();
    const screen = new TerminalScreenObject({
      canvas: this.tui.canvas,
      view: this.view,
      style: this.style,
      zIndex: this.zIndex,
      rectangle: this.rectangle,
      watched: [
        this.#revision,
        this.#colors,
        this.#contrastLift,
        this.#showCursor,
        this.#opacity,
        ...(this.#dimToward ? [this.#dimToward] : []),
        ...(this.#warning ? [this.#warning] : []),
      ],
      render: (rectangle) => this.#renderRows(rectangle),
    });
    this.drawnObjects.screen = screen;
    screen.draw();
  }

  #style(foreground: TerminalRgb, background: TerminalRgb, bold: boolean): Style {
    const key = `${foreground.join(",")}|${background.join(",")}|${bold ? 1 : 0}`;
    let style = this.#styleCache.get(key);
    if (!style) {
      style = createAnsiStyle({
        foreground: [...foreground] as [number, number, number],
        background: [...background] as [number, number, number],
        bold,
      });
      this.#styleCache.set(key, style);
    }
    return style;
  }

  /** Renders the viewport into styled cell strings ("" marks a wide follower). */
  #renderRows(rectangle: Rectangle): string[][] {
    const colors = this.#colors.peek();
    const viewport = this.#scrollback?.inspectViewport();
    const copyMode = viewport?.mode === "copy";
    const rows = copyMode
      ? this.#screen.cellRowsRange(viewport!.offset, viewport!.viewportRows)
      : this.#screen.cellRows();
    const inspection = this.#screen.inspect();
    const cursorActive = !copyMode && this.#showCursor.peek() && inspection.cursorVisible;
    const cellOptions: TerminalCellStyleOptions = {
      defaultBackground: colors.defaultBackground,
      defaultForeground: colors.defaultForeground,
      cursorForeground: colors.cursorForeground,
      cursorBackground: colors.cursorBackground,
      contrastLift: this.#contrastLift.peek(),
      dimToward: this.#dimToward?.peek(),
      ground: this.#ground,
      opacity: this.#opacity.peek(),
    };
    const rendered: string[][] = [];
    for (let row = 0; row < rectangle.height; row += 1) {
      const cells = rows[row] ?? [];
      const target = new Array<string>(rectangle.width).fill("");
      for (let column = 0; column < rectangle.width; column += 1) {
        const cell = cells[column] ?? { char: " " };
        if (cell.continuation) continue;
        const cursor = cursorActive && inspection.cursor.row === row && inspection.cursor.column === column;
        const resolved = resolveTerminalCellStyle(
          cell,
          rectangle.column + column,
          rectangle.row + row,
          cursor,
          cellOptions,
        );
        // A double-width glyph on the last column has nowhere to park its
        // follower, so it degrades to a blank inside the viewport.
        const glyph = textWidth(resolved.glyph) === 2 && column + 1 >= rectangle.width ? " " : resolved.glyph;
        target[column] = this.#style(resolved.foreground, resolved.background, resolved.bold)(glyph);
      }
      rendered.push(target);
    }
    const warning = this.#warning?.peek();
    if (warning && rectangle.height > 0) {
      const warningForeground = colors.warningForeground ?? colors.defaultForeground;
      const warningBackground = colors.warningBackground ?? colors.defaultBackground;
      const style = this.#style(warningForeground, warningBackground, true);
      const text = `! ${warning}`.slice(0, Math.max(0, rectangle.width));
      const bottom = rendered[rectangle.height - 1]!;
      for (let column = 0; column < rectangle.width; column += 1) {
        bottom[column] = style(text[column] ?? " ");
      }
    }
    return rendered;
  }
}

/** Anything subscribable whose change should repaint the grid. */
interface TerminalScreenWatchable {
  subscribe(listener: () => void, abortSignal?: AbortSignal): void;
}

interface TerminalScreenObjectOptions extends DrawObjectOptions {
  rectangle: SignalOfObject<Rectangle>;
  watched: readonly TerminalScreenWatchable[];
  render: (rectangle: Rectangle) => string[][];
}

/** Retained canvas primitive painting the screen as coalesced row ranges. */
class TerminalScreenObject extends DrawObject<"terminal-screen"> {
  declare rectangle: SignalOfObject<Rectangle>;
  readonly #watched: readonly TerminalScreenWatchable[];
  readonly #renderRows: (rectangle: Rectangle) => string[][];
  readonly #lifecycle = new AbortController();
  #previousRows: string[][] = [];
  #forceFullPaint = true;

  constructor(options: TerminalScreenObjectOptions) {
    super("terminal-screen", options);
    this.rectangle = options.rectangle;
    this.#watched = options.watched;
    this.#renderRows = options.render;
  }

  override draw(): void {
    this.rectangle.subscribe(() => this.#invalidate(true), this.#lifecycle.signal);
    for (const signal of this.#watched) {
      signal.subscribe(() => this.#invalidate(false), this.#lifecycle.signal);
    }
    super.draw();
  }

  override erase(): void {
    this.#lifecycle.abort();
    super.erase();
  }

  override render(): void {
    this.#forceFullPaint = true;
    this.rerender();
  }

  override rerender(): void {
    const rectangle = this.rectangle.peek();
    const rows = this.#renderRows(rectangle);
    const previousRows = this.#previousRows;
    const canvasSize = this.canvas.size.peek();
    const rowEnd = Math.min(canvasSize.rows, rectangle.row + rectangle.height);
    const columnEnd = Math.min(canvasSize.columns, rectangle.column + rectangle.width);
    for (let row = Math.max(0, rectangle.row); row < rowEnd; row += 1) {
      const source = rows[row - rectangle.row] ?? [];
      const previous = previousRows[row - rectangle.row] ?? [];
      const frameRow = this.canvas.frameBuffer[row] ??= [];
      const omitted = this.omitCells[row];
      const forced = this.rerenderCells[row];
      let rangeStart = -1;
      for (let column = Math.max(0, rectangle.column); column < columnEnd; column += 1) {
        const sourceColumn = column - rectangle.column;
        const value = source[sourceColumn] ?? " ";
        const changed = this.#forceFullPaint || forced?.has(column) || previous[sourceColumn] !== value;
        if (!changed || omitted?.has(column)) {
          if (rangeStart !== -1) {
            (this.canvas.rerenderRanges[row] ??= []).push({ row, startColumn: rangeStart, endColumn: column });
            rangeStart = -1;
          }
          continue;
        }
        frameRow[column] = value;
        if (rangeStart === -1) rangeStart = column;
      }
      if (rangeStart !== -1) {
        (this.canvas.rerenderRanges[row] ??= []).push({ row, startColumn: rangeStart, endColumn: columnEnd });
      }
      forced?.clear();
    }
    this.#previousRows = rows;
    this.#forceFullPaint = false;
  }

  #invalidate(moved: boolean): void {
    if (moved) {
      this.moved = true;
      this.#forceFullPaint = true;
    }
    if (!this.updated) return;
    this.updated = false;
    this.canvas.updateObjects.push(this);
  }
}
