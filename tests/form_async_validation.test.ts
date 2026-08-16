// Copyright 2023 Im-Beast. MIT license.

// FRM-003: abortable async field/schema validators with revision guards —
// stale completions cannot overwrite newer results, restarts abort the
// previous run, and settle() waits only for the revisions active at call time.

import { assert, assertEquals } from "./deps.ts";
import { createFormAsyncValidation, FormController } from "../mod.ts";

interface Values extends Record<string, unknown> {
  username: string;
  email: string;
}

function fixture() {
  const form = new FormController<Values>([
    { name: "username", initialValue: "cos" },
    { name: "email", initialValue: "cos@example.com" },
  ]);
  return { form, async: createFormAsyncValidation(form) };
}

Deno.test("async field validation applies results and clears on success", async () => {
  const { form, async } = fixture();
  async.field("username", (value) => Promise.resolve(value === "taken" ? ["username is taken"] : []));

  form.setValue("username", "taken");
  async.start("username");
  let result = await async.settle();
  assertEquals(result, { valid: false, superseded: false, errors: { username: ["username is taken"] } });

  form.setValue("username", "free");
  async.start("username");
  result = await async.settle();
  assertEquals(result, { valid: true, superseded: false, errors: {} });
});

Deno.test("a restart aborts the previous run and its stale completion is discarded", async () => {
  const { form, async } = fixture();
  const aborted: number[] = [];
  const resolvers: Array<(value: readonly string[]) => void> = [];
  async.field("username", (_value, _values, context) => {
    context.signal.addEventListener("abort", () => aborted.push(context.revision));
    return new Promise((resolve) => resolvers.push(resolve));
  });

  form.setValue("username", "first");
  async.start("username");
  form.setValue("username", "second");
  async.start("username"); // aborts revision 1
  assertEquals(aborted, [1]);
  assertEquals(async.inspect().inFlight, 1);

  // The stale (aborted) run completes with an error — it must be discarded.
  resolvers[0]!(["stale error from revision 1"]);
  // The active run completes clean.
  resolvers[1]!([]);
  const result = await async.settle();
  assertEquals(result, { valid: true, superseded: false, errors: {} });
});

Deno.test("settle reports supersession instead of waiting for newer revisions", async () => {
  const { async } = fixture();
  const resolvers: Array<(value: readonly string[]) => void> = [];
  async.field("email", () => new Promise((resolve) => resolvers.push(resolve)));

  async.start("email");
  const pending = async.settle();
  // A newer revision starts while settle() is waiting on revision 1.
  async.start("email");
  resolvers[0]!([]);
  resolvers[1]!([]);
  const result = await pending;
  assert(result.superseded);
  assertEquals(result.valid, false);
});

Deno.test("schema validators map fields, rejections become errors, dispose aborts", async () => {
  const { async } = fixture();
  async.schema(() => Promise.resolve({ email: ["domain unreachable"], username: [] }));
  async.start();
  const result = await async.settle();
  assertEquals(result.errors, { email: ["domain unreachable"] });

  const { async: failing } = fixture();
  failing.field("username", () => Promise.reject(new Error("validator crashed")));
  failing.start("username");
  const failed = await failing.settle();
  assertEquals(failed.errors, { username: ["validator crashed"] });

  const { async: disposable } = fixture();
  let sawAbort = false;
  disposable.field("username", (_v, _a, context) => {
    context.signal.addEventListener("abort", () => sawAbort = true);
    return new Promise(() => {});
  });
  disposable.start("username");
  disposable.dispose();
  assert(sawAbort);
  assertEquals(disposable.inspect(), { scopes: 0, inFlight: 0 });
});
