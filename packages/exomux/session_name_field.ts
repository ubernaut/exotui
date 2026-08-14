// Copyright 2023 Im-Beast. MIT license.

// The settings window's session-name editor. It is a thin adapter over the
// reusable `ExomuxInputField` (input_field.ts): while a rename is in progress an
// Input is composited over the field — it owns the text and cursor natively
// (typing, backspace, cursor keys, Enter to submit), filtered to the
// session-name alphabet — and pushes its value to the controller's rename draft.
// The controller still owns commit and cancel, so the live-rename flow is
// unchanged.

import { ExomuxInputField, type ExomuxInputFieldSpec, type ExomuxInputKey } from "./input_field.ts";

/** A key forwarded to the field (a subset of the library KeyPressEvent). */
export type ExomuxSessionNameKey = ExomuxInputKey;

/** The field's placement and colours for a sync pass. */
export type ExomuxSessionNameSpec = ExomuxInputFieldSpec;

/**
 * Session names are restricted to this alphabet; the controller re-applies the
 * same filter and the length cap when the draft is pushed to it.
 */
const SESSION_NAME_ALPHABET = /[A-Za-z0-9._-]/;

/** Hosts the session-name editor as a real, composited Input. */
export class ExomuxSessionNameField {
  readonly #field: ExomuxInputField;

  constructor(requestRepaint: () => void, onDraftChange: (text: string) => void, onSubmit: () => void) {
    this.#field = new ExomuxInputField({
      requestRepaint,
      onChange: onDraftChange,
      onSubmit,
      validator: SESSION_NAME_ALPHABET,
    });
  }

  /** True while the Input is mounted (a rename is being edited). */
  get editing(): boolean {
    return this.#field.active;
  }

  /** True once a rendered snapshot matches the current geometry. */
  ready(): boolean {
    return this.#field.ready();
  }

  /** One rendered cell in field-local coordinates. */
  cellAt(row: number, column: number): string | Uint8Array | undefined {
    return this.#field.cellAt(row, column);
  }

  /**
   * Reflects the current edit state: mounts the Input (seeded with `draft`) when
   * editing begins, remounts on geometry/colour change, tears it down when done.
   */
  sync(editing: boolean, draft: string, spec: ExomuxSessionNameSpec): void {
    this.#field.sync(editing, draft, spec);
  }

  /** Routes a key to the Input (typing, cursor, backspace, Enter → submit). */
  handleKey(event: ExomuxSessionNameKey): void {
    this.#field.handleKey(event);
  }

  dispose(): void {
    this.#field.dispose();
  }
}
