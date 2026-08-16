// Copyright 2023 Im-Beast. MIT license.

// FRM-009: undo/redo coalescing tuned to how forms are edited. Typing
// coalesces: keystrokes on the same field within the burst window merge
// into one checkpoint, so a typing burst undoes coherently in one step.
// Paste and structural (field-array) edits are always atomic checkpoints of
// their own AND break any running burst — they never melt into surrounding
// keystrokes. History is linear here (branching lives in HIS-005): a new
// edit truncates the redo tail.

/** How an edit was made. */
export type FormEditKind = "typing" | "paste" | "structural";

interface Checkpoint<T> {
  readonly value: T;
  readonly kind: FormEditKind | "initial";
  readonly field?: string;
  readonly at: number;
}

/** Options for the history. */
export interface FormCheckpointOptions {
  /** Same-field keystrokes within this window coalesce (default 750ms). */
  readonly typingCoalesceMs?: number;
  /** Checkpoint cap (default 128). */
  readonly maxCheckpoints?: number;
}

/** The form checkpoint history. */
export class FormCheckpointHistory<T> {
  readonly #options: FormCheckpointOptions;
  #checkpoints: Checkpoint<T>[];
  #cursor = 0;

  constructor(initial: T, options: FormCheckpointOptions = {}) {
    this.#options = options;
    this.#checkpoints = [{ value: initial, kind: "initial", at: 0 }];
  }

  get value(): T {
    return this.#checkpoints[this.#cursor]!.value;
  }

  /** Records an edit; typing may coalesce, paste/structural never do. */
  record(value: T, edit: { readonly kind: FormEditKind; readonly field?: string; readonly at: number }): void {
    // Any new edit truncates the redo tail.
    this.#checkpoints = this.#checkpoints.slice(0, this.#cursor + 1);
    const top = this.#checkpoints[this.#cursor]!;
    const window = this.#options.typingCoalesceMs ?? 750;
    const coalesces = edit.kind === "typing" && top.kind === "typing" && top.field === edit.field &&
      edit.at - top.at <= window;
    if (coalesces) {
      // The burst stays one checkpoint; only its latest value and time move.
      this.#checkpoints[this.#cursor] = { value, kind: "typing", field: edit.field, at: edit.at };
      return;
    }
    this.#checkpoints.push({ value, kind: edit.kind, field: edit.field, at: edit.at });
    this.#cursor += 1;
    const max = Math.max(2, this.#options.maxCheckpoints ?? 128);
    while (this.#checkpoints.length > max) {
      this.#checkpoints.shift();
      this.#cursor -= 1;
    }
  }

  undo(): T | undefined {
    if (this.#cursor === 0) return undefined;
    this.#cursor -= 1;
    return this.value;
  }

  redo(): T | undefined {
    if (this.#cursor >= this.#checkpoints.length - 1) return undefined;
    this.#cursor += 1;
    return this.value;
  }

  inspect(): { readonly checkpoints: number; readonly cursor: number } {
    return { checkpoints: this.#checkpoints.length, cursor: this.#cursor };
  }
}

/** Creates a form checkpoint history. */
export function createFormCheckpointHistory<T>(
  initial: T,
  options: FormCheckpointOptions = {},
): FormCheckpointHistory<T> {
  return new FormCheckpointHistory(initial, options);
}
