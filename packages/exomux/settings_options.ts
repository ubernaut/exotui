// Copyright 2023 Im-Beast. MIT license.

// Real exotui option controls for the settings window, composited in.
//
// Each settings option is rendered by a genuine exotui component: a `Cycler`
// (the compact `< value >` picker) for the discrete-value settings and a
// `CheckBox` for the boolean. They are laid out one per row on an off-screen
// `ExomuxWidgetSurface` and their styled cells are composited into the option
// rows, exactly like the action buttons.
//
// These controls display the live setting value; the settings window's existing
// routing (click a row, arrow, or wheel to cycle the option) drives the change,
// and the snapshot re-renders whenever a value or the geometry moves. Component
// draws defer to microtasks while the desktop paints synchronously, so a render
// captures a snapshot the painter blits; until a matching snapshot exists the
// caller falls back to its own hand-drawn value, so an option is never blank.

import { CheckBox, createAnsiStyle, Cycler, Signal } from "@ubernaut/deno-tui";
import { type ExomuxWidgetCell, ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** One option control to render, keyed by its settings id. */
export type ExomuxOptionControlSpec =
  & {
    readonly key: string;
    readonly width: number;
    readonly foreground: ExomuxRgb;
    readonly background: ExomuxRgb;
  }
  & (
    | { readonly kind: "cycler"; readonly options: readonly string[]; readonly activeIndex: number }
    | { readonly kind: "checkbox"; readonly checked: boolean }
  );

/** Captured styled cells for one composited option control. */
export interface ExomuxOptionCells {
  readonly width: number;
  readonly cells: readonly ExomuxWidgetCell[];
}

function specSignature(spec: ExomuxOptionControlSpec): string {
  const head = `${spec.key}:${spec.kind}:${spec.width}:${spec.foreground.join(",")}:${spec.background.join(",")}`;
  return spec.kind === "cycler"
    ? `${head}:c:${spec.activeIndex}:${spec.options.join("")}`
    : `${head}:b:${spec.checked ? 1 : 0}`;
}

function rowWidthOf(spec: ExomuxOptionControlSpec): number {
  return Math.max(1, Math.floor(spec.width));
}

/** Hosts the settings window's option controls as real, composited widgets. */
export class ExomuxSettingsOptions {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #requestRepaint: () => void;
  #signature = "";
  #cells = new Map<string, ExomuxOptionCells>();
  #rendering = false;
  #disposed = false;

  constructor(requestRepaint: () => void) {
    this.#requestRepaint = requestRepaint;
  }

  /**
   * Returns the composited cells for each spec in order, or `undefined` for a
   * spec whose snapshot is not ready yet (the caller draws its own fallback). A
   * changed spec set schedules a fresh render.
   */
  cellsFor(specs: readonly ExomuxOptionControlSpec[]): (ExomuxOptionCells | undefined)[] {
    const signature = specs.map(specSignature).join("|");
    if (signature !== this.#signature) this.#schedule(signature, specs);
    return specs.map((spec) => (signature === this.#signature ? this.#cells.get(spec.key) : undefined));
  }

  dispose(): void {
    this.#disposed = true;
    this.#surface.dispose();
  }

  #schedule(signature: string, specs: readonly ExomuxOptionControlSpec[]): void {
    if (this.#rendering || this.#disposed) return;
    this.#rendering = true;
    void this.#render(signature, specs);
  }

  async #render(signature: string, specs: readonly ExomuxOptionControlSpec[]): Promise<void> {
    try {
      const width = specs.reduce((wide, spec) => Math.max(wide, rowWidthOf(spec)), 1);
      this.#surface.resize(width, Math.max(1, specs.length));
      this.#surface.mount((tui) =>
        specs.map((spec, index) => {
          const base = createAnsiStyle({ foreground: spec.foreground, background: spec.background });
          const rectangle = { column: 0, row: index, width: rowWidthOf(spec), height: 1 };
          if (spec.kind === "checkbox") {
            return new CheckBox({
              parent: tui,
              zIndex: 1,
              rectangle,
              theme: { base },
              checked: new Signal(spec.checked),
            });
          }
          return new Cycler({
            parent: tui,
            zIndex: 1,
            rectangle,
            theme: { base },
            options: [...spec.options],
            activeIndex: new Signal(spec.activeIndex),
          });
        })
      );
      await this.#surface.render();
      if (this.#disposed) return;
      const captured = new Map<string, ExomuxOptionCells>();
      specs.forEach((spec, index) => {
        const rowWidth = rowWidthOf(spec);
        const cells: ExomuxWidgetCell[] = [];
        for (let column = 0; column < rowWidth; column += 1) cells.push(this.#surface.cellAt(index, column));
        captured.set(spec.key, { width: rowWidth, cells });
      });
      this.#cells = captured;
      this.#signature = signature;
    } finally {
      this.#rendering = false;
    }
    if (!this.#disposed) this.#requestRepaint();
  }
}
