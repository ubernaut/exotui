// Copyright 2023 Im-Beast. MIT license.

// Putting a rendered visualisation on screen.
//
// A frame is cells, and a cell carries its own colour, which one `Text` cannot
// express — a component has one style. Splitting each row into runs of
// identically styled cells and drawing one `Text` per run is what bridges the
// two, and charts have few runs per row in practice: a gradient bar is a
// handful, not one per column.
//
// The pool is fixed after the first frame. Creating and destroying components
// as the data moves is how a monitor ends up flickering, so unused entries are
// emptied rather than removed.

import { Computed, Signal } from "../signals/mod.ts";
import { Text } from "../components/text.ts";
import type { TextRectangle } from "../canvas/text.ts";
import type { Component } from "../component.ts";
import type { Style } from "../theme.ts";
import type { Rectangle } from "../types.ts";
import type { VizCell, VizFrame } from "./render.ts";
import type { Rgb } from "../theme_expressions.ts";

/** One stretch of cells sharing a style. */
export interface VizRun {
  readonly row: number;
  readonly column: number;
  readonly text: string;
  readonly foreground?: Rgb;
  readonly background?: Rgb;
}

/**
 * Splits a frame into runs.
 *
 * Exported because it is the interesting part and worth testing without a
 * terminal: a frame of one colour must produce one run per row, not one per
 * column, or a full-width chart costs hundreds of components.
 */
export function framesToRuns(frame: VizFrame): VizRun[] {
  const runs: VizRun[] = [];
  for (let row = 0; row < frame.length; row += 1) {
    const cells = frame[row]!;
    let start = 0;
    while (start < cells.length) {
      const first = cells[start]!;
      let end = start + 1;
      while (end < cells.length && sameStyle(cells[end]!, first)) end += 1;
      const text = cells.slice(start, end).map((cell) => cell.char).join("");
      if (text.trim().length > 0 || first.background !== undefined) {
        runs.push({
          row,
          column: start,
          text,
          ...(first.foreground ? { foreground: first.foreground } : {}),
          ...(first.background ? { background: first.background } : {}),
        });
      }
      start = end;
    }
  }
  return runs;
}

function sameStyle(a: VizCell, b: VizCell): boolean {
  return sameColor(a.foreground, b.foreground) && sameColor(a.background, b.background);
}

function sameColor(a: Rgb | undefined, b: Rgb | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export interface VisualizationViewOptions {
  readonly parent: Component["tui"] | Component;
  readonly rectangle: Signal<Rectangle> | Computed<Rectangle>;
  readonly zIndex?: number;
  /** Builds the style for one run of identically coloured cells. */
  readonly styleFor: (run: VizRun) => Style;
  /**
   * Runs allocated before the first frame. A frame needing more grows the pool
   * up to `maxRuns`; this only sets how much is ready immediately.
   */
  readonly initialRuns?: number;
  /** The ceiling the pool may grow to. A frame with more runs is clipped. */
  readonly maxRuns?: number;
}

/**
 * Draws frames handed to it, one `Text` per run of identically styled cells.
 *
 * The pool is allocated in the constructor and never grows during a frame.
 * Dependency tracking in this library is asynchronous — a Computed wires itself
 * to its dependencies a turn of the event loop after it is created — so a
 * component created and immediately re-positioned misses that change. Creating
 * everything up front means the wiring is long done by the time frames arrive.
 *
 * Runs rather than rows because a heatmap or a waterfall is a two-dimensional
 * field: colouring a whole row by its dominant value turns it into a grey wall,
 * which is exactly what it looked like before this.
 */
/** Far enough below any frame that a parked slot cannot overlap one. */
const PARKED_ROW = 1 << 20;

export class VisualizationView {
  readonly #slots: {
    text: Signal<string>;
    column: Signal<number>;
    row: Signal<number>;
    style: Signal<Style>;
  }[] = [];
  readonly #options: VisualizationViewOptions;

  readonly #maximum: number;

  constructor(options: VisualizationViewOptions) {
    this.#options = options;
    this.#maximum = Math.max(1, options.maxRuns ?? 4096);
    const slots = Math.max(1, Math.min(this.#maximum, options.initialRuns ?? 512));
    for (let index = 0; index < slots; index += 1) this.#addSlot();
  }

  /** Replaces what is on screen with this frame. */
  present(frame: VizFrame): void {
    this.presentRuns(framesToRuns(frame));
  }

  /**
   * Replaces what is on screen with these runs.
   *
   * For a caller drawing several small charts into one view: composing them
   * into a frame the size of the whole view first means allocating and walking
   * every cell of it to draw a few hundred, which at sixty frames a second is
   * most of a core spent on blank space. Runs from each chart, offset into
   * place, cost only what was actually drawn.
   */
  presentRuns(runs: readonly VizRun[]): void {
    // Grow toward what this frame wanted, but draw with the slots that already
    // existed. A Computed wires itself to its dependencies a turn of the event
    // loop after it is created, so a slot positioned in the frame it was made
    // in would not move; the next frame has it. One clipped frame after a
    // resize is invisible, a permanently misplaced run is not.
    const usable = this.#slots.length;
    if (runs.length > usable && usable < this.#maximum) {
      const target = Math.min(this.#maximum, runs.length);
      while (this.#slots.length < target) this.#addSlot();
    }
    for (let index = 0; index < usable; index += 1) {
      const slot = this.#slots[index]!;
      const run = runs[index];
      if (!run) {
        // Parked outside the frame. An idle slot left at its default position
        // paints a space over whatever is drawn there — which cost the first
        // cell of every chart until it was noticed.
        if (slot.text.peek() !== " ") slot.text.value = " ";
        if (slot.row.peek() !== PARKED_ROW) slot.row.value = PARKED_ROW;
        continue;
      }
      slot.column.value = run.column;
      slot.row.value = run.row;
      slot.style.value = this.#options.styleFor(run);
      slot.text.value = run.text;
    }
  }

  #addSlot(): void {
    // A space, never the empty string: a zero-width rectangle at creation is
    // one the canvas has nothing to place.
    const text = new Signal(" ");
    const column = new Signal(0);
    const row = new Signal(PARKED_ROW);
    const style = new Signal<Style>(((value: string) => value) as unknown as Style);
    const base = this.#options.rectangle;
    const component = new Text({
      parent: this.#options.parent as never,
      zIndex: this.#options.zIndex ?? 1,
      theme: { base: style.peek() },
      text,
      overwriteWidth: true,
      rectangle: new Computed<TextRectangle>(() => ({
        column: base.value.column + column.value,
        row: base.value.row + row.value,
        width: Math.max(1, text.value.length),
      })),
    });
    component.style = new Computed(() => style.value);
    this.#slots.push({ text, column, row, style });
  }
}
