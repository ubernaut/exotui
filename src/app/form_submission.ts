// Copyright 2023 Im-Beast. MIT license.

// FRM-006: the submission state machine. One machine owns a form's submit
// lifecycle — validating (sync, then the FRM-003 async gate), submitting,
// succeeded, failed, cancelled — with double-submit prevention (an in-flight
// submit rejects new ones without touching state), cancellation that aborts
// the handler and restores a submittable state, and resubmission counted by
// attempt. Every transition lands in a bounded journal with its reason.

import { Signal } from "../signals/mod.ts";
import type { FormController, FormValues } from "./forms.ts";
import type { FormAsyncValidation } from "./form_async_validation.ts";

/** The machine's states. */
export type FormSubmissionState =
  | "idle"
  | "validating"
  | "submitting"
  | "succeeded"
  | "failed"
  | "cancelled";

/** One recorded transition. */
export interface FormSubmissionTransition {
  readonly from: FormSubmissionState;
  readonly to: FormSubmissionState;
  readonly reason: string;
  readonly attempt: number;
}

/** Result of one submit() call. */
export interface FormSubmissionOutcome {
  readonly submitted: boolean;
  readonly state: FormSubmissionState;
  readonly reason: string;
}

/** The submit handler; the signal aborts on cancel(). */
export type FormSubmitHandler<TValues extends FormValues> = (
  values: TValues,
  signal: AbortSignal,
) => Promise<void> | void;

const MAX_TRANSITIONS = 128;
const SUBMITTABLE: readonly FormSubmissionState[] = ["idle", "succeeded", "failed", "cancelled"];

/**
 * Submission lifecycle for one form. `state` is a signal so UI can react;
 * all transitions run through one recorded path.
 */
export class FormSubmissionMachine<TValues extends FormValues> {
  readonly state = new Signal<FormSubmissionState>("idle");
  readonly #form: FormController<TValues>;
  readonly #async: FormAsyncValidation<TValues> | undefined;
  #transitions: FormSubmissionTransition[] = [];
  #attempt = 0;
  #controller: AbortController | undefined;

  constructor(form: FormController<TValues>, options: { readonly async?: FormAsyncValidation<TValues> } = {}) {
    this.#form = form;
    this.#async = options.async;
  }

  /**
   * Runs one submission. A submit while one is in flight is refused without
   * a state change — that is the double-submit guard, not an error.
   */
  async submit(onSubmit: FormSubmitHandler<TValues>): Promise<FormSubmissionOutcome> {
    const current = this.state.peek();
    if (!SUBMITTABLE.includes(current)) {
      return { submitted: false, state: current, reason: "in-flight" };
    }
    this.#attempt += 1;
    const resubmit = current === "succeeded" || current === "failed" || current === "cancelled";
    const controller = new AbortController();
    this.#controller = controller;
    this.#transition("validating", resubmit ? "resubmit" : "submit");

    if (!this.#form.validate()) {
      this.#transition("failed", "sync-validation");
      return { submitted: false, state: "failed", reason: "sync-validation" };
    }
    if (this.#async) {
      this.#async.start();
      const settled = await this.#async.settle();
      if (controller.signal.aborted) return this.#cancelOutcome();
      if (!settled.valid) {
        const reason = settled.superseded ? "superseded" : "async-validation";
        this.#transition("failed", reason);
        return { submitted: false, state: "failed", reason };
      }
    }
    if (controller.signal.aborted) return this.#cancelOutcome();

    this.#transition("submitting", "validated");
    try {
      await onSubmit(this.#form.values.peek(), controller.signal);
      if (controller.signal.aborted) return this.#cancelOutcome();
      this.#transition("succeeded", "handler-resolved");
      return { submitted: true, state: "succeeded", reason: "handler-resolved" };
    } catch (error) {
      if (controller.signal.aborted) return this.#cancelOutcome();
      const reason = error instanceof Error ? error.message : String(error);
      this.#transition("failed", reason);
      return { submitted: false, state: "failed", reason };
    } finally {
      if (this.#controller === controller) this.#controller = undefined;
    }
  }

  /** Aborts the in-flight submission; the machine becomes submittable again. */
  cancel(): boolean {
    const inFlight = this.state.peek() === "validating" || this.state.peek() === "submitting";
    if (!inFlight || !this.#controller) return false;
    this.#controller.abort();
    this.#transition("cancelled", "cancel");
    return true;
  }

  /** The bounded transition journal, oldest first. */
  transitions(): readonly FormSubmissionTransition[] {
    return [...this.#transitions];
  }

  inspect(): { readonly state: FormSubmissionState; readonly attempt: number; readonly submittable: boolean } {
    const state = this.state.peek();
    return { state, attempt: this.#attempt, submittable: SUBMITTABLE.includes(state) };
  }

  #transition(to: FormSubmissionState, reason: string): void {
    const from = this.state.peek();
    if (this.#transitions.length >= MAX_TRANSITIONS) this.#transitions.shift();
    this.#transitions.push(Object.freeze({ from, to, reason, attempt: this.#attempt }));
    this.state.value = to;
  }

  #cancelOutcome(): FormSubmissionOutcome {
    // cancel() already transitioned; the interrupted flow just reports it.
    return { submitted: false, state: "cancelled", reason: "cancel" };
  }
}

/** Creates a submission machine for a form. */
export function createFormSubmissionMachine<TValues extends FormValues>(
  form: FormController<TValues>,
  options: { readonly async?: FormAsyncValidation<TValues> } = {},
): FormSubmissionMachine<TValues> {
  return new FormSubmissionMachine(form, options);
}
