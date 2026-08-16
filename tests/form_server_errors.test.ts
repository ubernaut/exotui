// Copyright 2023 Im-Beast. MIT license.

// FRM-007: structured server errors map to fields, groups, and the form
// summary with unknown errors preserved; focus-next-error walks enabled
// fields in deterministic registration order with wrap-around.

import { assertEquals } from "./deps.ts";
import { focusNextFormError, FormController, mapFormServerErrors } from "../mod.ts";

interface Values extends Record<string, unknown> {
  username: string;
  email: string;
  age: number;
  notes: string;
}

function fixture(disabledEmail = false) {
  return new FormController<Values>([
    { name: "username", initialValue: "cos", group: "account" },
    { name: "email", initialValue: "cos@example.com", group: "account", disabled: disabledEmail },
    { name: "age", initialValue: 30, group: "profile" },
    { name: "notes", initialValue: "" },
  ]);
}

const PAYLOAD = [
  { path: "email", message: "email already registered" },
  { path: "age", message: "age must be verified" },
  { group: "account", message: "account is locked" },
  { message: "service degraded" },
  { path: "legacy_field", message: "unknown path from an older API" },
];

Deno.test("server errors map to fields, groups, and form level; unknown are preserved", () => {
  const form = fixture();
  const mapping = mapFormServerErrors(form, PAYLOAD);
  assertEquals(mapping.fieldErrors, { email: ["email already registered"], age: ["age must be verified"] });
  assertEquals(mapping.groupErrors, { account: ["account is locked"] });
  assertEquals(mapping.formErrors, ["service degraded"]);
  assertEquals(mapping.unknown, [{ path: "legacy_field", message: "unknown path from an older API" }]);
});

Deno.test("focus-next-error visits enabled fields in order and wraps around", () => {
  const form = fixture();
  const mapping = mapFormServerErrors(form, PAYLOAD);
  assertEquals(focusNextFormError(form, mapping), { field: "email", formLevel: false });
  assertEquals(focusNextFormError(form, mapping, "email"), { field: "age", formLevel: false });
  assertEquals(focusNextFormError(form, mapping, "age"), { field: "email", formLevel: false }); // wraps
});

Deno.test("disabled fields are skipped and the form-level fallback holds", () => {
  const disabled = fixture(true);
  const mapping = mapFormServerErrors(disabled, PAYLOAD);
  // email is disabled: age is the only visitable error field.
  assertEquals(focusNextFormError(disabled, mapping), { field: "age", formLevel: false });
  assertEquals(focusNextFormError(disabled, mapping, "age"), { field: "age", formLevel: false });

  // Only form-level and unknown errors: fall back to the form summary.
  const formOnly = mapFormServerErrors(disabled, [{ message: "maintenance window" }]);
  assertEquals(focusNextFormError(disabled, formOnly), { formLevel: true });
  const nothing = mapFormServerErrors(disabled, []);
  assertEquals(focusNextFormError(disabled, nothing), { formLevel: false });
});
