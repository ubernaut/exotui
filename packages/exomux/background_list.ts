// Copyright 2023 Im-Beast. MIT license.

// The background-config modal's list pane as a real exotui List, composited in.
//
// The modal's preset/image list is rendered by a genuine `List` widget on an
// off-screen surface and composited into the modal, matching the settings
// pickers. It is view-bound: it displays the controller's current selection and
// the active item (a `·` marker distinct from the `>` cursor, via the List's
// markerFor), while the modal's existing routing drives changes. Rendering is
// async, so a render captures a snapshot the painter blits; until a matching
// snapshot exists the caller falls back to its own hand-drawn rows.

import { createAnsiStyle, List, Signal } from "@ubernaut/exotui";
import { ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** The list pane's size, contents, selection, and colours for a sync pass. */
export interface ExomuxBackgroundListSpec {
  readonly width: number;
  readonly height: number;
  readonly items: readonly string[];
  readonly selectedIndex: number;
  /** The active/current row (e.g. the live butterchurn preset), or -1 for none. */
  readonly activeIndex: number;
  /** Explicit viewport top for wheel scrolling; -1 follows the selection. */
  readonly scrollTop: number;
  readonly foreground: ExomuxRgb;
  readonly background: ExomuxRgb;
  readonly selectedForeground: ExomuxRgb;
  readonly selectedBackground: ExomuxRgb;
  readonly scrollbarTrack: ExomuxRgb;
  readonly scrollbarThumb: ExomuxRgb;
}

function signatureOf(spec: ExomuxBackgroundListSpec): string {
  return [
    spec.width,
    spec.height,
    spec.selectedIndex,
    spec.activeIndex,
    spec.scrollTop,
    spec.items.length,
    spec.items.join("\u0000"),
    spec.foreground.join(","),
    spec.background.join(","),
    spec.selectedForeground.join(","),
    spec.selectedBackground.join(","),
    spec.scrollbarTrack.join(","),
    spec.scrollbarThumb.join(","),
  ].join("|");
}

/** Hosts the background-config list pane as a real, composited List widget. */
export class ExomuxBackgroundList {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #requestRepaint: () => void;
  #spec?: ExomuxBackgroundListSpec;
  #signature = "";
  #renderedSignature = "";
  #dirty = false;
  #rendering = false;
  #disposed = false;

  constructor(requestRepaint: () => void) {
    this.#requestRepaint = requestRepaint;
  }

  /** Declares the pane's current contents; schedules a render when they change. */
  sync(spec: ExomuxBackgroundListSpec): void {
    if (this.#disposed) return;
    this.#spec = spec;
    const signature = signatureOf(spec);
    if (signature !== this.#signature) {
      this.#signature = signature;
      this.#dirty = true;
    }
    if (this.#dirty && !this.#rendering) void this.#render();
  }

  /** True once a rendered snapshot matches the latest declared contents. */
  ready(): boolean {
    return !this.#disposed && this.#renderedSignature === this.#signature && this.#signature !== "";
  }

  /** One rendered cell in pane-local coordinates. */
  cellAt(row: number, column: number): string | Uint8Array | undefined {
    return this.#surface.cellAt(row, column);
  }

  dispose(): void {
    this.#disposed = true;
    this.#surface.dispose();
  }

  async #render(): Promise<void> {
    const spec = this.#spec;
    if (!spec || this.#disposed || this.#rendering) return;
    this.#rendering = true;
    const signature = this.#signature;
    this.#dirty = false;
    try {
      const width = Math.max(1, Math.floor(spec.width));
      const height = Math.max(1, Math.floor(spec.height));
      this.#surface.resize(width, height);
      this.#surface.mount((tui) => {
        const list = new List({
          parent: tui,
          zIndex: 1,
          rectangle: { column: 0, row: 0, width, height },
          theme: { base: createAnsiStyle({ foreground: spec.foreground, background: spec.background }) },
          items: [...spec.items],
          selectedIndex: new Signal(spec.selectedIndex),
          selectedStyle: createAnsiStyle({
            foreground: spec.selectedForeground,
            background: spec.selectedBackground,
            bold: true,
          }),
          scrollbar: {
            track: createAnsiStyle({ foreground: spec.scrollbarTrack, background: spec.scrollbarTrack }),
            thumb: createAnsiStyle({ foreground: spec.scrollbarThumb, background: spec.scrollbarThumb }),
          },
          // A `·` marks the active item (e.g. the live preset), the `>` the cursor.
          markerFor: (index, selected) => selected ? ">" : index === spec.activeIndex ? "·" : " ",
        });
        // -1 follows the selection; a real top scrolls the viewport in place.
        // Set after construction (items already in place) so it is not reset.
        list.controller.scrollTop.value = spec.scrollTop;
        return [list];
      });
      // An unsettled render (pass cap hit mid-scroll) stays dirty so the
      // next pass replaces the half-applied frame instead of freezing it.
      if (!(await this.#surface.render())) this.#dirty = true;
      if (this.#disposed) return;
      this.#renderedSignature = signature;
    } finally {
      this.#rendering = false;
    }
    if (!this.#disposed) this.#requestRepaint();
    if (this.#dirty && !this.#rendering) void this.#render();
  }
}
