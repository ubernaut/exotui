// Copyright 2023 Im-Beast. MIT license.

// FRM-006: submission state machine — validating/submitting/succeeded/
// failed/cancelled with double-submit prevention, inspectable transitions,
// and cancellation that restores a submittable state.

import { assert, assertEquals } from "./deps.ts";
import { createFormAsyncValidation, createFormSubmissionMachine, FormController } from "../mod.ts";

interface Values extends Record<string, unknown> {
  username: string;
}

function fixture(validator?: (value: unknown) => string | undefined) {
  const form = new FormController<Values>([
    { name: "username", initialValue: "cos", validators: validator ? [(value) => validator(value)] : [] },
  ]);
  return { form, machine: createFormSubmissionMachine(form) };
}

Deno.test("a clean submit walks validating, submitting, succeeded", async () => {
  const { machine } = fixture();
  const outcome = await machine.submit(() => Promise.resolve());
  assertEquals(outcome, { submitted: true, state: "succeeded", reason: "handler-resolved" });
  assertEquals(machine.transitions().map((t) => `${t.from}>${t.to}`), [
    "idle>validating",
    "validating>submitting",
    "submitting>succeeded",
  ]);
  assertEquals(machine.inspect(), { state: "succeeded", attempt: 1, submittable: true });
});

Deno.test("double submit is refused while in flight; resubmit counts attempts", async () => {
  const { machine } = fixture();
  let release!: () => void;
  const first = machine.submit(() => new Promise((resolve) => release = resolve));
  const second = await machine.submit(() => Promise.resolve());
  assertEquals(second, { submitted: false, state: "submitting", reason: "in-flight" });

  release();
  await first;
  const third = await machine.submit(() => Promise.resolve());
  assert(third.submitted);
  assertEquals(machine.inspect().attempt, 2);
  const resubmitEntry = machine.transitions().find((t) => t.reason === "resubmit");
  assertEquals(resubmitEntry?.attempt, 2);
});

Deno.test("sync and async validation failures land in failed, not submitting", async () => {
  const { machine } = fixture((value) => value === "" ? "required" : undefined);
  const { form } = fixture();
  form.setValue("username", "");

  const invalid = fixture((value) => value === "" ? "required" : undefined);
  invalid.form.setValue("username", "");
  const failed = await invalid.machine.submit(() => Promise.resolve());
  assertEquals(failed, { submitted: false, state: "failed", reason: "sync-validation" });

  const asyncForm = new FormController<Values>([{ name: "username", initialValue: "taken" }]);
  const asyncValidation = createFormAsyncValidation(asyncForm);
  asyncValidation.field("username", (value) => Promise.resolve(value === "taken" ? ["taken"] : []));
  const asyncMachine = createFormSubmissionMachine(asyncForm, { async: asyncValidation });
  const asyncFailed = await asyncMachine.submit(() => Promise.resolve());
  assertEquals(asyncFailed, { submitted: false, state: "failed", reason: "async-validation" });
  assert(!asyncMachine.transitions().some((t) => t.to === "submitting"));
  void machine;
});

Deno.test("cancellation aborts the handler and restores a submittable state", async () => {
  const { machine } = fixture();
  let sawAbort = false;
  const pending = machine.submit((_values, signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        sawAbort = true;
        reject(new Error("aborted"));
      });
    })
  );
  assert(machine.cancel());
  const outcome = await pending;
  assert(sawAbort);
  assertEquals(outcome, { submitted: false, state: "cancelled", reason: "cancel" });
  assertEquals(machine.inspect().submittable, true);

  const retry = await machine.submit(() => Promise.resolve());
  assert(retry.submitted);
  assertEquals(machine.cancel(), false); // nothing in flight
});
