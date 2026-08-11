// Copyright 2023 Im-Beast. MIT license.

// The settings window's session-name editor as a real exotui Input, composited
// in. While a rename is in progress an Input is mounted over the field: it owns
// the text and cursor natively (typing, backspace, cursor keys, and Enter to
// submit), and its changes are pushed to the controller's rename draft. The
// controller still owns commit and cancel — Enter routes through the Input's
// onSubmit, Escape is handled by the caller — so the live-rename flow is
// unchanged. Rendering is async (component draws defer to microtasks) so a
// render captures a snapshot the painter blits; the caller falls back to a
// hand-drawn draft until the snapshot is ready.

import { createAnsiStyle, Input, Signal } from "@ubernaut/deno-tui";
import { createTestKeyPress } from "@ubernaut/deno-tui/testing";
import { ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** A key forwarded to the field (a subset of the library KeyPressEvent). */
export interface ExomuxSessionNameKey {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
}

/** The field's placement and colours for a sync pass. */
export interface ExomuxSessionNameSpec {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly foreground: ExomuxRgb;
  readonly background: ExomuxRgb;
  readonly cursorForeground: ExomuxRgb;
  readonly cursorBackground: ExomuxRgb;
}

function specSignature(spec: ExomuxSessionNameSpec): string {
  return [
    spec.column,
    spec.row,
    spec.width,
    spec.foreground.join(","),
    spec.background.join(","),
    spec.cursorForeground.join(","),
    spec.cursorBackground.join(","),
  ].join(":");
}

/** Hosts the session-name editor as a real, composited Input. */
export class ExomuxSessionNameField {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #requestRepaint: () => void;
  readonly #onDraftChange: (text: string) => void;
  readonly #onSubmit: () => void;
  #text?: Signal<string>;
  #input?: Input;
  #signature = "";
  #editing = false;
  #renderedSignature = "";
  #dirty = false;
  #rendering = false;
  #disposed = false;

  constructor(requestRepaint: () => void, onDraftChange: (text: string) => void, onSubmit: () => void) {
    this.#requestRepaint = requestRepaint;
    this.#onDraftChange = onDraftChange;
    this.#onSubmit = onSubmit;
  }

  /** True while the Input is mounted (a rename is being edited). */
  get editing(): boolean {
    return this.#editing;
  }

  /** True once a rendered snapshot matches the current geometry. */
  ready(): boolean {
    return this.#editing && this.#renderedSignature === this.#signature && this.#signature !== "";
  }

  /** One rendered cell in field-local coordinates. */
  cellAt(row: number, column: number): string | Uint8Array | undefined {
    return this.#surface.cellAt(row, column);
  }

  /**
   * Reflects the current edit state. When editing begins the Input is mounted
   * seeded with `draft`; geometry/colour changes remount (preserving the draft);
   * when editing ends the Input is torn down.
   */
  sync(editing: boolean, draft: string, spec: ExomuxSessionNameSpec): void {
    if (this.#disposed) return;
    if (!editing) {
      if (this.#editing) {
        this.#unmount();
        this.#editing = false;
        this.#signature = "";
        this.#renderedSignature = "";
        this.#requestRepaint();
      }
      return;
    }
    const signature = specSignature(spec);
    if (!this.#editing || signature !== this.#signature) {
      this.#signature = signature;
      this.#editing = true;
      this.#mount(draft, spec);
      this.#dirty = true;
    }
    if (this.#dirty && !this.#rendering) void this.#render();
  }

  /** Routes a key to the Input (typing, cursor, backspace, Enter → submit). */
  handleKey(event: ExomuxSessionNameKey): void {
    if (!this.#input) return;
    this.#input.emit(
      "keyPress",
      createTestKeyPress(event.key as Parameters<typeof createTestKeyPress>[0], {
        ctrl: event.ctrl,
        meta: event.meta,
        shift: event.shift,
      }),
    );
    this.#dirty = true;
    if (!this.#rendering) void this.#render();
  }

  dispose(): void {
    this.#disposed = true;
    this.#unmount();
    this.#surface.dispose();
  }

  #mount(draft: string, spec: ExomuxSessionNameSpec): void {
    this.#text?.dispose();
    const text = new Signal(draft);
    this.#text = text;
    const base = createAnsiStyle({ foreground: spec.foreground, background: spec.background });
    const cursor = createAnsiStyle({ foreground: spec.cursorForeground, background: spec.cursorBackground });
    this.#surface.resize(Math.max(1, Math.floor(spec.width)), 1);
    this.#surface.mount((tui) => {
      this.#input = new Input({
        parent: tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: Math.max(1, Math.floor(spec.width)) },
        theme: { base, value: { base }, cursor: { base: cursor }, placeholder: { base } },
        text,
        cursorPosition: draft.length,
        // Session names are restricted to this alphabet; the controller re-applies
        // the same filter and the length cap when the draft is pushed to it.
        validator: /[A-Za-z0-9._-]/,
        onChange: (value) => this.#onDraftChange(value),
        onSubmit: () => this.#onSubmit(),
      });
      return [this.#input];
    });
  }

  #unmount(): void {
    this.#surface.dispose();
    this.#input = undefined;
    this.#text?.dispose();
    this.#text = undefined;
  }

  async #render(): Promise<void> {
    if (this.#disposed || this.#rendering || !this.#input) return;
    this.#rendering = true;
    const signature = this.#signature;
    this.#dirty = false;
    try {
      await this.#surface.render();
    } finally {
      this.#rendering = false;
    }
    if (this.#disposed || !this.#editing) return;
    this.#renderedSignature = signature;
    this.#requestRepaint();
    if (this.#dirty && !this.#rendering) void this.#render();
  }
}
