// Copyright 2023 Im-Beast. MIT license.

// FRM-003: abortable asynchronous field and schema validators with revision
// guards. Async errors live beside the controller's synchronous errors (the
// sync `validate()` replaces its record wholesale, so the two must not share
// storage); every start bumps a per-scope revision and aborts the previous
// in-flight run, stale completions are discarded by revision comparison, and
// `settle()` — the submit gate — waits only for the revisions active at call
// time, reporting supersession instead of blocking on abandoned work.

import type { FieldName, FormController, FormValues } from "./forms.ts";

/** Context handed to every async validator run. */
export interface FormAsyncValidationContext {
  readonly signal: AbortSignal;
  readonly revision: number;
}

/** Validates one field value; resolves error messages (empty = valid). */
export type AsyncFieldValidator<TValues extends FormValues> = (
  value: unknown,
  values: TValues,
  context: FormAsyncValidationContext,
) => Promise<readonly string[]>;

/** Validates the whole form; resolves per-field error messages. */
export type AsyncSchemaValidator<TValues extends FormValues> = (
  values: TValues,
  context: FormAsyncValidationContext,
) => Promise<Readonly<Record<string, readonly string[]>>>;

/** Outcome of one settle() call. */
export interface FormAsyncSettleResult {
  /** All awaited runs completed clean (no errors, none superseded). */
  readonly valid: boolean;
  /** A newer revision started while settling; the result is not current. */
  readonly superseded: boolean;
  readonly errors: Readonly<Record<string, readonly string[]>>;
}

interface Scope<TValues extends FormValues> {
  validator: AsyncFieldValidator<TValues> | AsyncSchemaValidator<TValues>;
  readonly kind: "field" | "schema";
  revision: number;
  controller: AbortController | undefined;
  running: Promise<void> | undefined;
}

/**
 * Companion to a FormController: registers async validators per field (or one
 * schema-level validator), runs them with abort + revision guards, and gates
 * submission on the active revisions only.
 */
export class FormAsyncValidation<TValues extends FormValues> {
  readonly #form: FormController<TValues>;
  readonly #scopes = new Map<string, Scope<TValues>>();
  #errors: Record<string, readonly string[]> = {};
  #disposed = false;

  constructor(form: FormController<TValues>) {
    this.#form = form;
  }

  /** Registers a field validator; returns its disposer. */
  field(name: FieldName<TValues>, validator: AsyncFieldValidator<TValues>): () => void {
    return this.#register(String(name), { kind: "field", validator });
  }

  /** Registers the schema validator; returns its disposer. */
  schema(validator: AsyncSchemaValidator<TValues>): () => void {
    return this.#register("$schema", { kind: "schema", validator });
  }

  /**
   * Starts (or restarts) validation for one scope. The previous in-flight run
   * for the same scope is aborted; its completion, if it still arrives, is
   * discarded by the revision guard.
   */
  start(name?: FieldName<TValues>): void {
    if (this.#disposed) return;
    const keys = name === undefined ? [...this.#scopes.keys()] : [String(name), "$schema"];
    for (const key of keys) {
      const scope = this.#scopes.get(key);
      if (scope) this.#run(key, scope);
    }
  }

  /**
   * The submit gate: awaits exactly the revisions in flight at call time.
   * Runs started afterwards mark the result superseded rather than extending
   * the wait, so submit never blocks on abandoned or future work.
   */
  async settle(): Promise<FormAsyncSettleResult> {
    const awaited = [...this.#scopes.entries()]
      .filter(([, scope]) => scope.running)
      .map(([key, scope]) => ({ key, revision: scope.revision, running: scope.running! }));
    await Promise.all(awaited.map((entry) => entry.running));
    const superseded = awaited.some((entry) => (this.#scopes.get(entry.key)?.revision ?? -1) !== entry.revision);
    const errors = { ...this.#errors };
    const valid = !superseded && Object.values(errors).every((messages) => messages.length === 0);
    return { valid, superseded, errors };
  }

  /** Current async errors (field name → messages); empty arrays are pruned. */
  errors(): Readonly<Record<string, readonly string[]>> {
    return { ...this.#errors };
  }

  inspect(): { readonly scopes: number; readonly inFlight: number } {
    let inFlight = 0;
    for (const scope of this.#scopes.values()) if (scope.running) inFlight += 1;
    return { scopes: this.#scopes.size, inFlight };
  }

  dispose(): void {
    this.#disposed = true;
    for (const scope of this.#scopes.values()) scope.controller?.abort();
    this.#scopes.clear();
    this.#errors = {};
  }

  #register(
    key: string,
    entry: { kind: "field" | "schema"; validator: AsyncFieldValidator<TValues> | AsyncSchemaValidator<TValues> },
  ): () => void {
    if (this.#disposed) throw new Error("FormAsyncValidation is disposed");
    const existing = this.#scopes.get(key);
    existing?.controller?.abort();
    this.#scopes.set(key, {
      validator: entry.validator,
      kind: entry.kind,
      revision: existing?.revision ?? 0,
      controller: undefined,
      running: undefined,
    });
    return () => {
      const scope = this.#scopes.get(key);
      scope?.controller?.abort();
      this.#scopes.delete(key);
      delete this.#errors[key];
    };
  }

  #run(key: string, scope: Scope<TValues>): void {
    scope.controller?.abort();
    const controller = new AbortController();
    const revision = scope.revision + 1;
    scope.revision = revision;
    scope.controller = controller;
    const values = this.#form.values.peek();
    const context: FormAsyncValidationContext = { signal: controller.signal, revision };

    const execute = async (): Promise<void> => {
      try {
        if (scope.kind === "schema") {
          const result = await (scope.validator as AsyncSchemaValidator<TValues>)(values, context);
          if (this.#stale(key, revision)) return;
          for (const [field, messages] of Object.entries(result)) {
            if (messages.length > 0) this.#errors[field] = [...messages];
            else delete this.#errors[field];
          }
        } else {
          const value = readPathValue(values, key);
          const messages = await (scope.validator as AsyncFieldValidator<TValues>)(value, values, context);
          if (this.#stale(key, revision)) return;
          if (messages.length > 0) this.#errors[key] = [...messages];
          else delete this.#errors[key];
        }
      } catch (error) {
        if (this.#stale(key, revision) || controller.signal.aborted) return;
        this.#errors[key] = [error instanceof Error ? error.message : String(error)];
      } finally {
        const current = this.#scopes.get(key);
        if (current && current.revision === revision) current.running = undefined;
      }
    };
    scope.running = execute();
  }

  #stale(key: string, revision: number): boolean {
    return this.#disposed || (this.#scopes.get(key)?.revision ?? -1) !== revision;
  }
}

function readPathValue(values: object, path: string): unknown {
  let current: unknown = values;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Creates the async-validation companion for a form controller. */
export function createFormAsyncValidation<TValues extends FormValues>(
  form: FormController<TValues>,
): FormAsyncValidation<TValues> {
  return new FormAsyncValidation(form);
}
