// Copyright 2023 Im-Beast. MIT license.

// Interactive exotui pickers for the settings window, composited in.
//
// The settings window's theme and background selectors are real exotui `List`
// components. They are mounted on an off-screen `ExomuxWidgetSurface`, bound
// two-way to the controller's theme/background signals, and driven by input
// forwarded from the desktop's own routing: a click, wheel notch, or arrow key
// on a picker region is dispatched straight to the List (via `component.emit`),
// exactly the events a real terminal read would produce. The List updates its
// own selection, its bound signal applies the change to the controller, and the
// captured cell grid is composited back into the window.
//
// Rendering is asynchronous (component draws defer to microtasks) while the
// desktop paints synchronously, so a render captures a snapshot the painter
// blits; input and geometry/theme changes mark the snapshot dirty and schedule
// a fresh render plus a repaint. Until a snapshot matches the current request
// the caller falls back to its own hand-drawn rows, so a picker is never blank.

import { type Component, createAnsiStyle, List, Signal, type Style } from "@ubernaut/deno-tui";
import { createTestKeyPress, createTestMousePress, createTestMouseScroll } from "@ubernaut/deno-tui/testing";
import { ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** Which picker a routed input targets. */
export type ExomuxPickerPane = "theme" | "background";

/** A key event forwarded to a picker (a subset of the library KeyPressEvent). */
export interface ExomuxPickerKey {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
}

/** The controller surface the pickers bind to (the real controller satisfies this). */
export interface ExomuxPickerBindings {
  readonly themeIndex: () => number;
  readonly setThemeIndex: (index: number) => void;
  readonly onThemeIndexChanged: (listener: () => void) => () => void;
  readonly backgroundIndex: () => number;
  readonly setBackgroundIndex: (index: number) => void;
  readonly onBackgroundIndexChanged: (listener: () => void) => () => void;
}

/** One picker's placement and appearance for a sync pass. */
export interface ExomuxPickerSpec {
  /** Client-relative rectangle the List occupies. */
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
  readonly items: readonly string[];
  readonly foreground: ExomuxRgb;
  readonly background: ExomuxRgb;
}

function rectSignature(spec: ExomuxPickerSpec): string {
  return [
    spec.column,
    spec.row,
    spec.width,
    spec.height,
    spec.items.length,
    spec.foreground.join(","),
    spec.background.join(","),
  ].join(":");
}

/** Hosts the settings window's theme/background pickers as real List widgets. */
export class ExomuxSettingsSurface {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #requestRepaint: () => void;
  readonly #themeSelected = new Signal<number>(0);
  readonly #backgroundSelected = new Signal<number>(0);
  #bindings?: ExomuxPickerBindings;
  #unbind: Array<() => void> = [];
  #themeList?: List;
  #backgroundList?: List;
  #themeSpec?: ExomuxPickerSpec;
  #backgroundSpec?: ExomuxPickerSpec;
  #signature = "";
  #renderedSignature = "";
  #dirty = true;
  #rendering = false;
  #disposed = false;

  constructor(requestRepaint: () => void) {
    this.#requestRepaint = requestRepaint;
  }

  /** Binds the pickers to the controller's theme/background selection. Idempotent. */
  bind(bindings: ExomuxPickerBindings): void {
    if (this.#bindings === bindings || this.#disposed) return;
    this.#releaseBindings();
    this.#bindings = bindings;
    this.#themeSelected.value = bindings.themeIndex();
    this.#backgroundSelected.value = bindings.backgroundIndex();
    // Surface -> controller: any selection move (click, wheel, arrow) applies live.
    const applyTheme = () => {
      const index = this.#themeSelected.peek();
      if (index !== bindings.themeIndex()) bindings.setThemeIndex(index);
    };
    const applyBackground = () => {
      const index = this.#backgroundSelected.peek();
      if (index !== bindings.backgroundIndex()) bindings.setBackgroundIndex(index);
    };
    this.#themeSelected.subscribe(applyTheme);
    this.#backgroundSelected.subscribe(applyBackground);
    this.#unbind.push(() => this.#themeSelected.unsubscribe(applyTheme));
    this.#unbind.push(() => this.#backgroundSelected.unsubscribe(applyBackground));
    // Controller -> surface: external changes reflect in the list marker.
    this.#unbind.push(
      bindings.onThemeIndexChanged(() => {
        const index = bindings.themeIndex();
        if (index !== this.#themeSelected.peek()) {
          this.#themeSelected.value = index;
          this.#markDirty();
          this.#scheduleRender();
        }
      }),
    );
    this.#unbind.push(
      bindings.onBackgroundIndexChanged(() => {
        const index = bindings.backgroundIndex();
        if (index !== this.#backgroundSelected.peek()) {
          this.#backgroundSelected.value = index;
          this.#markDirty();
          this.#scheduleRender();
        }
      }),
    );
  }

  /** Declares the pickers' current geometry/appearance; schedules a render if needed. */
  sync(theme: ExomuxPickerSpec, background: ExomuxPickerSpec): void {
    if (this.#disposed) return;
    this.#themeSpec = theme;
    this.#backgroundSpec = background;
    const signature = `${rectSignature(theme)}|${rectSignature(background)}`;
    if (signature !== this.#signature) {
      this.#signature = signature;
      this.#remount();
      this.#markDirty();
    }
    if (this.#dirty) this.#scheduleRender();
  }

  /** True once a rendered snapshot matches the latest requested geometry/appearance. */
  ready(): boolean {
    return !this.#disposed && this.#renderedSignature === this.#signature && this.#signature !== "";
  }

  /** One rendered cell in surface-local (client-relative) coordinates. */
  cellAt(row: number, column: number): string | Uint8Array | undefined {
    return this.#surface.cellAt(row, column);
  }

  /** Routes a click at a client-relative cell to the given picker. */
  handlePointer(pane: ExomuxPickerPane, column: number, row: number): void {
    const list = pane === "theme" ? this.#themeList : this.#backgroundList;
    list?.emit("mousePress", createTestMousePress({ x: column, y: row, button: 0 }));
    this.#markDirty();
    this.#scheduleRender();
  }

  /** Routes a wheel notch (positive = down) to the given picker. */
  handleScroll(pane: ExomuxPickerPane, delta: number): void {
    if (!delta) return;
    const list = pane === "theme" ? this.#themeList : this.#backgroundList;
    list?.emit("mouseScroll", createTestMouseScroll(delta > 0 ? 1 : -1));
    this.#markDirty();
    this.#scheduleRender();
  }

  /** Routes a key press to the given picker. */
  handleKey(pane: ExomuxPickerPane, event: ExomuxPickerKey): void {
    const list = pane === "theme" ? this.#themeList : this.#backgroundList;
    list?.emit(
      "keyPress",
      createTestKeyPress(event.key as Parameters<typeof createTestKeyPress>[0], {
        ctrl: event.ctrl,
        meta: event.meta,
        shift: event.shift,
      }),
    );
    this.#markDirty();
    this.#scheduleRender();
  }

  dispose(): void {
    this.#disposed = true;
    this.#releaseBindings();
    this.#surface.dispose();
    this.#themeSelected.dispose();
    this.#backgroundSelected.dispose();
  }

  #markDirty(): void {
    this.#dirty = true;
  }

  /** Renders when there is a mounted tree, a dirty snapshot, and no render in flight. */
  #scheduleRender(): void {
    if (this.#disposed || this.#rendering || !this.#dirty || !this.#themeList) return;
    void this.#render();
  }

  #releaseBindings(): void {
    for (const off of this.#unbind) {
      try {
        off();
      } catch {
        // A failed unsubscribe must not strand the rest.
      }
    }
    this.#unbind = [];
    this.#bindings = undefined;
  }

  #remount(): void {
    const theme = this.#themeSpec;
    const background = this.#backgroundSpec;
    if (!theme || !background) return;
    const width = Math.max(
      1,
      theme.column + theme.width,
      background.column + background.width,
    );
    const height = Math.max(
      1,
      theme.row + theme.height,
      background.row + background.height,
    );
    this.#surface.resize(width, height);
    this.#surface.mount((tui) => {
      this.#themeList = new List({
        parent: tui,
        zIndex: 1,
        rectangle: { column: theme.column, row: theme.row, width: theme.width, height: theme.height },
        theme: pickerTheme(theme),
        items: [...theme.items],
        selectedIndex: this.#themeSelected,
      });
      this.#backgroundList = new List({
        parent: tui,
        zIndex: 1,
        rectangle: {
          column: background.column,
          row: background.row,
          width: background.width,
          height: background.height,
        },
        theme: pickerTheme(background),
        items: [...background.items],
        selectedIndex: this.#backgroundSelected,
      });
      return [this.#themeList, this.#backgroundList] as Component[];
    });
  }

  async #render(): Promise<void> {
    if (this.#disposed || this.#rendering) return;
    this.#rendering = true;
    const signature = this.#signature;
    this.#dirty = false;
    try {
      await this.#surface.render();
    } finally {
      this.#rendering = false;
    }
    if (this.#disposed) return;
    this.#renderedSignature = signature;
    // A later change may have dirtied the surface while this render was in
    // flight; the repaint re-runs sync()/input and schedules another pass.
    this.#requestRepaint();
    if (this.#dirty && !this.#rendering) void this.#render();
  }
}

/** A List theme: the selected row carries the library's `>` marker over this base. */
function pickerTheme(spec: ExomuxPickerSpec): { base: Style } {
  return { base: createAnsiStyle({ foreground: spec.foreground, background: spec.background }) };
}
