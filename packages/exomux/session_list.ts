// Copyright 2023 Im-Beast. MIT license.

// The sessions panel's rows as a real exotui List, composited in.
//
// The detached-session list is rendered by a genuine `List` widget on an
// off-screen surface and composited into the panel, like the settings pickers
// and the background-config list. Per-row state colour (a stopped session
// muted, the selection an opaque accent block) rides on `List.rowStyle`; wheel
// scrolling moves the viewport through `scrollTop` without touching the
// selection — the listbox behaviour the hand-drawn panel never had.
//
// It is view-bound: the app's existing routing (click to select, Enter to
// attach, wheel to scroll) drives changes; this host only displays them.
// Rendering is async, so a render captures a snapshot the painter blits; until
// a matching snapshot exists the caller falls back to its hand-drawn rows.

import { createAnsiStyle, List, resolveSelectionPaint, Signal } from "@ubernaut/deno-tui";
import { ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** One session row: its display label and whether the session is running. */
export interface ExomuxSessionListRow {
  readonly label: string;
  readonly running: boolean;
}

/** The list's size, contents, selection, and colours for a sync pass. */
export interface ExomuxSessionListSpec {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly ExomuxSessionListRow[];
  readonly selectedIndex: number;
  /** Explicit viewport top for wheel scrolling; -1 follows the selection. */
  readonly scrollTop: number;
  /**
   * Whether the panel window has focus. The selected row is drawn either way —
   * it is still this list's current item — but an unfocused panel shows it
   * muted rather than accented, so two lists on screen never look like two
   * cursors. Before 044 an unfocused panel showed no highlight at all, which
   * lost the user's place instead of de-emphasising it.
   */
  readonly active: boolean;
  readonly foreground: ExomuxRgb;
  readonly mutedForeground: ExomuxRgb;
  readonly background: ExomuxRgb;
  readonly selectedForeground: ExomuxRgb;
  readonly selectedBackground: ExomuxRgb;
  readonly selectedUnfocusedForeground: ExomuxRgb;
  readonly selectedUnfocusedBackground: ExomuxRgb;
  readonly scrollbarTrack: ExomuxRgb;
  readonly scrollbarThumb: ExomuxRgb;
}

function signatureOf(spec: ExomuxSessionListSpec): string {
  return [
    spec.width,
    spec.height,
    spec.selectedIndex,
    spec.scrollTop,
    spec.active ? 1 : 0,
    spec.rows.length,
    spec.rows.map((row) => `${row.running ? 1 : 0}${row.label}`).join(" "),
    spec.foreground.join(","),
    spec.mutedForeground.join(","),
    spec.background.join(","),
    spec.selectedForeground.join(","),
    spec.selectedBackground.join(","),
    spec.selectedUnfocusedForeground.join(","),
    spec.selectedUnfocusedBackground.join(","),
    spec.scrollbarTrack.join(","),
    spec.scrollbarThumb.join(","),
  ].join("|");
}

/** Hosts the sessions panel's rows as a real, composited List widget. */
export class ExomuxSessionList {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #requestRepaint: () => void;
  #spec?: ExomuxSessionListSpec;
  #signature = "";
  #renderedSignature = "";
  #dirty = false;
  #rendering = false;
  #disposed = false;

  constructor(requestRepaint: () => void) {
    this.#requestRepaint = requestRepaint;
  }

  /** Declares the list's current contents; schedules a render when they change. */
  sync(spec: ExomuxSessionListSpec): void {
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

  /** One rendered cell in list-local coordinates. */
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
        const base = createAnsiStyle({ foreground: spec.foreground, background: spec.background });
        const muted = createAnsiStyle({ foreground: spec.mutedForeground, background: spec.background });
        const selectedStyle = createAnsiStyle({
          foreground: spec.selectedForeground,
          background: spec.selectedBackground,
          bold: true,
        });
        const selectedUnfocusedStyle = createAnsiStyle({
          foreground: spec.selectedUnfocusedForeground,
          background: spec.selectedUnfocusedBackground,
        });
        const list = new List({
          parent: tui,
          zIndex: 1,
          rectangle: { column: 0, row: 0, width, height },
          theme: { base },
          items: spec.rows.map((row) => row.label),
          selectedIndex: new Signal(spec.selectedIndex),
          // The selection is a deliberate opaque block; a stopped session's row
          // recedes. An inactive panel keeps its place, muted.
          rowStyle: (index, selected) => {
            switch (resolveSelectionPaint({ selected, collectionFocused: spec.active })) {
              case "selected":
                return selectedStyle;
              case "selected-unfocused":
                return selectedUnfocusedStyle;
              default:
                return spec.rows[index]?.running ? base : muted;
            }
          },
          // `·` for a current row the keyboard is not on is exomux's existing
          // convention, used by the settings panes.
          markerFor: (_index, selected) =>
            resolveSelectionPaint({ selected, collectionFocused: spec.active }) === "selected"
              ? ">"
              : selected
              ? "·"
              : " ",
          scrollbar: {
            track: createAnsiStyle({ foreground: spec.scrollbarTrack, background: spec.scrollbarTrack }),
            thumb: createAnsiStyle({ foreground: spec.scrollbarThumb, background: spec.scrollbarThumb }),
          },
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
