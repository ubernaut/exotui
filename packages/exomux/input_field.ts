// Copyright 2023 Im-Beast. MIT license.

// A single-line exotui `Input` composited into the hand-painted desktop.
//
// This is the reusable form of the pattern the session-name editor proved: an
// `Input` mounted on a headless `ExomuxWidgetSurface` owns its text and cursor
// natively (typing, backspace, cursor keys, Enter to submit), and its value is
// pushed to a caller-owned model through `onChange`. The caller drives geometry
// and colours through `sync`, forwards keys through `handleKey`, and blits the
// rendered cells with `cellAt`. Rendering is async (component draws defer to
// microtasks), so a render captures a snapshot the painter blits; the caller
// falls back to a hand-drawn value until `ready()` is true.
//
// `password` masks the value (exotui's `Input` censors to `*`); `validator`
// restricts the accepted alphabet. The SCP password prompt and the session-name
// editor are both just this field with different options.

import { createAnsiStyle, Input, Signal } from "@ubernaut/deno-tui";
import { createTestKeyPress } from "@ubernaut/deno-tui/testing";
import { ExomuxWidgetSurface } from "./widget_surface.ts";
import type { ExomuxRgb } from "./model.ts";

/** A key forwarded to the field (a subset of the library KeyPressEvent). */
export interface ExomuxInputKey {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
}

/** The field's placement and colours for a sync pass. */
export interface ExomuxInputFieldSpec {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly foreground: ExomuxRgb;
  readonly background: ExomuxRgb;
  readonly cursorForeground: ExomuxRgb;
  readonly cursorBackground: ExomuxRgb;
}

/** Fixed options that do not change between sync passes. */
export interface ExomuxInputFieldOptions {
  /** Repaint the desktop once a snapshot is ready (or the field is torn down). */
  readonly requestRepaint: () => void;
  /** Receives the field's value on every edit. */
  readonly onChange: (value: string) => void;
  /** Enter submits: run this, if given. */
  readonly onSubmit?: () => void;
  /** Censor the value (`*`), for passwords. */
  readonly password?: boolean;
  /** Restrict the accepted alphabet. */
  readonly validator?: RegExp;
}

function specSignature(spec: ExomuxInputFieldSpec): string {
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

/** Hosts one composited, interactive `Input` over a region of the desktop. */
export class ExomuxInputField {
  readonly #surface = new ExomuxWidgetSurface(1, 1);
  readonly #options: ExomuxInputFieldOptions;
  #text?: Signal<string>;
  #input?: Input;
  #signature = "";
  #active = false;
  #renderedSignature = "";
  #dirty = false;
  #rendering = false;
  #disposed = false;

  constructor(options: ExomuxInputFieldOptions) {
    this.#options = options;
  }

  /** True while the Input is mounted. */
  get active(): boolean {
    return this.#active;
  }

  /** True once a rendered snapshot matches the current geometry. */
  ready(): boolean {
    return this.#active && this.#renderedSignature === this.#signature && this.#signature !== "";
  }

  /** One rendered cell in field-local coordinates. */
  cellAt(row: number, column: number): string | Uint8Array | undefined {
    return this.#surface.cellAt(row, column);
  }

  /**
   * Reflects the current edit state. When it becomes active the Input is mounted
   * seeded with `value`; geometry/colour changes remount (preserving `value`);
   * when it goes inactive the Input is torn down.
   */
  sync(active: boolean, value: string, spec: ExomuxInputFieldSpec): void {
    if (this.#disposed) return;
    if (!active) {
      if (this.#active) {
        this.#unmount();
        this.#active = false;
        this.#signature = "";
        this.#renderedSignature = "";
        this.#options.requestRepaint();
      }
      return;
    }
    const signature = specSignature(spec);
    if (!this.#active || signature !== this.#signature) {
      this.#signature = signature;
      this.#active = true;
      this.#mount(value, spec);
      this.#dirty = true;
    }
    if (this.#dirty && !this.#rendering) void this.#render();
  }

  /** Routes a key to the Input (typing, cursor, backspace, Enter → submit). */
  handleKey(event: ExomuxInputKey): void {
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

  #mount(value: string, spec: ExomuxInputFieldSpec): void {
    this.#text?.dispose();
    const text = new Signal(value);
    this.#text = text;
    const base = createAnsiStyle({ foreground: spec.foreground, background: spec.background });
    const cursor = createAnsiStyle({ foreground: spec.cursorForeground, background: spec.cursorBackground });
    const width = Math.max(1, Math.floor(spec.width));
    this.#surface.resize(width, 1);
    this.#surface.mount((tui) => {
      this.#input = new Input({
        parent: tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width },
        theme: { base, value: { base }, cursor: { base: cursor }, placeholder: { base } },
        text,
        cursorPosition: value.length,
        password: this.#options.password ?? false,
        ...(this.#options.validator ? { validator: this.#options.validator } : {}),
        onChange: (next) => this.#options.onChange(next),
        onSubmit: this.#options.onSubmit ? () => this.#options.onSubmit!() : undefined,
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
      // An unsettled render (pass cap hit mid-scroll) stays dirty so the
      // next pass replaces the half-applied frame instead of freezing it.
      if (!(await this.#surface.render())) this.#dirty = true;
    } finally {
      this.#rendering = false;
    }
    if (this.#disposed || !this.#active) return;
    this.#renderedSignature = signature;
    this.#options.requestRepaint();
    if (this.#dirty && !this.#rendering) void this.#render();
  }
}
