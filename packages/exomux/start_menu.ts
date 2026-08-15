// Copyright 2023 Im-Beast. MIT license.

// The start-menu dropdown's command rows as a real exotui ContextMenu,
// composited in.
//
// Danger commands (Quit) take the destructive tone through the ContextMenu's
// per-item styling, the keyboard selection is an accent block with the menu's
// own `>` marker, and the app's routing (click, arrows, Enter, Escape) drives
// the selection it displays. Rendering is async, so a render captures a
// snapshot the painter blits; until a matching snapshot exists the caller
// falls back to its hand-drawn rows.

import { ContextMenu, createAnsiStyle, Signal } from "@ubernaut/deno-tui";
import { ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** One start-menu command row for a sync pass. */
export interface ExomuxStartMenuRow {
  readonly id: string;
  readonly label: string;
  readonly danger: boolean;
}

/** The menu's size, contents, selection, and colours for a sync pass. */
export interface ExomuxStartMenuSpec {
  readonly width: number;
  readonly height: number;
  readonly items: readonly ExomuxStartMenuRow[];
  readonly selectedIndex: number;
  readonly foreground: ExomuxRgb;
  readonly background: ExomuxRgb;
  readonly dangerForeground: ExomuxRgb;
  readonly selectedForeground: ExomuxRgb;
  readonly selectedBackground: ExomuxRgb;
}

function signatureOf(spec: ExomuxStartMenuSpec): string {
  return [
    spec.width,
    spec.height,
    spec.selectedIndex,
    spec.items.map((item) => `${item.danger ? "!" : ""}${item.id}=${item.label}`).join("|"),
    spec.foreground.join(","),
    spec.background.join(","),
    spec.dangerForeground.join(","),
    spec.selectedForeground.join(","),
    spec.selectedBackground.join(","),
  ].join("#");
}

/** Hosts the start menu's command rows as a real, composited ContextMenu. */
export class ExomuxStartMenu {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #requestRepaint: () => void;
  #spec?: ExomuxStartMenuSpec;
  #signature = "";
  #renderedSignature = "";
  #dirty = false;
  #rendering = false;
  #disposed = false;

  constructor(requestRepaint: () => void) {
    this.#requestRepaint = requestRepaint;
  }

  /** Declares the menu's current contents; schedules a render when they change. */
  sync(spec: ExomuxStartMenuSpec): void {
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

  /** One rendered cell in menu-local coordinates. */
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
        const danger = createAnsiStyle({
          foreground: spec.dangerForeground,
          background: spec.background,
          bold: true,
        });
        const selected = createAnsiStyle({
          foreground: spec.selectedForeground,
          background: spec.selectedBackground,
          bold: true,
        });
        const menu = new ContextMenu({
          parent: tui,
          zIndex: 1,
          rectangle: { column: 0, row: 0, width, height },
          theme: { base },
          items: spec.items.map((item) => ({ id: item.id, label: item.label, danger: item.danger })),
          selectedIndex: new Signal(spec.selectedIndex),
          itemStyle: (item, isSelected) => isSelected ? selected : item.danger ? danger : base,
        });
        return [menu];
      });
      await this.#surface.render();
      if (this.#disposed) return;
      this.#renderedSignature = signature;
    } finally {
      this.#rendering = false;
    }
    if (!this.#disposed) this.#requestRepaint();
    if (this.#dirty && !this.#rendering) void this.#render();
  }
}
