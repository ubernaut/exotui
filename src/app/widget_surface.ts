// Copyright 2023 Im-Beast. MIT license.

// A headless surface for rendering a component subtree off-screen and reading
// back its cells.
//
// Some hosts paint their own retained grid by hand — a terminal multiplexer
// fusing live PTY screens, translucent windows, and GPU backgrounds into one
// draw object is the motivating case — and so cannot mount library components
// (which are separate canvas draw objects) into it directly. A `WidgetSurface`
// bridges the two: it mounts a component subtree on an in-memory `Canvas`,
// renders it manually (no terminal, no render loop, no stdout), and exposes the
// resulting cells through `cellAt` so the host can composite them into its grid
// exactly as it composites any other cell source.
//
// Rendering forces a full redraw each pass (`Canvas.rerenderAll`) so a snapshot
// is always exact — the incremental renderer can otherwise leave a stale cell
// when an overlapping higher-zIndex object (a `List`'s selection highlight, say)
// moves or hides between frames, which a host blitting the snapshot would show
// as a duplicated row.

import { Canvas } from "../canvas/canvas.ts";
import { MemoryCanvasSink } from "../canvas/sink.ts";
import type { Component } from "../component.ts";
import { Tui } from "../tui.ts";

/** One styled cell from the surface, or undefined for an untouched cell. */
export type WidgetSurfaceCell = string | Uint8Array | undefined;

/** A surface cell decoded into its glyph and truecolor attributes. */
export interface WidgetSurfaceCellData {
  glyph: string;
  foreground?: [number, number, number];
  background?: [number, number, number];
  bold: boolean;
}

const CELL_SGR_PATTERN = /\x1b\[([0-9;]*)m/g;
const cellDecoder = new TextDecoder();

/**
 * Decodes one surface cell into its glyph and truecolor attributes, so a host
 * can re-style what it composites — blend a translucent panel's cell background
 * against its own scene, say — without string-level SGR surgery at every site.
 *
 * Surface cells are produced by this library's own style pipeline, so only the
 * sequences it emits are interpreted: truecolor foreground/background
 * (38;2 / 48;2), bold (1/22), and resets (0/39/49). Anything else in a cell is
 * ignored rather than guessed at. Returns undefined for an untouched cell.
 */
export function widgetSurfaceCellData(cell: WidgetSurfaceCell): WidgetSurfaceCellData | undefined {
  if (cell === undefined) return undefined;
  const text = typeof cell === "string" ? cell : cellDecoder.decode(cell);
  // Attributes are captured as they cover glyph text, not at end of string —
  // the trailing reset every styled cell carries would otherwise wipe them.
  const active: WidgetSurfaceCellData = { glyph: "", bold: false };
  const data: WidgetSurfaceCellData = { glyph: "", bold: false };
  const consume = (slice: string): void => {
    if (slice === "") return;
    if (data.glyph === "") {
      data.foreground = active.foreground;
      data.background = active.background;
      data.bold = active.bold;
    }
    data.glyph += slice;
  };
  CELL_SGR_PATTERN.lastIndex = 0;
  let cursor = 0;
  for (let match = CELL_SGR_PATTERN.exec(text); match; match = CELL_SGR_PATTERN.exec(text)) {
    consume(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const params = match[1] === "" ? [0] : match[1]!.split(";").map(Number);
    for (let index = 0; index < params.length; index += 1) {
      const param = params[index]!;
      if (param === 0) {
        active.foreground = undefined;
        active.background = undefined;
        active.bold = false;
      } else if (param === 1) active.bold = true;
      else if (param === 22) active.bold = false;
      else if (param === 39) active.foreground = undefined;
      else if (param === 49) active.background = undefined;
      else if ((param === 38 || param === 48) && params[index + 1] === 2) {
        const channel: [number, number, number] = [
          params[index + 2] ?? 0,
          params[index + 3] ?? 0,
          params[index + 4] ?? 0,
        ];
        if (param === 38) active.foreground = channel;
        else active.background = channel;
        index += 4;
      }
    }
  }
  consume(text.slice(cursor));
  return data;
}

/** An off-screen Tui whose rendered cells can be composited into a host grid. */
export class WidgetSurface {
  readonly #sink: MemoryCanvasSink;
  readonly #canvas: Canvas;
  readonly #tui: Tui;
  #components: Component[] = [];
  #columns: number;
  #rows: number;

  constructor(columns: number, rows: number) {
    this.#columns = Math.max(1, Math.floor(columns));
    this.#rows = Math.max(1, Math.floor(rows));
    this.#sink = new MemoryCanvasSink();
    this.#canvas = new Canvas({ sink: this.#sink, size: { columns: this.#columns, rows: this.#rows } });
    // Passing a canvas makes the Tui headless: no terminal-size management, no
    // SIGWINCH, no render loop, and it never writes to a real stdout unless
    // run()/destroy() is called — which this surface never does.
    this.#tui = new Tui({ canvas: this.#canvas });
  }

  get columns(): number {
    return this.#columns;
  }
  get rows(): number {
    return this.#rows;
  }

  /**
   * (Re)mounts the component tree. `build` receives the host Tui and returns the
   * top-level components it created; previous components are destroyed first.
   */
  mount(build: (tui: Tui) => Component[]): void {
    this.#destroyComponents();
    this.#components = build(this.#tui);
  }

  /** Resizes the surface; the caller re-mounts to reflow to the new size. */
  resize(columns: number, rows: number): void {
    const nextColumns = Math.max(1, Math.floor(columns));
    const nextRows = Math.max(1, Math.floor(rows));
    if (nextColumns === this.#columns && nextRows === this.#rows) return;
    this.#columns = nextColumns;
    this.#rows = nextRows;
    this.#canvas.size.value = { columns: nextColumns, rows: nextRows };
  }

  /**
   * Flushes the microtask-deferred component draws and renders. Two passes catch
   * sub-objects (labels, slider thumbs) created during the first draw; each pass
   * forces a full redraw so the snapshot is exact.
   */
  async render(): Promise<void> {
    for (let pass = 0; pass < 2; pass += 1) {
      for (let flush = 0; flush < 4; flush += 1) await Promise.resolve();
      this.#canvas.rerenderAll();
      this.#canvas.render();
    }
  }

  /** One rendered cell in surface-local coordinates, or undefined if untouched. */
  cellAt(row: number, column: number): WidgetSurfaceCell {
    return this.#canvas.frameBuffer[row]?.[column];
  }

  /** Destroys the mounted components (removing their draw objects). */
  dispose(): void {
    this.#destroyComponents();
  }

  #destroyComponents(): void {
    for (const component of this.#components) {
      try {
        component.destroy();
      } catch {
        // A component teardown failure must not leak the others.
      }
    }
    this.#components = [];
  }
}
