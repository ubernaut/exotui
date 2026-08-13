// Copyright 2023 Im-Beast. MIT license.

// A headless surface for hosting real exotui components off-screen.
//
// The Exomux desktop is one retained draw object, so library components (which
// are separate canvas draw objects) cannot be mounted into it directly. Instead
// a component subtree is rendered here into an in-memory `MemoryCanvasSink` and
// its cell grid is composited into a window region exactly as a terminal's
// screen grid is — the same way any console application becomes window content.
// The Tui never runs its own loop or touches a real terminal; rendering is
// driven manually and reads back through `canvas.frameBuffer`.

import { Canvas, type Component, MemoryCanvasSink, Tui } from "@ubernaut/deno-tui";

/** One styled cell from the surface, or undefined for an untouched cell. */
export type ExomuxWidgetCell = string | Uint8Array | undefined;

/** An off-screen Tui whose rendered cells can be composited into a window. */
export class ExomuxWidgetSurface {
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
    // Passing a canvas makes the Tui headless: no terminal-size management,
    // no SIGWINCH, no render loop, and it never writes to a real stdout unless
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
   * sub-objects (labels, slider thumbs) created during the first draw.
   */
  async render(): Promise<void> {
    for (let pass = 0; pass < 2; pass += 1) {
      for (let flush = 0; flush < 4; flush += 1) await Promise.resolve();
      // Force a clean, full redraw: the incremental renderer can leave a stale
      // cell when an overlapping higher-zIndex object (a List's selection
      // highlight) moves or hides as rows scroll, and this surface's snapshot
      // must be exact — a skipped cell reads as a duplicated row on the desktop.
      this.#canvas.rerenderAll();
      this.#canvas.render();
    }
  }

  /** One rendered cell in surface-local coordinates, or undefined if untouched. */
  cellAt(row: number, column: number): ExomuxWidgetCell {
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
