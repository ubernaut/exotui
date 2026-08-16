// Copyright 2023 Im-Beast. MIT license.

// FRM-005: per-field validation timing. Each field declares WHEN it
// validates — on every change, on blur, after an idle pause, only at submit,
// or only manually — and the scheduler runs entirely on a caller-owned clock:
// events carry `nowMs`, idle deadlines fire from `advance(nowMs)`, and every
// validation run lands in a bounded journal, so a fake-clock test observes
// exactly the configured schedule and nothing else.

import type { FormController, FormValues } from "./forms.ts";
import type { FieldName } from "./forms.ts";
import type { FormAsyncValidation } from "./form_async_validation.ts";

/** When a field validates. */
export type FormValidationTiming = "change" | "blur" | "idle" | "submit" | "manual";

/** One recorded validation run. */
export interface FormValidationRun {
  readonly field: string;
  readonly trigger: "change" | "blur" | "idle" | "submit" | "manual";
  readonly at: number;
}

/** Options for the scheduler. */
export interface FormValidationSchedulerOptions {
  /** Idle pause before an `idle` field validates (default 400ms). */
  readonly idleMs?: number;
}

const DEFAULT_IDLE_MS = 400;
const MAX_RUNS = 256;

/**
 * Drives a form's validation according to per-field timing policies. The
 * scheduler owns no timers: the host reports events and clock progress.
 */
export class FormValidationScheduler<TValues extends FormValues> {
  readonly #form: FormController<TValues>;
  readonly #async: FormAsyncValidation<TValues> | undefined;
  readonly #idleMs: number;
  readonly #policies = new Map<string, FormValidationTiming>();
  readonly #idleDeadlines = new Map<string, number>();
  #runs: FormValidationRun[] = [];

  constructor(
    form: FormController<TValues>,
    options: FormValidationSchedulerOptions & { readonly async?: FormAsyncValidation<TValues> } = {},
  ) {
    this.#form = form;
    this.#async = options.async;
    this.#idleMs = Math.max(0, options.idleMs ?? DEFAULT_IDLE_MS);
  }

  /** Declares a field's timing policy (default for undeclared fields: "change"). */
  policy(name: FieldName<TValues>, timing: FormValidationTiming): void {
    this.#policies.set(String(name), timing);
  }

  /** The host reports a value change. */
  onChange(name: FieldName<TValues>, nowMs: number): void {
    const key = String(name);
    switch (this.#policyOf(key)) {
      case "change":
        this.#validate(key, "change", nowMs);
        break;
      case "idle":
        // Every keystroke pushes the deadline out; only a real pause fires.
        this.#idleDeadlines.set(key, nowMs + this.#idleMs);
        break;
      default:
        break;
    }
  }

  /** The host reports focus leaving the field. */
  onBlur(name: FieldName<TValues>, nowMs: number): void {
    const key = String(name);
    const policy = this.#policyOf(key);
    if (policy === "blur") this.#validate(key, "blur", nowMs);
    // Leaving an idle field validates immediately: the pause ended with intent.
    if (policy === "idle" && this.#idleDeadlines.delete(key)) this.#validate(key, "idle", nowMs);
  }

  /** The host reports submit: every field validates except manual ones. */
  onSubmit(nowMs: number): void {
    this.#idleDeadlines.clear();
    for (const [key, policy] of this.#policies) {
      if (policy === "manual") continue;
      this.#validate(key, "submit", nowMs);
    }
  }

  /** Advances the caller's clock; fires idle deadlines that have passed. */
  advance(nowMs: number): void {
    for (const [key, deadline] of [...this.#idleDeadlines]) {
      if (nowMs < deadline) continue;
      this.#idleDeadlines.delete(key);
      this.#validate(key, "idle", nowMs);
    }
  }

  /** Manual validation, allowed for every policy. */
  validateNow(name: FieldName<TValues>, nowMs: number): void {
    this.#validate(String(name), "manual", nowMs);
  }

  /** The bounded run journal, oldest first — the observable schedule. */
  runs(): readonly FormValidationRun[] {
    return [...this.#runs];
  }

  inspect(): { readonly pendingIdle: number; readonly policies: number } {
    return { pendingIdle: this.#idleDeadlines.size, policies: this.#policies.size };
  }

  #policyOf(key: string): FormValidationTiming {
    return this.#policies.get(key) ?? "change";
  }

  #validate(key: string, trigger: FormValidationRun["trigger"], at: number): void {
    this.#form.validateField(key as FieldName<TValues>);
    this.#async?.start(key as FieldName<TValues>);
    if (this.#runs.length >= MAX_RUNS) this.#runs.shift();
    this.#runs.push(Object.freeze({ field: key, trigger, at }));
  }
}

/** Creates a validation scheduler for a form. */
export function createFormValidationScheduler<TValues extends FormValues>(
  form: FormController<TValues>,
  options: FormValidationSchedulerOptions & { readonly async?: FormAsyncValidation<TValues> } = {},
): FormValidationScheduler<TValues> {
  return new FormValidationScheduler(form, options);
}
