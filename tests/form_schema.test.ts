// Copyright 2023 Im-Beast. MIT license.

// FRM-010: a bounded JSON Schema subset renders through an overridable
// widget registry with source-located diagnostics for unsupported
// vocabulary, and validation matches the same subset exactly.

import { assert, assertEquals } from "./deps.ts";
import { renderJsonSchemaForm, validateAgainstSchema } from "../mod.ts";

const SCHEMA = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", title: "Full name", minLength: 2 },
    age: { type: "integer", minimum: 0, maximum: 150 },
    role: { type: "string", enum: ["admin", "viewer"] },
    active: { type: "boolean" },
    profile: {
      type: "object",
      required: ["email"],
      properties: { email: { type: "string", pattern: "@" } },
    },
  },
} as const;

Deno.test("rendering maps types to widgets with nested paths and required flags", () => {
  const { fields, diagnostics } = renderJsonSchemaForm(SCHEMA);
  assertEquals(diagnostics, []);
  assertEquals(
    fields.map((field) => `${field.path}:${field.widget}${field.required ? "!" : ""}`),
    ["name:input!", "age:number-input", "role:select", "active:checkbox", "profile.email:input!"],
  );
  assertEquals(fields[0]!.label, "Full name");
  assertEquals(fields[2]!.options, ["admin", "viewer"]);

  // The registry is overridable: a custom resolver wins, others defer.
  const custom = renderJsonSchemaForm(SCHEMA, {
    resolveWidget: (schema) => schema["title"] === "Full name" ? "fancy-input" : undefined,
  });
  assertEquals(custom.fields[0]!.widget, "fancy-input");
  assertEquals(custom.fields[3]!.widget, "checkbox");
});

Deno.test("unsupported vocabulary emits source-located diagnostics", () => {
  const { fields, diagnostics } = renderJsonSchemaForm({
    type: "object",
    properties: {
      choice: { oneOf: [{ type: "string" }] },
      list: { type: "array" },
      linked: { $ref: "#/defs/x" },
    },
  });
  assertEquals(fields, []);
  assertEquals(diagnostics.map((entry) => `${entry.location}:${entry.keyword}`).sort(), [
    "#/properties/choice/oneOf:oneOf",
    "#/properties/choice/type:type",
    "#/properties/linked/$ref:$ref",
    "#/properties/linked/type:type",
    "#/properties/list/type:array",
  ]);
});

Deno.test("validation matches the rendered constraints exactly", () => {
  const good = validateAgainstSchema(SCHEMA, {
    name: "Cos",
    age: 30,
    role: "admin",
    active: true,
    profile: { email: "cos@example.com" },
  });
  assertEquals(good, { valid: true, errors: [] });

  const bad = validateAgainstSchema(SCHEMA, {
    age: 200.5,
    role: "root",
    profile: { email: "no-at-sign" },
  });
  const keywords = bad.errors.map((error) => `${error.path}:${error.keyword}`).sort();
  assertEquals(keywords, [
    "age:integer",
    "age:maximum",
    "name:required",
    "profile.email:pattern",
    "role:enum",
  ]);
  assert(!bad.valid);
});
