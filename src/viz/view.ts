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
  /** Builds the style for a row from the run that dominates it. */
  readonly styleFor: (run: VizRun) => Style;
  /** Rows to allocate. Frames taller than this are clipped. */
  readonly maxRows?: number;
}

/** The run that decides a row's colour: the one covering the most cells. */
export function dominantRun(runs: readonly VizRun[]): VizRun | undefined {
  let best: VizRun | undefined;
  for (const run of runs) {
    const weight = run.text.trim().length;
    if (weight === 0) continue;
    if (!best || weight > best.text.trim().length) best = run;
  }
  return best ?? runs[0];
}

/**
 * Draws frames handed to it, one `Text` per row.
 *
 * Fixed geometry, deliberately. A draw object created at one size does not
 * re-register when its rectangle later changes, so anything that resizes a
 * component per frame silently stops painting — reproduced in
 * tests/canvas_zero_width_draw.test.ts. Rows are allocated once at full width
 * and only their text and style change.
 *
 * The cost is one style per row rather than per cell. Every renderer in this
 * package encodes magnitude in its glyphs as well as its colour, precisely so
 * that a row drawn in one colour still reads — the same property that makes
 * them legible on a monochrome terminal.
 */
export class VisualizationView {
  readonly #rows: { text: Signal<string>; style: Signal<Style> }[] = [];
  readonly #options: VisualizationViewOptions;

  constructor(options: VisualizationViewOptions) {
    this.#options = options;
    const rows = Math.max(1, options.maxRows ?? 64);
    for (let row = 0; row < rows; row += 1) this.#addRow(row);
  }

  /** Replaces what is on screen with this frame. */
  present(frame: VizFrame): void {
    for (let row = 0; row < this.#rows.length; row += 1) {
      const slot = this.#rows[row]!;
      const cells = frame[row];
      if (!cells) {
        slot.text.value = " ";
        continue;
      }
      const runs = framesToRuns([cells]);
      const dominant = dominantRun(runs);
      slot.style.value = dominant ? this.#options.styleFor(dominant) : slot.style.peek();
      const text = cells.map((cell) => cell.char).join("");
      slot.text.value = text.length > 0 ? text : " ";
    }
  }

  #addRow(row: number): void {
    const text = new Signal(" ");
    const style = new Signal<Style>(((value: string) => value) as unknown as Style);
    const base = this.#options.rectangle;
    const component = new Text({
      parent: this.#options.parent as never,
      zIndex: this.#options.zIndex ?? 1,
      theme: { base: style.peek() },
      text,
      overwriteWidth: true,
      // Full width from the first frame and never changed.
      rectangle: new Computed<TextRectangle>(() => {
        const rect = base.value;
        return { column: rect.column, row: rect.row + row, width: Math.max(1, rect.width) };
      }),
      visible: new Computed(() => row < base.value.height),
    });
    component.style = new Computed(() => style.value);
    this.#rows.push({ text, style });
  }
}
