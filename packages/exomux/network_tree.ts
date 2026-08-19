// Copyright 2023 Im-Beast. MIT license.

// The network panel's hierarchy as a real exotui Tree, composited in.
//
// The Hosts/Tailscale tree is rendered by a genuine `Tree` widget on an
// off-screen surface and composited into the panel. Row state colour rides the
// new tree-row options: depth-0 headings take the accent, `note` rows and
// offline devices recede to muted (both flags carried on the `TreeNode`s the
// controller builds), and the selection is an opaque accent block.
//
// It is view-bound: the app's existing routing (click, Enter, fold keys)
// drives the live `controller.networkTree`; this host renders a snapshot of
// its nodes. Rendering is async, so a render captures a snapshot the painter
// blits; until a matching snapshot exists the caller falls back to its
// hand-drawn rows.

import { createAnsiStyle, flattenTreeRows, resolveSelectionPaint, Signal, Tree, type TreeNode } from "@ubernaut/exotui";
import { ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** The tree's size, contents, selection, and colours for a sync pass. */
export interface ExomuxNetworkTreeSpec {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly TreeNode[];
  readonly selectedIndex: number;
  /** Whether the panel window has focus; the highlight only shows when it does. */
  readonly active: boolean;
  readonly foreground: ExomuxRgb;
  readonly mutedForeground: ExomuxRgb;
  readonly headingForeground: ExomuxRgb;
  readonly background: ExomuxRgb;
  readonly selectedForeground: ExomuxRgb;
  readonly selectedBackground: ExomuxRgb;
  readonly selectedUnfocusedForeground: ExomuxRgb;
  readonly selectedUnfocusedBackground: ExomuxRgb;
  readonly scrollbarTrack: ExomuxRgb;
  readonly scrollbarThumb: ExomuxRgb;
}

function signatureOf(spec: ExomuxNetworkTreeSpec): string {
  const rows = flattenTreeRows(spec.nodes);
  return [
    spec.width,
    spec.height,
    spec.selectedIndex,
    spec.active ? 1 : 0,
    rows.length,
    rows.map((row) => `${row.node.note ? "n" : ""}${row.node.status ?? ""}${row.text}`).join("\n"),
    spec.foreground.join(","),
    spec.mutedForeground.join(","),
    spec.headingForeground.join(","),
    spec.background.join(","),
    spec.selectedForeground.join(","),
    spec.selectedBackground.join(","),
    spec.selectedUnfocusedForeground.join(","),
    spec.selectedUnfocusedBackground.join(","),
    spec.scrollbarTrack.join(","),
    spec.scrollbarThumb.join(","),
  ].join("|");
}

/** Hosts the network panel's hierarchy as a real, composited Tree widget. */
export class ExomuxNetworkTree {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #requestRepaint: () => void;
  #spec?: ExomuxNetworkTreeSpec;
  #signature = "";
  #renderedSignature = "";
  #dirty = false;
  #rendering = false;
  #disposed = false;

  constructor(requestRepaint: () => void) {
    this.#requestRepaint = requestRepaint;
  }

  /** Declares the tree's current contents; schedules a render when they change. */
  sync(spec: ExomuxNetworkTreeSpec): void {
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

  /** One rendered cell in tree-local coordinates. */
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
        const heading = createAnsiStyle({
          foreground: spec.headingForeground,
          background: spec.background,
          bold: true,
        });
        const selectedStyle = createAnsiStyle({
          foreground: spec.selectedForeground,
          background: spec.selectedBackground,
          bold: true,
        });
        const selectedUnfocusedStyle = createAnsiStyle({
          foreground: spec.selectedUnfocusedForeground,
          background: spec.selectedUnfocusedBackground,
        });
        const tree = new Tree({
          parent: tui,
          zIndex: 1,
          rectangle: { column: 0, row: 0, width, height },
          theme: { base },
          // A plain node snapshot: the Tree owns (and disposes) its controller,
          // so remounts never accumulate subscriptions on the live tree.
          nodes: spec.nodes.map((node) => ({ ...node })),
          selectedIndex: new Signal(spec.selectedIndex),
          rowStyle: (row, selected) => {
            switch (resolveSelectionPaint({ selected, collectionFocused: spec.active })) {
              case "selected":
                return selectedStyle;
              case "selected-unfocused":
                return selectedUnfocusedStyle;
              default:
                return row.depth === 0 ? heading : row.node.note || row.node.status === "offline" ? muted : base;
            }
          },
          markerFor: (_row, selected) =>
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
        return [tree];
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
