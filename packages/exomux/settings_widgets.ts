// Copyright 2023 Im-Beast. MIT license.

// Real exotui action buttons for the settings window, composited in.
//
// The settings window is part of the single retained desktop draw object, so
// its controls are hand-painted rather than mounted as library components. This
// host renders the window's action buttons as genuine exotui `Button` components
// on an off-screen `ExomuxWidgetSurface` and hands their styled cells back to the
// desktop painter, which composites them into the window exactly as it composites
// any terminal's screen grid.
//
// Component draws defer to microtasks, so rendering is asynchronous while the
// desktop paints synchronously. The styled cells are therefore captured into a
// snapshot: the painter blits the latest snapshot and, whenever the theme or a
// button's geometry changes, a fresh render is scheduled and a repaint requested.
// Until a matching snapshot exists the caller falls back to its own hand-drawn
// button, so a control is never missing while the widget catches up.

import { Button, createAnsiStyle } from "@ubernaut/deno-tui";
import { type ExomuxWidgetCell, ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** One action button to render: its label, target width and colours. */
export interface ExomuxSettingsButtonSpec {
  readonly key: string;
  readonly label: string;
  readonly width: number;
  readonly foreground: ExomuxRgb;
  readonly background: ExomuxRgb;
}

/** Captured styled cells for one composited button row. */
export interface ExomuxSettingsButtonCells {
  readonly width: number;
  /** Exactly `width` cells; `undefined` marks a cell the widget left untouched. */
  readonly cells: readonly ExomuxWidgetCell[];
}

/** A stable key for a set of button specs, so identical requests reuse cells. */
export function exomuxSettingsButtonSignature(specs: readonly ExomuxSettingsButtonSpec[]): string {
  return specs
    .map((spec) => `${spec.key}:${spec.label}:${spec.width}:${spec.foreground.join(",")}:${spec.background.join(",")}`)
    .join("|");
}

function rowWidthOf(spec: ExomuxSettingsButtonSpec): number {
  return Math.max(1, Math.floor(spec.width));
}

/** Hosts the settings window's action buttons as real, composited widgets. */
export class ExomuxSettingsWidgets {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #requestRepaint: () => void;
  #signature = "";
  #cells = new Map<string, ExomuxSettingsButtonCells>();
  #rendering = false;
  #disposed = false;

  constructor(requestRepaint: () => void) {
    this.#requestRepaint = requestRepaint;
  }

  /**
   * Returns the composited cells for the button `key`, or `undefined` when no
   * snapshot matches the requested `specs` yet — the caller should fall back to
   * its own drawing while a fresh render is scheduled.
   */
  cellsFor(specs: readonly ExomuxSettingsButtonSpec[], key: string): ExomuxSettingsButtonCells | undefined {
    const signature = exomuxSettingsButtonSignature(specs);
    if (signature !== this.#signature) {
      this.#schedule(signature, specs);
      return undefined;
    }
    return this.#cells.get(key);
  }

  #schedule(signature: string, specs: readonly ExomuxSettingsButtonSpec[]): void {
    if (this.#rendering || this.#disposed) return;
    this.#rendering = true;
    void this.#render(signature, specs);
  }

  async #render(signature: string, specs: readonly ExomuxSettingsButtonSpec[]): Promise<void> {
    try {
      const width = specs.reduce((wide, spec) => Math.max(wide, rowWidthOf(spec)), 1);
      this.#surface.resize(width, Math.max(1, specs.length));
      this.#surface.mount((tui) =>
        specs.map((spec, index) =>
          new Button({
            parent: tui,
            zIndex: 1,
            rectangle: { column: 0, row: index, width: rowWidthOf(spec), height: 1 },
            theme: {
              base: createAnsiStyle({ foreground: spec.foreground, background: spec.background, bold: true }),
            },
            label: { text: spec.label },
          })
        )
      );
      // An unsettled render (pass cap hit) must not commit its signature, so
      // the next request re-renders instead of freezing a half-applied frame.
      const settled = await this.#surface.render();
      if (this.#disposed) return;
      const captured = new Map<string, ExomuxSettingsButtonCells>();
      specs.forEach((spec, index) => {
        const rowWidth = rowWidthOf(spec);
        const cells: ExomuxWidgetCell[] = [];
        for (let column = 0; column < rowWidth; column += 1) cells.push(this.#surface.cellAt(index, column));
        captured.set(spec.key, { width: rowWidth, cells });
      });
      this.#cells = captured;
      if (settled) this.#signature = signature;
    } finally {
      this.#rendering = false;
    }
    // A completed render may still lag the latest request; the repaint re-runs
    // cellsFor(), which either blits the fresh cells or schedules another pass.
    if (!this.#disposed) this.#requestRepaint();
  }

  dispose(): void {
    this.#disposed = true;
    this.#surface.dispose();
  }
}
